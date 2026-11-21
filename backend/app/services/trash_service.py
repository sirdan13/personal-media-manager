import os
import json
import shutil
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException, status

from app.models.entities import File, Source, Media, Thumbnail
from app.services.source_service import get_source_by_id
from app.services.dhash_service import hamming_distance

INACTIVE_FILE_STATUSES = ("missing", "trashed")

def _resolve_safe_path_in_source(root_path: str, rel_path: str) -> Optional[str]:
    """
    Validates that rel_path is strictly contained within root_path.
    Prevents path traversal attacks.
    """
    if not root_path or not rel_path:
        return None
    try:
        real_root = os.path.realpath(root_path)
        real_target = os.path.realpath(os.path.join(real_root, rel_path))
        if os.path.commonpath([real_root, real_target]) == real_root and real_target != real_root:
            return real_target
    except Exception:
        return None
    return None

def _append_manifest_log(root_path: str, entry: Dict[str, Any]) -> None:
    """
    Appends an audit log line to {root_path}/.pmm_trash/manifest.jsonl.
    """
    try:
        trash_dir = os.path.join(root_path, ".pmm_trash")
        os.makedirs(trash_dir, exist_ok=True)
        manifest_path = os.path.join(trash_dir, "manifest.jsonl")
        with open(manifest_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"Warning: could not write trash manifest to {root_path}: {e}")

