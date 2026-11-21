import os
import hashlib
import json
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from app.models.entities import Media, File, Source, Thumbnail
from app.services.curation_heuristics import score_path_quality
from app.services.ai_provider import run_ai_json, AIProviderError, AIQuotaExceeded

def _normalize_folder(path: str) -> str:
    if not path:
        return "."
    d = os.path.dirname(path.replace("\\", "/")).strip("/")
    return d if d else "."

def compute_folder_pairs(
    db: Session,
    user_id: str,
    source_id: Optional[str] = None,
    limit: int = 30
) -> List[Dict[str, Any]]:
    """
    Identifies folder pairs on the same disk sharing exact duplicate files.
    """
    # 1. Query media with >= 2 active files on the same source
    subq = db.query(
        File.media_id.label("media_id"),
        File.source_id.label("source_id"),
        func.count(File.id).label("copies_on_source")
    ).join(Media, File.media_id == Media.id).filter(
        Media.user_id == user_id,
        File.availability_status.notin_(("missing", "trashed"))
    )
    if source_id:
        subq = subq.filter(File.source_id == source_id)

    subq = subq.group_by(File.media_id, File.source_id).having(func.count(File.id) >= 2).subquery()

    target_media_sources = db.query(subq.c.media_id, subq.c.source_id).all()
    if not target_media_sources:
        return []

    target_media_ids = list({row[0] for row in target_media_sources})

    # Fetch active files for these media
    query = db.query(File, Source.name).join(Source, File.source_id == Source.id).filter(
        File.media_id.in_(target_media_ids),
        File.availability_status.notin_(("missing", "trashed"))
    )
    if source_id:
        query = query.filter(File.source_id == source_id)

    files_with_sources = query.all()

    # Precalculate total files per (source_id, folder)
    # Group files by (media_id, source_id)
    by_media_source: Dict[Tuple[str, str], List[Tuple[File, str]]] = {}
    source_names: Dict[str, str] = {}
    for f, s_name in files_with_sources:
        source_names[f.source_id] = s_name
        by_media_source.setdefault((f.media_id, f.source_id), []).append((f, s_name))

    # Calculate folder pair overlaps
    # key: (source_id, min_dir, max_dir)
    pair_stats: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for (m_id, s_id), f_list in by_media_source.items():
        if len(f_list) < 2:
            continue
        # Get unique folders for this media on this source
        folders = {_normalize_folder(f.relative_path) for f, _ in f_list}
        if len(folders) < 2:
            continue

        folder_list = sorted(list(folders))
        # Unique size for this media
        size = f_list[0][0].size_bytes

        for i in range(len(folder_list)):
            for j in range(i + 1, len(folder_list)):
                dir_a = folder_list[i]
                dir_b = folder_list[j]
                pair_key = (s_id, dir_a, dir_b)
                if pair_key not in pair_stats:
                    pair_stats[pair_key] = {
                        "shared_media_count": 0,
                        "shared_bytes": 0
                    }
                pair_stats[pair_key]["shared_media_count"] += 1
                pair_stats[pair_key]["shared_bytes"] += size

    if not pair_stats:
        return []

    # Count total active files in relevant (source_id, folder)
    # We query all active files for the sources present in pairs
    distinct_sources = list({k[0] for k in pair_stats.keys()})
    all_source_files = db.query(File.source_id, File.relative_path).filter(
        File.source_id.in_(distinct_sources),
        File.availability_status.notin_(("missing", "trashed"))
    ).all()

    folder_counts: Dict[Tuple[str, str], int] = {}
    for s_id, rel_path in all_source_files:
        f_dir = _normalize_folder(rel_path)
        folder_counts[(s_id, f_dir)] = folder_counts.get((s_id, f_dir), 0) + 1

    # Build pair result items
    results = []
    for (s_id, dir_a, dir_b), stats in pair_stats.items():
        pair_id = hashlib.sha1(f"{s_id}|{dir_a}|{dir_b}".encode("utf-8")).hexdigest()[:12]
        score_a, _ = score_path_quality(f"{dir_a}/sample.jpg" if dir_a != "." else "sample.jpg")
        score_b, _ = score_path_quality(f"{dir_b}/sample.jpg" if dir_b != "." else "sample.jpg")

        count_a = folder_counts.get((s_id, dir_a), 0)
        count_b = folder_counts.get((s_id, dir_b), 0)

        results.append({
            "pair_id": pair_id,
            "source_id": s_id,
            "source_name": source_names.get(s_id, "Sorgente"),
            "dir_a": {
                "path": dir_a,
                "total_files": count_a,
                "path_score": score_a
            },
            "dir_b": {
                "path": dir_b,
                "total_files": count_b,
                "path_score": score_b
            },
            "shared_media_count": stats["shared_media_count"],
            "shared_bytes": stats["shared_bytes"]
        })

    # Sort by shared_bytes desc, truncate to limit
    results.sort(key=lambda x: x["shared_bytes"], reverse=True)
    return results[:limit]

