import os
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.entities import User, Media, File, Source, Thumbnail, AISettings, AIUsage
from app.schemas.media import FileOut
from app.services.curation_heuristics import (
    rank_duplicate_copies,
    compute_image_quality,
    rank_similar_cluster
)
from app.services.ai_provider import (
    get_ai_settings,
    get_provider,
    GeminiProvider,
    OllamaProvider,
    AIProviderError,
    AIQuotaExceeded
)
from app.services.folder_advisor_service import (
    compute_folder_pairs,
    heuristic_folder_rules,
    ai_folder_rules,
    expand_folder_rule
)
from app.services.best_shot_service import suggest_best_shot
from app.services.smart_album_service import suggest_smart_albums, create_smart_album

router = APIRouter(prefix="/ai", tags=["AI Advisor"])

class SmartAlbumSuggestRequest(BaseModel):
    use_ai: bool = True
    min_media: int = 15

class SmartAlbumCreateRequest(BaseModel):
    event_id: str
    name: str
    description: Optional[str] = None
    tags: List[str] = []

class BestShotRequest(BaseModel):
    media_ids: List[str]
    use_ai: bool = True

class FolderAdvisorAnalyzeRequest(BaseModel):
    source_id: Optional[str] = None
    use_ai: bool = True

class FolderAdvisorPreviewRequest(BaseModel):
    source_id: str
    keep_folder: str
    trash_folder: str

class AISettingsUpdate(BaseModel):
    provider: Optional[str] = None
    model_text: Optional[str] = None
    model_vision: Optional[str] = None
    api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    allow_cloud_images: Optional[bool] = None
    daily_request_cap: Optional[int] = None

class AITestRequest(BaseModel):
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    ollama_base_url: Optional[str] = None

class SuggestKeepRequest(BaseModel):
    media_ids: List[str] = Field(..., max_length=200)
    preferred_source_id: Optional[str] = None

class RankSimilarRequest(BaseModel):
    media_ids: List[str]

@router.get("/settings")
def get_ai_settings_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ai_settings = get_ai_settings(db, current_user.id)
    has_env_key = bool(settings.GEMINI_API_KEY)
    effective_key = settings.GEMINI_API_KEY or ai_settings.api_key
    has_api_key = bool(effective_key)
    api_key_hint = None
    if effective_key:
        api_key_hint = f"...{effective_key[-4:]}" if len(effective_key) >= 4 else "..."

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage_rows = db.query(AIUsage).filter(
        AIUsage.user_id == current_user.id,
        AIUsage.day == today_str
    ).all()

    usage_today = {
        "requests": sum(u.requests for u in usage_rows),
        "input_tokens": sum(u.input_tokens for u in usage_rows),
        "output_tokens": sum(u.output_tokens for u in usage_rows)
    }

    return {
        "provider": ai_settings.provider,
        "model_text": ai_settings.model_text,
        "model_vision": ai_settings.model_vision,
        "has_api_key": has_api_key,
        "api_key_hint": api_key_hint,
        "api_key_from_env": has_env_key,
        "ollama_base_url": ai_settings.ollama_base_url,
        "allow_cloud_images": bool(ai_settings.allow_cloud_images),
        "daily_request_cap": ai_settings.daily_request_cap,
        "usage_today": usage_today
    }

