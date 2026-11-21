import os
import json
from typing import List, Dict, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Media, File, Thumbnail
from app.services.curation_heuristics import compute_image_quality, rank_similar_cluster
from app.services.ai_provider import (
    get_provider,
    get_ai_settings,
    run_ai_json,
    AIProviderError,
    AIQuotaExceeded
)

def suggest_best_shot(
    db: Session,
    user_id: str,
    media_ids: List[str],
    use_ai: bool = True
) -> Dict[str, Any]:
    """
    Selects the best photo in a similar cluster (dHash), prioritizing clarity, expressions,
    and composition, with automatic heuristic fallback and strict favorite protection.
    """
    if len(media_ids) < 2 or len(media_ids) > 8:
        raise HTTPException(status_code=400, detail="media_ids deve contenere tra 2 e 8 elementi")

    medias = db.query(Media).filter(
        Media.id.in_(media_ids),
        Media.user_id == user_id
    ).all()

    media_map = {m.id: m for m in medias}
    if len(media_map) < len(media_ids):
        # Some media were not found or don't belong to current_user
        missing = [mid for mid in media_ids if mid not in media_map]
        raise HTTPException(status_code=404, detail=f"Media non trovati o non autorizzati: {missing}")

    # Load thumbnails
    thumbnails = db.query(Thumbnail).filter(Thumbnail.media_id.in_(media_ids)).all()
    thumb_map = {t.media_id: t for t in thumbnails}

    # Load first active file for metadata
    files = db.query(File).filter(
        File.media_id.in_(media_ids),
        File.availability_status.notin_(("missing", "trashed"))
    ).all()
    file_map = {}
    for f in files:
        if f.media_id not in file_map:
            file_map[f.media_id] = f

    # Always compute heuristic ranking first
    cluster_items = []
    thumb_paths: Dict[str, str] = {}
    for mid in media_ids:
        m = media_map[mid]
        t = thumb_map.get(mid)
        t_path = os.path.join(settings.THUMBNAILS_DIR, t.storage_path) if t else None
        if t_path and os.path.isfile(t_path):
            thumb_paths[mid] = t_path
        db_f = file_map.get(mid)
        quality = compute_image_quality(m, thumbnail_full_path=t_path, db_file=db_f)
        cluster_items.append({
            "media_id": mid,
            "sharpness_raw": quality.get("sharpness_raw"),
            "megapixels": quality.get("megapixels"),
            "metadata_completeness": quality.get("metadata_completeness", 0),
            "is_favorite": bool(m.is_favorite)
        })

    heuristic_res = rank_similar_cluster(cluster_items)
    heuristic_scores = heuristic_res.get("scores", {})

    if not use_ai:
        return {
            "engine": "heuristic",
            "ai_error": None,
            "best_media_id": heuristic_res.get("best_media_id"),
            "keep_media_ids": heuristic_res.get("keep_media_ids", []),
            "trash_media_ids": heuristic_res.get("trash_media_ids", []),
            "reasons": heuristic_res.get("reasons", {}),
            "summary": "Scelta effettuata tramite motore euristico locale (nitidezza e risoluzione).",
            "heuristic_scores": heuristic_scores
        }

    # AI flow
    ai_settings = get_ai_settings(db, user_id)
    provider = get_provider(db, user_id)
    if provider is None:
        return {
            "engine": "heuristic",
            "ai_error": None,
            "best_media_id": heuristic_res.get("best_media_id"),
            "keep_media_ids": heuristic_res.get("keep_media_ids", []),
            "trash_media_ids": heuristic_res.get("trash_media_ids", []),
            "reasons": heuristic_res.get("reasons", {}),
            "summary": "Nessun provider AI configurato: selezione tramite euristica locale.",
            "heuristic_scores": heuristic_scores
        }

    # Check images availability
    valid_images: List[Tuple[bytes, str]] = []
    valid_media_ids: List[str] = []
    for mid in media_ids:
        t_path = thumb_paths.get(mid)
        if t_path and os.path.isfile(t_path):
            try:
                with open(t_path, "rb") as f:
                    valid_images.append((f.read(), "image/webp"))
                    valid_media_ids.append(mid)
            except Exception:
                pass

    if len(valid_images) < 2:
        return {
            "engine": "heuristic",
            "ai_error": "Meno di 2 miniature disponibili su disco per l'analisi visiva AI",
            "best_media_id": heuristic_res.get("best_media_id"),
            "keep_media_ids": heuristic_res.get("keep_media_ids", []),
            "trash_media_ids": heuristic_res.get("trash_media_ids", []),
            "reasons": heuristic_res.get("reasons", {}),
            "summary": "Selezione euristica (miniature mancanti per AI).",
            "heuristic_scores": heuristic_scores
        }

    # Prepare multimodal prompt
    system_prompt = (
        "Sei un fotografo professionista esperto di selezione scatti. Il tuo compito è scegliere la foto migliore "
        "all'interno di un cluster di scatti simili (stessa scena o raffica). Considera nitidezza, messa a fuoco "
        "del soggetto, occhi aperti, espressioni naturali, composizione, orizzonte dritto e assenza di elementi tagliati. "
        "Non scartare foto che mostrano contenuti significativamente diversi (es. persone diverse o inquadrature diverse): "
        "se ci sono differenze importanti di contenuto, mettile in keep_media_ids. Assegna motivazioni sintetiche e "
        "chiare in italiano a ciascuna foto."
    )

    image_descriptions = []
    for idx, mid in enumerate(valid_media_ids, start=1):
        m = media_map[mid]
        h_info = heuristic_scores.get(mid, 0.0)
        score_val = h_info if isinstance(h_info, (int, float)) else h_info.get("sharpness_norm", 0.0)
        image_descriptions.append(
            f"Foto {idx}: media_id='{mid}', Risoluzione={m.width or '?'}x{m.height or '?'}, "
            f"Indice qualità euristica={score_val:.2f}"
        )

    user_prompt = (
        "Analizza queste " + str(len(valid_media_ids)) + " foto allegate nell'ordine:\n" +
        "\n".join(image_descriptions) +
        "\nIndica la migliore ('best_media_id'), quelle da conservare ('keep_media_ids') e quelle scartabili ('trash_media_ids')."
    )

    schema = {
        "type": "object",
        "properties": {
            "best_media_id": {"type": "string"},
            "keep_media_ids": {"type": "array", "items": {"type": "string"}},
            "trash_media_ids": {"type": "array", "items": {"type": "string"}},
            "reasons": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "media_id": {"type": "string"},
                        "reason": {"type": "string"}
                    },
                    "required": ["media_id", "reason"]
                }
            },
            "summary": {"type": "string"}
        },
        "required": ["best_media_id", "keep_media_ids", "trash_media_ids", "reasons", "summary"]
    }

    model_to_use = ai_settings.model_vision or ai_settings.model_text
    ai_error_msg = None

    try:
        ai_res = run_ai_json(
            db=db,
            user_id=user_id,
            feature="best_shot",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema,
            images=valid_images,
            model_override=model_to_use
        )
    except Exception as e:
        ai_res = None
        ai_error_msg = str(e)

    if not ai_res or not isinstance(ai_res.data, dict):
        fallback_summary = (
            f"Scelta con euristica locale ({ai_error_msg})."
            if ai_error_msg
            else "Scelta effettuata tramite motore euristico locale (fallback su errore AI)."
        )
        return {
            "engine": "heuristic",
            "ai_error": ai_error_msg or "Risposta AI non valida",
            "best_media_id": heuristic_res.get("best_media_id"),
            "keep_media_ids": heuristic_res.get("keep_media_ids", []),
            "trash_media_ids": heuristic_res.get("trash_media_ids", []),
            "reasons": heuristic_res.get("reasons", {}),
            "summary": fallback_summary,
            "heuristic_scores": heuristic_scores
        }

    data = ai_res.data
    best_media_id = data.get("best_media_id")
    raw_keep = set(data.get("keep_media_ids", []))
    raw_trash = set(data.get("trash_media_ids", []))

    # Strict validation
    if best_media_id not in media_ids:
        # Invalid best_media_id -> fallback to heuristic
        return {
            "engine": "heuristic",
            "ai_error": "L'AI ha restituito un best_media_id non presente nel cluster",
            "best_media_id": heuristic_res.get("best_media_id"),
            "keep_media_ids": heuristic_res.get("keep_media_ids", []),
            "trash_media_ids": heuristic_res.get("trash_media_ids", []),
            "reasons": heuristic_res.get("reasons", {}),
            "summary": "Scelta effettuata tramite motore euristico locale (best_media_id AI non valido).",
            "heuristic_scores": heuristic_scores
        }

    # Ensure best_media_id is in keep
    raw_keep.add(best_media_id)
    raw_trash.discard(best_media_id)

    # Discard IDs not in media_ids
    raw_keep = {mid for mid in raw_keep if mid in media_ids}
    raw_trash = {mid for mid in raw_trash if mid in media_ids}

    # Favorite protection: any favorite media MUST be in keep
    for mid in list(raw_trash):
        if media_map[mid].is_favorite:
            raw_trash.discard(mid)
            raw_keep.add(mid)

    # Disjointness: keep has priority over trash
    raw_trash = raw_trash - raw_keep

    # Any media from media_ids not mentioned goes to keep
    for mid in media_ids:
        if mid not in raw_keep and mid not in raw_trash:
            raw_keep.add(mid)

    # Format reasons map
    reasons_dict: Dict[str, str] = {}
    raw_reasons = data.get("reasons", [])
    if isinstance(raw_reasons, list):
        for item in raw_reasons:
            if isinstance(item, dict) and "media_id" in item and "reason" in item:
                reasons_dict[item["media_id"]] = item["reason"]

    # Fill default reason if missing
    for mid in media_ids:
        if mid not in reasons_dict:
            if mid == best_media_id:
                reasons_dict[mid] = "Migliore scatto selezionato"
            elif mid in raw_trash:
                reasons_dict[mid] = "Scarto proposto per lo spostamento nel cestino"
            else:
                reasons_dict[mid] = "Copia o scatto alternativo conservato"

    return {
        "engine": ai_res.provider or "ai",
        "ai_error": None,
        "best_media_id": best_media_id,
        "keep_media_ids": list(raw_keep),
        "trash_media_ids": list(raw_trash),
        "reasons": reasons_dict,
        "summary": data.get("summary", "Selezione completata con AI."),
        "heuristic_scores": heuristic_scores
    }
