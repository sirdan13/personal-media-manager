import os
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import MediaOut, MediaDetailOut
from app.services.media_service import (
    list_user_media,
    get_media_detail,
    get_dashboard_stats
)
from app.api.deps import get_current_user
from app.models.entities import User, Thumbnail, Media
from app.core.config import settings

router = APIRouter(prefix="/media", tags=["Libreria Media"])

@router.get("", response_model=List[MediaOut])
def get_media_list(
    media_type: Optional[str] = Query(None, description="Filtro per image o video"),
    source_id: Optional[str] = Query(None, description="Filtro per fonte specifica"),
    search: Optional[str] = Query(None, description="Ricerca nel nome file"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_user_media(db, current_user.id, media_type, source_id, search, offset, limit)

@router.get("/dashboard/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_dashboard_stats(db, current_user.id)

@router.get("/{media_id}", response_model=MediaDetailOut)
def get_media(
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_media_detail(db, current_user.id, media_id)

@router.get("/{media_id}/thumbnail")
def get_thumbnail(
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify ownership of media
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media_id).first()
    if not thumb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniatura non presente")

    full_path = os.path.join(settings.THUMBNAILS_DIR, thumb.storage_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File miniatura non presente su disco")

    return FileResponse(
        path=full_path,
        media_type=f"image/{thumb.format}",
        filename=f"{media.canonical_sha256[:12]}.{thumb.format}"
    )