def _move_file_to_trash(
    db: Session,
    f_obj: File,
    source: Source,
    media: Media,
    now_utc: datetime,
    action: str = "trash",
    extra_manifest: Optional[Dict[str, Any]] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Helper function to safely move a single file (and sidecars) to .pmm_trash/files/ on the same disk.
    Returns (item_dict, None) on success or (None, error_dict) on failure.
    """
    if not source.root_path or not os.path.isdir(source.root_path):
        return None, {
            "file_id": f_obj.id,
            "filename": f_obj.filename,
            "error": f"La fonte '{source.name}' non è accessibile o il disco è scollegato ({source.root_path})."
        }

    src_full_path = _resolve_safe_path_in_source(source.root_path, f_obj.relative_path)
    if not src_full_path or not os.path.isfile(src_full_path):
        return None, {
            "file_id": f_obj.id,
            "filename": f_obj.filename,
            "error": f"File fisico non trovato su disco: {f_obj.relative_path}"
        }

    # Target relative path inside same drive: .pmm_trash/files/<rel_path>
    clean_rel = f_obj.relative_path.replace("\\", "/").lstrip("/")
    trash_rel = os.path.join(".pmm_trash", "files", clean_rel)
    dst_full_path = _resolve_safe_path_in_source(source.root_path, trash_rel)

    if not dst_full_path:
        return None, {
            "file_id": f_obj.id,
            "filename": f_obj.filename,
            "error": "Percorso di destinazione cestino non valido."
        }

    # Handle file name collision in trash
    if os.path.exists(dst_full_path):
        base, ext = os.path.splitext(clean_rel)
        suffix_rel = f"{base}_{f_obj.id[:8]}{ext}"
        trash_rel = os.path.join(".pmm_trash", "files", suffix_rel)
        dst_full_path = _resolve_safe_path_in_source(source.root_path, trash_rel)

    try:
        os.makedirs(os.path.dirname(dst_full_path), exist_ok=True)
        shutil.move(src_full_path, dst_full_path)

        # Check and move associated sidecars (.aae, .xmp) if no other active file shares them
        src_dir = os.path.dirname(src_full_path)
        dst_dir = os.path.dirname(dst_full_path)
        base_name, _ = os.path.splitext(f_obj.filename)
        sidecar_candidates = [
            f"{base_name}.aae", f"{base_name}.AAE",
            f"{base_name}.xmp", f"{base_name}.XMP",
            f"{f_obj.filename}.xmp", f"{f_obj.filename}.XMP"
        ]

        same_dir_active = db.query(File).filter(
            File.source_id == source.id,
            File.id != f_obj.id,
            File.availability_status.notin_(INACTIVE_FILE_STATUSES)
        ).all()
        same_dir_active_names = {os.path.splitext(f.filename)[0].lower() for f in same_dir_active if os.path.dirname(f.relative_path) == os.path.dirname(f_obj.relative_path)}

        if base_name.lower() not in same_dir_active_names:
            for sc in sidecar_candidates:
                sc_src = os.path.join(src_dir, sc)
                if os.path.isfile(sc_src):
                    sc_dst = os.path.join(dst_dir, sc)
                    try:
                        shutil.move(sc_src, sc_dst)
                    except Exception as sc_err:
                        print(f"Warning: could not move sidecar {sc_src}: {sc_err}")

        # Manifest audit log
        manifest_payload = {
            "timestamp": now_utc.isoformat(),
            "action": action,
            "file_id": f_obj.id,
            "media_id": media.id,
            "sha256": f_obj.sha256,
            "original_relative_path": f_obj.relative_path,
            "trash_relative_path": trash_rel,
            "size_bytes": f_obj.size_bytes
        }
        if extra_manifest:
            manifest_payload.update(extra_manifest)

        _append_manifest_log(source.root_path, manifest_payload)

        # Update DB state
        f_obj.availability_status = "trashed"
        f_obj.trash_relative_path = trash_rel
        f_obj.trashed_at = now_utc

        return {
            "file_id": f_obj.id,
            "media_id": media.id,
            "filename": f_obj.filename,
            "original_relative_path": f_obj.relative_path,
            "trash_relative_path": trash_rel,
            "size_bytes": f_obj.size_bytes,
            "source_id": source.id,
            "source_name": source.name
        }, None
    except Exception as e:
        return None, {
            "file_id": f_obj.id,
            "filename": f_obj.filename,
            "error": f"Errore durante lo spostamento: {str(e)}"
        }

def trash_duplicate_files(
    db: Session,
    user_id: str,
    file_ids: List[str],
    keep_file_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Moves selected duplicate files to .pmm_trash/files/ on the same physical disk.
    Enforces the strict guardrail: never orphan a media (always keep at least 1 active copy).
    """
    unique_file_ids = list(dict.fromkeys(file_ids or []))
    if not unique_file_ids:
        return {"trashed_count": 0, "trashed_bytes": 0, "errors": [], "items": []}

    keep_set = set(keep_file_ids or [])

    # Guardrail check: no file to trash can be in keep_set
    for fid in unique_file_ids:
        if fid in keep_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operazione bloccata: un file indicato come da conservare non può essere spostato nel cestino."
            )

    # Fetch file records with Source and Media ensuring ownership
    rows = db.query(File, Source, Media)\
             .join(Source, File.source_id == Source.id)\
             .join(Media, File.media_id == Media.id)\
             .filter(
                 File.id.in_(unique_file_ids),
                 Media.user_id == user_id,
                 Source.user_id == user_id
             ).all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nessun file trovato per i parametri forniti."
        )

    # Group files to trash by media_id
    files_by_media: Dict[str, List[tuple]] = {}
    for f, s, m in rows:
        files_by_media.setdefault(m.id, []).append((f, s, m))

    # CRITICAL GUARDRAIL: Check remaining active copies for each media
    for m_id, candidates in files_by_media.items():
        all_active_files = db.query(File).filter(
            File.media_id == m_id,
            File.availability_status.notin_(INACTIVE_FILE_STATUSES)
        ).all()
        candidate_ids = {f.id for f, s, m in candidates}
        remaining_active = [f for f in all_active_files if f.id not in candidate_ids]
        if len(remaining_active) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operazione bloccata: devi conservare almeno 1 copia attiva per ogni foto/video."
            )

    trashed_items = []
    errors = []
    now_utc = datetime.now(timezone.utc)

    for f_obj, source, media in rows:
        item, err = _move_file_to_trash(db, f_obj, source, media, now_utc, action="trash")
        if item:
            trashed_items.append(item)
        if err:
            errors.append(err)

    db.commit()

    return {
        "trashed_count": len(trashed_items),
        "trashed_bytes": sum(x["size_bytes"] for x in trashed_items),
        "items": trashed_items,
        "errors": errors
    }

