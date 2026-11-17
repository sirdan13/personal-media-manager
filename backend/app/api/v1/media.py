import os
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import MediaOut, MediaDetailOut, TimelineBucketOut, MapMediaOut
from app.services.media_service import (
    list_user_media,
    get_media_detail,
    get_dashboard_stats,
    get_timeline_buckets,
    get_map_media
)
from app.api.deps import get_current_user
from app.models.entities import User, Thumbnail, Media, File, Source
from app.core.config import settings

router = APIRouter(prefix="/media", tags=["Libreria Media"])

@router.get("", response_model=List[MediaOut])
def get_media_list(
    media_type: Optional[str] = Query(None, description="Filtro per image o video"),
    source_id: Optional[str] = Query(None, description="Filtro per fonte specifica"),
    search: Optional[str] = Query(None, description="Ricerca nel nome file"),
    album_id: Optional[str] = Query(None, description="Filtro per album"),
    tag_id: Optional[str] = Query(None, description="Filtro per tag"),
    month_key: Optional[str] = Query(None, description="Filtro per mese (YYYY-MM)"),
    sort_by: str = Query("date_desc", description="Ordinamento: date_desc, date_asc, name_asc, name_desc, size_desc, size_asc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_user_media(
        db, current_user.id,
        media_type=media_type,
        source_id=source_id,
        search=search,
        album_id=album_id,
        tag_id=tag_id,
        month_key=month_key,
        sort_by=sort_by,
        offset=offset,
        limit=limit
    )

@router.get("/dashboard/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_dashboard_stats(db, current_user.id)

@router.get("/timeline", response_model=List[TimelineBucketOut])
def get_timeline(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_timeline_buckets(db, current_user.id)

@router.get("/map", response_model=List[MapMediaOut])
def get_map(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_map_media(db, current_user.id)

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
    db: Session = Depends(get_db)
):
    thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media_id).first()
    if not thumb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniatura non presente")

    full_path = os.path.join(settings.THUMBNAILS_DIR, thumb.storage_path)
    if not os.path.isfile(full_path):
        alt_paths = [
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../backend/data/thumbnails", thumb.storage_path)),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/thumbnails", thumb.storage_path)),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/thumbnails", thumb.storage_path))
        ]
        found = False
        for alt in alt_paths:
            if os.path.isfile(alt):
                full_path = alt
                found = True
                break
        if not found:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File miniatura non presente su disco")

    return FileResponse(
        path=full_path,
        media_type=f"image/{thumb.format}",
        filename=f"{thumb.media_id[:12]}.{thumb.format}",
        headers={"Cache-Control": "public, max-age=604800"}
    )

@router.get("/{media_id}/stream")
def stream_media(
    media_id: str,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    files = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media_id).all()
    if not files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    for f, s in files:
        if s.root_path:
            full_path = os.path.join(s.root_path, f.relative_path)
            if os.path.isfile(full_path):
                return FileResponse(
                    path=full_path,
                    media_type=f.mime_type or "application/octet-stream",
                    filename=f.filename
                )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Disco offline o file non accessibile direttamente dal server"
    )