@router.put("/settings")
def update_ai_settings_endpoint(
    payload: AISettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ai_settings = get_ai_settings(db, current_user.id)

    if payload.provider is not None:
        if payload.provider not in ("none", "gemini", "ollama"):
            raise HTTPException(status_code=400, detail="Provider non valido. Valori ammessi: none, gemini, ollama")
        ai_settings.provider = payload.provider

    if payload.daily_request_cap is not None:
        if payload.daily_request_cap < 1 or payload.daily_request_cap > 5000:
            raise HTTPException(status_code=400, detail="daily_request_cap deve essere compreso tra 1 e 5000")
        ai_settings.daily_request_cap = payload.daily_request_cap

    if payload.model_text is not None:
        ai_settings.model_text = payload.model_text
    if payload.model_vision is not None:
        ai_settings.model_vision = payload.model_vision
    if payload.ollama_base_url is not None:
        ai_settings.ollama_base_url = payload.ollama_base_url
    if payload.allow_cloud_images is not None:
        ai_settings.allow_cloud_images = 1 if payload.allow_cloud_images else 0

    if payload.api_key is not None:
        if payload.api_key.strip() == "":
            ai_settings.api_key = None
        else:
            ai_settings.api_key = payload.api_key.strip()

    db.commit()
    db.refresh(ai_settings)
    return get_ai_settings_endpoint(current_user=current_user, db=db)

@router.get("/models")
def get_ai_models_endpoint(
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
    ollama_base_url: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    provider = None
    if provider_name == "gemini":
        key = (api_key or "").strip() or settings.GEMINI_API_KEY
        if not key:
            ai_settings = get_ai_settings(db, current_user.id)
            key = ai_settings.api_key
        if key:
            provider = GeminiProvider(api_key=key)
    elif provider_name == "ollama":
        base_url = (ollama_base_url or "").strip() or "http://localhost:11434"
        provider = OllamaProvider(base_url=base_url)

    if provider is None:
        provider = get_provider(db, current_user.id)

    if provider is None:
        return []
    try:
        return provider.list_models()
    except Exception:
        return []

@router.post("/test")
def test_ai_connection(
    payload: Optional[AITestRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    provider = None
    if payload and payload.provider and payload.provider != "none":
        if payload.provider == "gemini":
            key = (payload.api_key or "").strip() or settings.GEMINI_API_KEY
            if not key:
                ai_settings = get_ai_settings(db, current_user.id)
                key = ai_settings.api_key
            if not key:
                return {"ok": False, "error": "Chiave API Gemini mancante. Inserisci la tua API Key per testare la connessione."}
            model = payload.model or settings.GEMINI_DEFAULT_MODEL
            provider = GeminiProvider(api_key=key, model=model)
        elif payload.provider == "ollama":
            base_url = (payload.ollama_base_url or "").strip() or "http://localhost:11434"
            model = payload.model or "llama3.2"
            provider = OllamaProvider(base_url=base_url, model=model)

    if provider is None:
        provider = get_provider(db, current_user.id)

    if provider is None:
        return {"ok": False, "error": "Nessun provider AI configurato o attivo"}

    t0 = time.time()
    test_schema = {
        "type": "object",
        "properties": {"ok": {"type": "boolean"}},
        "required": ["ok"]
    }
    try:
        provider.generate_json(
            system_prompt="Test connection",
            user_prompt='Rispondi con {"ok": true}',
            schema=test_schema
        )
        latency = int((time.time() - t0) * 1000)
        return {
            "ok": True,
            "provider": provider.name,
            "model": getattr(provider, "model", ""),
            "latency_ms": latency
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.post("/folder-advisor/analyze")
def analyze_folder_advisor(
    payload: FolderAdvisorAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pairs = compute_folder_pairs(db, current_user.id, source_id=payload.source_id)
    if not pairs:
        return {
            "engine_used": "heuristic",
            "ai_error": None,
            "pairs": [],
            "rules": []
        }

    if payload.use_ai:
        rules, engine_used, ai_error = ai_folder_rules(db, current_user.id, pairs)
    else:
        rules = heuristic_folder_rules(pairs)
        engine_used = "heuristic"
        ai_error = None

    return {
        "engine_used": engine_used,
        "ai_error": ai_error,
        "pairs": pairs,
        "rules": rules
    }

@router.post("/folder-advisor/preview")
def preview_folder_rule_endpoint(
    payload: FolderAdvisorPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return expand_folder_rule(
        db=db,
        user_id=current_user.id,
        source_id=payload.source_id,
        keep_folder=payload.keep_folder,
        trash_folder=payload.trash_folder
    )

@router.post("/smart-albums/suggest")
def suggest_smart_albums_endpoint(
    payload: SmartAlbumSuggestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return suggest_smart_albums(
        db=db,
        user_id=current_user.id,
        use_ai=payload.use_ai,
        min_media=payload.min_media
    )

@router.post("/smart-albums/create")
def create_smart_album_endpoint(
    payload: SmartAlbumCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return create_smart_album(
        db=db,
        user_id=current_user.id,
        event_id=payload.event_id,
        name=payload.name,
        description=payload.description,
        tags=payload.tags
    )




@router.post("/duplicates/suggest-keep")
def suggest_keep_duplicates(
    payload: SuggestKeepRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if len(payload.media_ids) > 200:
        raise HTTPException(status_code=400, detail="Massimo 200 media_id consentiti per richiesta")

    if not payload.media_ids:
        return []

    # Verify ownership of requested media_ids
    user_media_ids = {
        m[0] for m in db.query(Media.id).filter(
            Media.id.in_(payload.media_ids),
            Media.user_id == current_user.id
        ).all()
    }

    if not user_media_ids:
        return []

    # Fetch active files and sources for these media
    files_with_sources = db.query(File, Source).join(Source, File.source_id == Source.id).filter(
        File.media_id.in_(list(user_media_ids)),
        File.availability_status.notin_(("missing", "trashed"))
    ).all()

    files_by_media: Dict[str, List[FileOut]] = {mid: [] for mid in user_media_ids}
    for f, s in files_with_sources:
        files_by_media[f.media_id].append(FileOut(
            id=f.id,
            media_id=f.media_id,
            source_id=f.source_id,
            source_name=s.name,
            source_status=s.status,
            filename=f.filename,
            relative_path=f.relative_path,
            extension=f.extension,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            captured_at=f.captured_at,
            width=f.width,
            height=f.height,
            duration_seconds=f.duration_seconds,
            sha256=f.sha256,
            availability_status=f.availability_status,
            trash_relative_path=f.trash_relative_path,
            trashed_at=f.trashed_at,
            metadata_json=f.metadata_json,
            first_indexed_at=f.first_indexed_at,
            last_seen_at=f.last_seen_at
        ))

    results = []
    # Preserve order of payload.media_ids
    for mid in payload.media_ids:
        if mid not in user_media_ids:
            continue
        m_files = files_by_media.get(mid, [])
        ranked = rank_duplicate_copies(m_files, preferred_source_id=payload.preferred_source_id)
        results.append(ranked)

    return results

@router.post("/similar/rank-heuristic")
def rank_similar_photos_heuristic(
    payload: RankSimilarRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if len(payload.media_ids) < 2 or len(payload.media_ids) > 12:
        raise HTTPException(status_code=400, detail="media_ids deve contenere tra 2 e 12 elementi")

    medias = db.query(Media).filter(
        Media.id.in_(payload.media_ids),
        Media.user_id == current_user.id
    ).all()

    media_map = {m.id: m for m in medias}
    if len(media_map) < 2:
        raise HTTPException(status_code=400, detail="Meno di 2 media validi trovati per l'utente")

    # Load thumbnails for these media
    thumbnails = db.query(Thumbnail).filter(Thumbnail.media_id.in_(list(media_map.keys()))).all()
    thumb_map = {t.media_id: t for t in thumbnails}

    # Load first active file for each media (for metadata_json)
    files = db.query(File).filter(
        File.media_id.in_(list(media_map.keys())),
        File.availability_status.notin_(("missing", "trashed"))
    ).all()
    file_map = {}
    for f in files:
        if f.media_id not in file_map:
            file_map[f.media_id] = f

    cluster_items = []
    for mid in payload.media_ids:
        if mid not in media_map:
            continue
        m = media_map[mid]
        t = thumb_map.get(mid)
        thumb_path = os.path.join(settings.THUMBNAILS_DIR, t.storage_path) if t else None
        db_f = file_map.get(mid)
        quality = compute_image_quality(m, thumbnail_full_path=thumb_path, db_file=db_f)
        cluster_items.append({
            "media_id": m.id,
            "sharpness_raw": quality.get("sharpness_raw"),
            "megapixels": quality.get("megapixels"),
            "metadata_completeness": quality.get("metadata_completeness", 0),
            "is_favorite": bool(m.is_favorite)
        })

    return rank_similar_cluster(cluster_items)

@router.post("/similar/best-shot")
def get_best_shot(
    payload: BestShotRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return suggest_best_shot(
        db=db,
        user_id=current_user.id,
        media_ids=payload.media_ids,
        use_ai=payload.use_ai
    )