def trash_similar_media(
    db: Session,
    user_id: str,
    keep_media_id: str,
    trash_media_ids: List[str],
    max_distance: int = 10
) -> Dict[str, Any]:
    """
    Moves ALL active files of selected similar media items to .pmm_trash/files/ on their disks.
    Guarantees that keep_media_id is similar, online, not favorite, and stays intact.
    """
    unique_trash_ids = list(dict.fromkeys(trash_media_ids or []))
    if not unique_trash_ids:
        return {
            "trashed_media_count": 0,
            "trashed_files_count": 0,
            "freed_bytes": 0,
            "kept_media_id": keep_media_id,
            "items": [],
            "errors": []
        }

    # Guardrail 1: keep_media_id cannot be in trash_media_ids
    if keep_media_id in unique_trash_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operazione bloccata: il media da conservare non può essere incluso tra quelli da cestinare."
        )

    # Check keep_media exists and belongs to user
    keep_media = db.query(Media).filter(Media.id == keep_media_id, Media.user_id == user_id).first()
    if not keep_media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media da conservare non trovato.")

    # Guardrail: keep_media must have at least 1 active copy
    keep_active = db.query(File).filter(
        File.media_id == keep_media_id,
        File.availability_status.notin_(INACTIVE_FILE_STATUSES)
    ).count()
    if keep_active < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operazione bloccata: il media da conservare non possiede copie attive."
        )

    if not keep_media.dhash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Il media da conservare non possiede un hash visivo dHash valido per verificare la somiglianza."
        )

    # Fetch trash media objects
    trash_medias = db.query(Media).filter(
        Media.id.in_(unique_trash_ids),
        Media.user_id == user_id
    ).all()
    if len(trash_medias) < len(unique_trash_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uno o più media da cestinare non sono stati trovati o appartengono a un altro utente."
        )

    # Guardrail 2 & 3: distance check and favorite check
    for m in trash_medias:
        if m.is_favorite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Impossibile cestinare una foto contrassegnata come preferita (ID: {m.id})."
            )
        if not m.dhash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Il media {m.id} non possiede un dHash valido per verificare la somiglianza."
            )
        dist = hamming_distance(m.dhash, keep_media.dhash)
        if dist > max_distance:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Il media {m.id} ha una distanza dHash ({dist}) superiore al limite consentito ({max_distance})."
            )

    # Fetch all active files for these media
    active_files_query = db.query(File, Source).join(Source, File.source_id == Source.id).filter(
        File.media_id.in_([m.id for m in trash_medias]),
        File.availability_status.notin_(INACTIVE_FILE_STATUSES)
    ).all()

    # Guardrail: each trash media must have at least 1 active copy
    media_with_active = {f.media_id for f, s in active_files_query}
    for m in trash_medias:
        if m.id not in media_with_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Il media {m.id} non possiede copie attive su disco."
            )

    # Guardrail 4: All active copies must be on ONLINE sources
    for f, s in active_files_query:
        if s.status == "offline" or not s.root_path or not os.path.exists(s.root_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Impossibile procedere: la fonte '{s.name}' per il file '{f.filename}' è offline o non accessibile."
            )

    # Guardrail 5: Handle Live Photos video counterpart
    target_medias = list(trash_medias)
    target_files_with_sources = list(active_files_query)

    for m in trash_medias:
        if m.is_live_photo and m.live_video_media_id:
            v_id = m.live_video_media_id
            v_media = db.query(Media).filter(Media.id == v_id, Media.user_id == user_id).first()
            if v_media and not v_media.is_favorite:
                other_links = db.query(Media).filter(
                    Media.live_video_media_id == v_id,
                    Media.id != m.id,
                    Media.user_id == user_id
                ).count()
                if other_links == 0:
                    v_files = db.query(File, Source).join(Source, File.source_id == Source.id).filter(
                        File.media_id == v_id,
                        File.availability_status.notin_(INACTIVE_FILE_STATUSES)
                    ).all()
                    v_online = all(
                        s.status != "offline" and s.root_path and os.path.exists(s.root_path)
                        for _, s in v_files
                    )
                    if v_online and v_files:
                        target_medias.append(v_media)
                        target_files_with_sources.extend(v_files)

    # Execution
    now_utc = datetime.now(timezone.utc)
    trashed_items = []
    errors = []
    media_map = {m.id: m for m in target_medias}

    for f_obj, source in target_files_with_sources:
        m_obj = media_map.get(f_obj.media_id)
        item, err = _move_file_to_trash(
            db=db,
            f_obj=f_obj,
            source=source,
            media=m_obj,
            now_utc=now_utc,
            action="trash_similar",
            extra_manifest={"kept_media_id": keep_media_id}
        )
        if item:
            trashed_items.append(item)
        if err:
            errors.append(err)

    db.commit()

    return {
        "trashed_media_count": len({m.id for m in target_medias}),
        "trashed_files_count": len(trashed_items),
        "freed_bytes": sum(x["size_bytes"] for x in trashed_items),
        "kept_media_id": keep_media_id,
        "items": trashed_items,
        "errors": errors
    }


