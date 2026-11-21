import os
import re
import json
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
from PIL import Image, ImageFilter, ImageStat

JUNK_FOLDER_PATTERNS = {
    "download": -20, "downloads": -20, "desktop": -15, "scrivania": -15,
    "temp": -20, "tmp": -20, "cache": -25, "trash": -30, "cestino": -30,
    "whatsapp": -15, "telegram": -15, "copia": -15, "copy": -15,
    "backup": -10, "old": -10, "vecchi": -10, "da sistemare": -10,
    "unsorted": -10, "nuova cartella": -15, "new folder": -15, "untitled": -15,
    "dcim": -8, "100apple": -10, "camera roll": -8, "rullino": -8, "import": -5
}

def score_path_quality(relative_path: str) -> Tuple[int, List[str]]:
    """
    Computes an objective score 0..100 (base 50) and readable Italian reasons
    evaluating the organizational quality of a file path.
    """
    if not relative_path:
        return 50, ["Percorso non specificato"]

    score = 50
    reasons: List[str] = []

    p = relative_path.replace("\\", "/").strip("/")
    segments = [s for s in p.split("/") if s]
    folder_segments = segments[:-1]
    filename = segments[-1] if segments else ""

    # 1. Folder penalties
    folder_penalty_total = 0
    for seg in folder_segments:
        seg_lower = seg.lower()
        matched_penalties = [val for key, val in JUNK_FOLDER_PATTERNS.items() if key in seg_lower]
        if matched_penalties:
            worst = min(matched_penalties)
            folder_penalty_total += worst
            reasons.append(f"Cartella generica o temporanea '{seg}' ({worst})")

    # Clamp total folder penalty to max -40
    folder_penalty_clamped = max(-40, folder_penalty_total)
    score += folder_penalty_clamped

    # 2. Filename penalties
    if re.search(r"\(\d+\)", filename):
        score -= 15
        reasons.append("Nome con suffisso di copia '(n)' (-15)")

    if re.search(r"(?i)(\s-\s)?(copia|copy)(\s\d+)?\.", filename):
        score -= 15
        reasons.append("Nome con indicatore di copia (-15)")

    if re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", filename.lower()):
        score -= 10
        reasons.append("Nome generico con identificatore UUID (-10)")

    # 3. Organization bonuses
    year_bonus = False
    for seg in folder_segments:
        if re.search(r"(19|20)\d{2}", seg):
            year_bonus = True
            break
    if year_bonus:
        score += 10
        reasons.append("Cartella organizzata per anno (+10)")

    desc_bonus = False
    for seg in folder_segments:
        seg_lower = seg.lower()
        alpha_count = len(re.findall(r"[a-zA-Z]", seg))
        has_separator = any(c in seg for c in ("_", "-", " "))
        is_junk = any(key in seg_lower for key in JUNK_FOLDER_PATTERNS)
        if alpha_count >= 4 and has_separator and not is_junk:
            desc_bonus = True
            break
    if desc_bonus:
        score += 10
        reasons.append("Cartella con nome descrittivo (+10)")

    # Depth
    if 2 <= len(folder_segments) <= 5:
        score += 5
        reasons.append("Profondità cartelle ottimale (+5)")
    elif len(folder_segments) > 7:
        score -= 5
        reasons.append("Profondità cartelle eccessiva (-5)")

    final_score = max(0, min(100, score))
    return final_score, reasons