def heuristic_folder_rules(pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generates rule proposals for folder pairs based on local path scores.
    """
    rules = []
    for pair in pairs:
        dir_a = pair["dir_a"]
        dir_b = pair["dir_b"]

        score_a = dir_a["path_score"]
        score_b = dir_b["path_score"]

        # Decision order: higher path_score -> more total_files -> shorter path -> dir_a
        if score_a > score_b:
            keep = dir_a["path"]
            trash = dir_b["path"]
        elif score_b > score_a:
            keep = dir_b["path"]
            trash = dir_a["path"]
        else:
            if dir_a["total_files"] > dir_b["total_files"]:
                keep = dir_a["path"]
                trash = dir_b["path"]
            elif dir_b["total_files"] > dir_a["total_files"]:
                keep = dir_b["path"]
                trash = dir_a["path"]
            else:
                if len(dir_a["path"]) <= len(dir_b["path"]):
                    keep = dir_a["path"]
                    trash = dir_b["path"]
                else:
                    keep = dir_b["path"]
                    trash = dir_a["path"]

        score_diff = abs(score_a - score_b)
        confidence = max(0.3, min(0.9, round(score_diff / 50.0, 2)))
        if score_diff < 5:
            confidence = 0.3
            rationale = "Cartelle equivalenti: verifica manuale consigliata"
        else:
            rationale = f"Conserva la cartella con organizzazione migliore (+{score_diff} punti)"

        rules.append({
            "pair_id": pair["pair_id"],
            "keep_folder": keep,
            "trash_folder": trash,
            "rationale": rationale,
            "confidence": confidence,
            "engine": "heuristic"
        })
    return rules

def ai_folder_rules(
    db: Session,
    user_id: str,
    pairs: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], str, Optional[str]]:
    """
    Optionally calls AI to generate cleaner human-like rationale and picks.
    Strictly validates pair_id and folder choices against the input pairs.
    """
    if not pairs:
        return [], "heuristic", None

    heuristic_rules_map = {r["pair_id"]: r for r in heuristic_folder_rules(pairs)}
    pair_map = {p["pair_id"]: p for p in pairs}

    system_prompt = (
        "Sei un archivista fotografico esperto. Il tuo compito è aiutare l'utente a ripulire i duplicati "
        "sullo stesso disco proponendo quale cartella tenere e quale spostare in .pmm_trash. "
        "Mantieni la cartella meglio organizzata (nomi descrittivi, date, eventi) e proponi per il cestino "
        "le cartelle temporanee, discarica (Downloads, Desktop, DCIM non organizzato) o copie. "
        "Non inventare cartelle o pair_id. Usa solo i pair_id forniti. "
        "Se incerto usa confidence bassa (0.3). Non suggerire mai di eliminare entrambe."
    )

    compact_pairs = []
    for p in pairs:
        compact_pairs.append({
            "pair_id": p["pair_id"],
            "folder_a": p["dir_a"]["path"],
            "score_a": p["dir_a"]["path_score"],
            "files_a": p["dir_a"]["total_files"],
            "folder_b": p["dir_b"]["path"],
            "score_b": p["dir_b"]["path_score"],
            "files_b": p["dir_b"]["total_files"],
            "shared_duplicates": p["shared_media_count"],
            "shared_bytes": p["shared_bytes"]
        })

    user_prompt = f"Analizza queste coppie di cartelle e produci le regole di pulizia:\n{json.dumps(compact_pairs, ensure_ascii=False)}"

    schema = {
        "type": "object",
        "properties": {
            "rules": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "pair_id": {"type": "string"},
                        "keep_folder": {"type": "string"},
                        "trash_folder": {"type": "string"},
                        "rationale": {"type": "string"},
                        "confidence": {"type": "number"}
                    },
                    "required": ["pair_id", "keep_folder", "trash_folder", "rationale", "confidence"]
                }
            }
        },
        "required": ["rules"]
    }

    try:
        ai_res = run_ai_json(
            db=db,
            user_id=user_id,
            feature="folder_advisor",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema
        )
    except Exception as e:
        return list(heuristic_rules_map.values()), "heuristic", str(e)

    if not ai_res or not isinstance(ai_res.data, dict) or "rules" not in ai_res.data:
        return list(heuristic_rules_map.values()), "heuristic", None

    raw_ai_rules = ai_res.data.get("rules", [])
    final_rules: List[Dict[str, Any]] = []
    valid_ai_count = 0

    for r in raw_ai_rules:
        pid = r.get("pair_id")
        if pid not in pair_map:
            continue
        p = pair_map[pid]
        expected_set = {p["dir_a"]["path"], p["dir_b"]["path"]}
        got_set = {r.get("keep_folder"), r.get("trash_folder")}
        if expected_set != got_set:
            continue

        conf = float(r.get("confidence", 0.5))
        conf = max(0.0, min(1.0, conf))

        final_rules.append({
            "pair_id": pid,
            "keep_folder": r["keep_folder"],
            "trash_folder": r["trash_folder"],
            "rationale": r.get("rationale", "Suggerimento AI"),
            "confidence": conf,
            "engine": ai_res.provider or "ai"
        })
        valid_ai_count += 1

    # Fill in any missing pairs with heuristic rules
    handled_pairs = {r["pair_id"] for r in final_rules}
    for pid, h_rule in heuristic_rules_map.items():
        if pid not in handled_pairs:
            final_rules.append(h_rule)

    engine_used = ai_res.provider if valid_ai_count > 0 else "heuristic"
    return final_rules, engine_used, None

def expand_folder_rule(
    db: Session,
    user_id: str,
    source_id: str,
    keep_folder: str,
    trash_folder: str
) -> Dict[str, Any]:
    """
    Expands a folder rule into concrete file_ids to trash and keep_file_ids to preserve.
    Guarantees no media is orphaned: only trashes a file if an active copy in keep_folder exists.
    """
    source = db.query(Source).filter(Source.id == source_id, Source.user_id == user_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Sorgente non trovata")

    # Offline check
    if source.status == "offline" or not source.root_path or not os.path.exists(source.root_path):
        raise HTTPException(status_code=400, detail=f"La fonte '{source.name}' è offline o non raggiungibile")

    # Fetch all active files on this source belonging to user
    files = db.query(File).join(Media, File.media_id == Media.id).filter(
        File.source_id == source_id,
        Media.user_id == user_id,
        File.availability_status.notin_(("missing", "trashed"))
    ).all()

    # Group files by media_id
    files_by_media: Dict[str, List[File]] = {}
    for f in files:
        files_by_media.setdefault(f.media_id, []).append(f)

    file_ids_to_trash: List[str] = []
    keep_file_ids: List[str] = []
    trashed_files_list: List[File] = []

    for m_id, m_files in files_by_media.items():
        keep_matches = [f for f in m_files if _normalize_folder(f.relative_path) == keep_folder]
        trash_matches = [f for f in m_files if _normalize_folder(f.relative_path) == trash_folder]

        # Only propose trash if keep_folder has at least one active copy
        if keep_matches and trash_matches:
            for kf in keep_matches:
                keep_file_ids.append(kf.id)
            for tf in trash_matches:
                file_ids_to_trash.append(tf.id)
                trashed_files_list.append(tf)

    total_bytes = sum(f.size_bytes for f in trashed_files_list)

    # Check thumbnails for sample preview
    sample_media_ids = list({f.media_id for f in trashed_files_list[:12]})
    thumbs = db.query(Thumbnail.media_id).filter(Thumbnail.media_id.in_(sample_media_ids)).all()
    thumb_media_ids = {t[0] for t in thumbs}

    sample = []
    for f in trashed_files_list[:12]:
        sample.append({
            "file_id": f.id,
            "filename": f.filename,
            "relative_path": f.relative_path,
            "size_bytes": f.size_bytes,
            "media_id": f.media_id,
            "has_thumbnail": f.media_id in thumb_media_ids
        })

    return {
        "file_ids": file_ids_to_trash,
        "keep_file_ids": list(set(keep_file_ids)),
        "count": len(file_ids_to_trash),
        "bytes": total_bytes,
        "sample": sample
    }