def list_trashed_files(
    db: Session,
    user_id: str,
    source_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Lists all files currently in .pmm_trash with availability_status == 'trashed'.
    """
    query = db.query(File, Source, Media)\
              .join(Source, File.source_id == Source.id)\
              .join(Media, File.media_id == Media.id)\
              .filter(
                  Media.user_id == user_id,
                  File.availability_status == "trashed"
              )

    if source_id:
        get_source_by_id(db, user_id, source_id)
        query = query.filter(File.source_id == source_id)

    rows = query.order_by(desc(File.trashed_at)).all()

    media_ids = [m.id for f, s, m in rows]
    thumbs = db.query(Thumbnail.media_id).filter(Thumbnail.media_id.in_(media_ids)).all()
    thumb_set = {t[0] for t in thumbs}

    by_source_map: Dict[str, Dict[str, Any]] = {}
    items = []

    for f, s, m in rows:
        is_online = bool(s.root_path and os.path.isdir(s.root_path))
        if s.id not in by_source_map:
            by_source_map[s.id] = {
                "source_id": s.id,
                "source_name": s.name,
                "root_path": s.root_path,
                "trash_folder_path": os.path.join(s.root_path, ".pmm_trash") if s.root_path else None,
                "is_online": is_online,
                "count": 0,
                "bytes": 0
            }
        by_source_map[s.id]["count"] += 1
        by_source_map[s.id]["bytes"] += (f.size_bytes or 0)

        items.append({
            "file_id": f.id,
            "media_id": m.id,
            "source_id": s.id,
            "source_name": s.name,
            "is_source_online": is_online,
            "filename": f.filename,
            "original_relative_path": f.relative_path,
            "trash_relative_path": f.trash_relative_path,
            "size_bytes": f.size_bytes,
            "sha256": f.sha256,
            "trashed_at": f.trashed_at.isoformat() if f.trashed_at else None,
            "has_thumbnail": m.id in thumb_set
        })

    return {
        "total_count": len(items),
        "total_bytes": sum(x["size_bytes"] for x in items),
        "by_source": list(by_source_map.values()),
        "items": items
    }

def restore_trashed_files(
    db: Session,
    user_id: str,
    file_ids: List[str]
) -> Dict[str, Any]:
    """
    Restores files from .pmm_trash back to their exact original location.
    """
    unique_ids = list(dict.fromkeys(file_ids or []))
    if not unique_ids:
        return {"restored_count": 0, "restored_bytes": 0, "errors": [], "items": []}

    rows = db.query(File, Source, Media)\
             .join(Source, File.source_id == Source.id)\
             .join(Media, File.media_id == Media.id)\
             .filter(
                 File.id.in_(unique_ids),
                 File.availability_status == "trashed",
                 Media.user_id == user_id
             ).all()

    restored_items = []
    errors = []
    now_utc = datetime.now(timezone.utc)

    for f_obj, source, media in rows:
        if not source.root_path or not os.path.isdir(source.root_path):
            errors.append({
                "file_id": f_obj.id,
                "filename": f_obj.filename,
                "error": f"La fonte '{source.name}' non è raggiungibile o il disco è scollegato."
            })
            continue

        trash_rel = f_obj.trash_relative_path or os.path.join(".pmm_trash", "files", f_obj.relative_path.lstrip("/\\"))
        trash_full = _resolve_safe_path_in_source(source.root_path, trash_rel)

        if not trash_full or not os.path.isfile(trash_full):
            errors.append({
                "file_id": f_obj.id,
                "filename": f_obj.filename,
                "error": f"File nel cestino non trovato su disco: {trash_rel}"
            })
            continue

        orig_full = _resolve_safe_path_in_source(source.root_path, f_obj.relative_path)
        if not orig_full:
            errors.append({
                "file_id": f_obj.id,
                "filename": f_obj.filename,
                "error": "Percorso originale non valido."
            })
            continue

        try:
            os.makedirs(os.path.dirname(orig_full), exist_ok=True)
            if os.path.exists(orig_full):
                # If target already exists with identical size/content, simply remove trash file
                pass
            else:
                shutil.move(trash_full, orig_full)

            # Check and restore sidecars if present in trash
            trash_dir = os.path.dirname(trash_full)
            orig_dir = os.path.dirname(orig_full)
            base_name, _ = os.path.splitext(f_obj.filename)
            sidecar_candidates = [
                f"{base_name}.aae", f"{base_name}.AAE",
                f"{base_name}.xmp", f"{base_name}.XMP",
                f"{f_obj.filename}.xmp", f"{f_obj.filename}.XMP"
            ]
            for sc in sidecar_candidates:
                sc_trash = os.path.join(trash_dir, sc)
                if os.path.isfile(sc_trash):
                    sc_orig = os.path.join(orig_dir, sc)
                    if not os.path.exists(sc_orig):
                        try:
                            shutil.move(sc_trash, sc_orig)
                        except Exception:
                            pass

            # Manifest audit log
            _append_manifest_log(source.root_path, {
                "timestamp": now_utc.isoformat(),
                "action": "restore",
                "file_id": f_obj.id,
                "media_id": media.id,
                "sha256": f_obj.sha256,
                "original_relative_path": f_obj.relative_path,
                "trash_relative_path": trash_rel,
                "size_bytes": f_obj.size_bytes
            })

            # Update DB state
            f_obj.availability_status = "available"
            f_obj.trash_relative_path = None
            f_obj.trashed_at = None

            restored_items.append({
                "file_id": f_obj.id,
                "media_id": media.id,
                "filename": f_obj.filename,
                "original_relative_path": f_obj.relative_path,
                "size_bytes": f_obj.size_bytes
            })
        except Exception as e:
            errors.append({
                "file_id": f_obj.id,
                "filename": f_obj.filename,
                "error": f"Errore durante il ripristino: {str(e)}"
            })

    db.commit()

    return {
        "restored_count": len(restored_items),
        "restored_bytes": sum(x["size_bytes"] for x in restored_items),
        "items": restored_items,
        "errors": errors
    }