def rank_duplicate_copies(
    files: List[Any],
    preferred_source_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Ranks copies in an exact duplicate group (same media_id).
    Enforces the rule: keep 1 copy per disk/source, and proposes trashing intra-disk duplicates.
    """
    if not files:
        return {
            "media_id": "",
            "engine": "heuristic",
            "keep_file_ids": [],
            "trash_file_ids": [],
            "skipped_offline_file_ids": [],
            "scores": {},
            "reasons": {},
            "confidence": 0.5
        }

    # Extract media_id
    first = files[0]
    media_id = getattr(first, "media_id", None) or (first.get("media_id") if isinstance(first, dict) else "")

    # Group by source_id, considering only active copies
    by_source: Dict[str, List[Any]] = {}
    for f in files:
        status = getattr(f, "availability_status", None) or (f.get("availability_status") if isinstance(f, dict) else "available")
        if status in ("missing", "trashed"):
            continue
        s_id = getattr(f, "source_id", None) or (f.get("source_id") if isinstance(f, dict) else "")
        by_source.setdefault(s_id, []).append(f)

    keep_file_ids: List[str] = []
    trash_file_ids: List[str] = []
    skipped_offline_file_ids: List[str] = []
    scores: Dict[str, int] = {}
    reasons: Dict[str, str] = {}

    confidence_deltas: List[float] = []

    for s_id, s_files in by_source.items():
        scored_files = []
        for f in s_files:
            f_id = getattr(f, "id", None) or (f.get("id") if isinstance(f, dict) else "")
            rel_path = getattr(f, "relative_path", "") or (f.get("relative_path", "") if isinstance(f, dict) else "")
            first_idx = getattr(f, "first_indexed_at", None) or (f.get("first_indexed_at") if isinstance(f, dict) else None)
            if isinstance(first_idx, str):
                try:
                    first_idx_ts = datetime.fromisoformat(first_idx).timestamp()
                except Exception:
                    first_idx_ts = 0.0
            elif isinstance(first_idx, datetime):
                first_idx_ts = first_idx.timestamp()
            else:
                first_idx_ts = 0.0

            sc, r_list = score_path_quality(rel_path)
            scores[f_id] = sc
            scored_files.append((sc, f, r_list, first_idx_ts))

        # Sort order:
        # 1. path_score desc
        # 2. preferred_source_id matches (1 desc)
        # 3. length of relative path asc
        # 4. first_indexed_at asc
        scored_files.sort(
            key=lambda x: (
                x[0],
                1 if getattr(x[1], "source_id", None) == preferred_source_id or (isinstance(x[1], dict) and x[1].get("source_id") == preferred_source_id) else 0,
                -len(getattr(x[1], "relative_path", "") or (x[1].get("relative_path", "") if isinstance(x[1], dict) else "")),
                -x[3]
            ),
            reverse=True
        )

        # Winner on this source
        winner_score, winner_f, winner_reasons, _ = scored_files[0]
        winner_id = getattr(winner_f, "id", None) or (winner_f.get("id") if isinstance(winner_f, dict) else "")
        keep_file_ids.append(winner_id)
        reasons[winner_id] = "Conservata: " + (", ".join(winner_reasons) if winner_reasons else "Copia ottimale per questo supporto")

        # Losers on this source (if any)
        if len(scored_files) > 1:
            second_score = scored_files[1][0]
            confidence_deltas.append(max(0, winner_score - second_score))

            for sc, loser_f, loser_reasons, _ in scored_files[1:]:
                loser_id = getattr(loser_f, "id", None) or (loser_f.get("id") if isinstance(loser_f, dict) else "")
                s_status = getattr(loser_f, "source_status", None) or (loser_f.get("source_status") if isinstance(loser_f, dict) else "online")
                if s_status == "offline":
                    skipped_offline_file_ids.append(loser_id)
                    reasons[loser_id] = "Non modificabile: disco offline"
                else:
                    trash_file_ids.append(loser_id)
                    reasons[loser_id] = "Proposta rimozione: " + (", ".join(loser_reasons) if loser_reasons else "Copia duplicata sullo stesso disco")

    if confidence_deltas:
        avg_delta = sum(confidence_deltas) / len(confidence_deltas)
        confidence = max(0.3, min(0.95, round(avg_delta / 100.0, 2)))
    else:
        confidence = 0.95

    return {
        "media_id": media_id,
        "engine": "heuristic",
        "keep_file_ids": keep_file_ids,
        "trash_file_ids": trash_file_ids,
        "skipped_offline_file_ids": skipped_offline_file_ids,
        "scores": scores,
        "reasons": reasons,
        "confidence": confidence
    }


def compute_image_quality(
    media: Any,
    thumbnail_full_path: Optional[str] = None,
    db_file: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Computes technical quality indicators for a media item.
    """
    sharpness_raw: Optional[float] = None
    if thumbnail_full_path and os.path.isfile(thumbnail_full_path):
        try:
            with Image.open(thumbnail_full_path) as img:
                gray = img.convert("L")
                edges = gray.filter(ImageFilter.FIND_EDGES)
                stat = ImageStat.Stat(edges)
                sharpness_raw = float(stat.var[0])
        except Exception:
            sharpness_raw = None

    w = getattr(media, "width", None) or (media.get("width") if isinstance(media, dict) else None)
    h = getattr(media, "height", None) or (media.get("height") if isinstance(media, dict) else None)
    megapixels = round((w * h) / 1_000_000.0, 2) if w and h else None

    # Metadata completeness (0..3)
    comp = 0
    captured_at = getattr(media, "captured_at", None) or (media.get("captured_at") if isinstance(media, dict) else None)
    if captured_at is not None:
        comp += 1

    lat = getattr(media, "latitude", None) or (media.get("latitude") if isinstance(media, dict) else None)
    if lat is not None:
        comp += 1

    # Check make/model in metadata_json
    raw_meta = None
    if db_file is not None:
        raw_meta = getattr(db_file, "metadata_json", None) or (db_file.get("metadata_json") if isinstance(db_file, dict) else None)
    elif hasattr(media, "files") and media.files:
        raw_meta = getattr(media.files[0], "metadata_json", None)

    if raw_meta:
        try:
            meta = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
            if isinstance(meta, dict):
                has_make = any(k in meta for k in ("make", "Make", "MAKE"))
                has_model = any(k in meta for k in ("model", "Model", "MODEL"))
                if has_make or has_model:
                    comp += 1
        except Exception:
            pass

    is_fav = bool(getattr(media, "is_favorite", False) or (media.get("is_favorite") if isinstance(media, dict) else False))

    return {
        "sharpness_raw": sharpness_raw,
        "megapixels": megapixels,
        "metadata_completeness": comp,
        "is_favorite": is_fav
    }


def rank_similar_cluster(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Ranks items in a similar photos cluster (dHash), choosing the best shot
    and marking inferior shots for trash while strictly protecting favorites.
    """
    if not items:
        return {
            "engine": "heuristic",
            "best_media_id": "",
            "keep_media_ids": [],
            "trash_media_ids": [],
            "scores": {},
            "reasons": {}
        }

    # Extract valid sharpness
    sharpness_vals = [it["sharpness_raw"] for it in items if it.get("sharpness_raw") is not None]
    min_s = min(sharpness_vals) if sharpness_vals else 0.0
    max_s = max(sharpness_vals) if sharpness_vals else 0.0

    # Extract valid megapixels
    mp_vals = [it["megapixels"] for it in items if it.get("megapixels") is not None]
    min_mp = min(mp_vals) if mp_vals else 0.0
    max_mp = max(mp_vals) if mp_vals else 0.0

    scored = []
    for it in items:
        m_id = it["media_id"]
        s_raw = it.get("sharpness_raw")
        if s_raw is not None and max_s > min_s:
            s_norm = (s_raw - min_s) / (max_s - min_s)
        elif s_raw is not None:
            s_norm = 0.5
        else:
            s_norm = 0.0

        mp = it.get("megapixels")
        if mp is not None and max_mp > min_mp:
            mp_norm = (mp - min_mp) / (max_mp - min_mp)
        elif mp is not None:
            mp_norm = 0.5
        else:
            mp_norm = 0.0

        comp = it.get("metadata_completeness", 0) / 3.0
        fav = 1.0 if it.get("is_favorite") else 0.0

        quality = 0.55 * s_norm + 0.25 * mp_norm + 0.10 * comp + 0.10 * fav
        scored.append((quality, m_id, it))

    # Highest quality wins best
    scored.sort(key=lambda x: x[0], reverse=True)
    best_media_id = scored[0][1]

    keep_media_ids: List[str] = [best_media_id]
    trash_media_ids: List[str] = []
    scores: Dict[str, float] = {}
    reasons: Dict[str, str] = {}

    for q, m_id, it in scored:
        scores[m_id] = round(q * 100, 1)
        if m_id == best_media_id:
            reasons[m_id] = "Scatto migliore: nitidezza e qualità tecnica più elevata"
        elif it.get("is_favorite"):
            keep_media_ids.append(m_id)
            reasons[m_id] = "Conservata: contrassegnata come preferita"
        else:
            trash_media_ids.append(m_id)
            reasons[m_id] = "Copia simile con nitidezza o risoluzione inferiore"

    return {
        "engine": "heuristic",
        "best_media_id": best_media_id,
        "keep_media_ids": keep_media_ids,
        "trash_media_ids": trash_media_ids,
        "scores": scores,
        "reasons": reasons
    }
