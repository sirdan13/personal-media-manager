import os
import platform
import subprocess
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import MediaOut, MediaDetailOut, TimelineBucketOut, MapMediaOut
from app.services.media_service import (
    list_user_media,
    get_media_detail,
    get_dashboard_stats,
    get_timeline_buckets,
    get_map_media,
    toggle_media_favorite,
    batch_set_favorite
)
from app.api.deps import get_current_user, get_current_user_from_header_or_query
from app.models.entities import User, Thumbnail, Media, File, Source
from app.core.config import settings

def resolve_safe_source_file(root_path: str, relative_path: str) -> Optional[str]:
    if not root_path or not relative_path:
        return None
    try:
        real_root = os.path.realpath(root_path)
        real_target = os.path.realpath(os.path.join(real_root, relative_path))
        if os.path.commonpath([real_root, real_target]) != real_root:
            return None
        if os.path.isfile(real_target):
            return real_target
    except (ValueError, OSError):
        return None
    return None

router = APIRouter(prefix="/media", tags=["Libreria Media"])

@router.get("", response_model=List[MediaOut])
def get_media_list(
    media_type: Optional[str] = Query(None, description="Filtro per image o video"),
    source_id: Optional[str] = Query(None, description="Filtro per fonte specifica"),
    search: Optional[str] = Query(None, description="Ricerca stile Apple (nome, fotocamera, modello, lente, cartella, tag, anno)"),
    album_id: Optional[str] = Query(None, description="Filtro per album"),
    tag_id: Optional[str] = Query(None, description="Filtro per tag"),
    month_key: Optional[str] = Query(None, description="Filtro per mese (YYYY-MM)"),
    is_favorite: Optional[bool] = Query(None, description="Filtro solo preferiti"),
    protection_status: Optional[str] = Query(None, description="Filtro per stato protezione (unprotected, protected, intra_source_duplicate)"),
    lat_min: Optional[float] = Query(None, description="Latitudine minima per filtro geografico"),
    lat_max: Optional[float] = Query(None, description="Latitudine massima per filtro geografico"),
    lon_min: Optional[float] = Query(None, description="Longitudine minima per filtro geografico"),
    lon_max: Optional[float] = Query(None, description="Longitudine massima per filtro geografico"),
    sort_by: str = Query("date_desc", description="Ordinamento: date_desc, date_asc, name_asc, name_desc, size_desc, size_asc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    response: Response = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    items, total_count = list_user_media(
        db, current_user.id,
        media_type=media_type,
        source_id=source_id,
        search=search,
        album_id=album_id,
        tag_id=tag_id,
        month_key=month_key,
        is_favorite=is_favorite,
        protection_status=protection_status,
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        sort_by=sort_by,
        offset=offset,
        limit=limit,
        include_total=True
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)
    return items

@router.post("/{media_id}/favorite")
def toggle_favorite(
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_fav = toggle_media_favorite(db, current_user.id, media_id)
    return {"id": media_id, "is_favorite": is_fav}

@router.post("/batch/favorite")
def batch_favorite(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media_ids = payload.get("media_ids", [])
    is_fav = bool(payload.get("is_favorite", True))
    updated_count = batch_set_favorite(db, current_user.id, media_ids, is_fav)
    return {"updated_count": updated_count, "is_favorite": is_fav}

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
    current_user: User = Depends(get_current_user_from_header_or_query),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

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

    # Seamless upgrade for low-res legacy thumbnails (e.g. <= 200px) when a source disk is online
    if thumb.width <= 200 or thumb.height <= 200:
        try:
            files = db.query(File, Source).join(Source, File.source_id == Source.id)\
                      .filter(File.media_id == media_id, Source.user_id == current_user.id).all()
            for f, s in files:
                if s.root_path:
                    safe_path = resolve_safe_source_file(s.root_path, f.relative_path)
                    if safe_path:
                        from app.services.media_preview_service import generate_image_preview_bytes
                        new_bytes, new_w, new_h, _, _ = generate_image_preview_bytes(
                            safe_path, max_edge=512, quality=75, fmt="WEBP"
                        )
                        if new_bytes and new_w and new_h and (new_w > thumb.width or new_h > thumb.height):
                            os.makedirs(os.path.dirname(full_path), exist_ok=True)
                            with open(full_path, "wb") as f_out:
                                f_out.write(new_bytes)
                            thumb.width = new_w
                            thumb.height = new_h
                            thumb.size_bytes = len(new_bytes)
                            thumb.format = "webp"
                            db.commit()
                            break
        except Exception:
            db.rollback()

    return FileResponse(
        path=full_path,
        media_type=f"image/{thumb.format}",
        filename=f"{thumb.media_id[:12]}.{thumb.format}",
        headers={"Cache-Control": "private, max-age=60, must-revalidate"}
    )

@router.get("/{media_id}/stream")
def stream_media(
    media_id: str,
    download: bool = Query(False, description="Se true forza il download come attachment"),
    current_user: User = Depends(get_current_user_from_header_or_query),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    files = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media_id, Source.user_id == current_user.id).all()
    if not files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File non trovato")

    for f, s in files:
        if s.root_path:
            safe_path = resolve_safe_source_file(s.root_path, f.relative_path)
            if safe_path:
                return FileResponse(
                    path=safe_path,
                    media_type=f.mime_type or "application/octet-stream",
                    filename=f.filename,
                    content_disposition_type="attachment" if download else "inline"
                )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Disco offline o file non accessibile direttamente dal server"
    )

@router.get("/{media_id}/preview")
def get_media_preview(
    media_id: str,
    max_edge: int = Query(1920, ge=400, le=3840),
    current_user: User = Depends(get_current_user_from_header_or_query),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    files = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media_id, Source.user_id == current_user.id).all()
    if not files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File non trovato")

    for f, s in files:
        if s.root_path:
            safe_path = resolve_safe_source_file(s.root_path, f.relative_path)
            if safe_path:
                from app.services.media_preview_service import generate_image_preview_bytes
                preview_bytes, w, h, _, _ = generate_image_preview_bytes(
                    safe_path, max_edge=max_edge, quality=88, fmt="JPEG"
                )
                if preview_bytes:
                    return Response(
                        content=preview_bytes,
                        media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=3600"}
                    )
                # Fallback: if web native image <= 8MB
                ext = (f.extension or "").lower()
                if ext in {"jpg", "jpeg", "png", "webp", "gif"} and f.size_bytes <= 8 * 1024 * 1024:
                    return FileResponse(
                        path=safe_path,
                        media_type=f.mime_type or "image/jpeg",
                        filename=f.filename,
                        headers={"Cache-Control": "private, max-age=3600"}
                    )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Disco offline o anteprima non generabile per questo media"
    )


def reveal_path_in_file_manager(abs_path: str) -> None:
    system = platform.system()
    if system == "Darwin":
        subprocess.Popen(["open", "-R", abs_path])
    elif system == "Windows":
        subprocess.Popen(["explorer", f"/select,{os.path.normpath(abs_path)}"])
    else:
        parent = os.path.dirname(abs_path) if os.path.isfile(abs_path) else abs_path
        subprocess.Popen(["xdg-open", parent])


@router.post("/files/{file_id}/reveal")
def reveal_file_endpoint(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    f_obj = db.query(File).join(Media, File.media_id == Media.id)\
              .filter(File.id == file_id, Media.user_id == current_user.id).first()
    if not f_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File non trovato")

    source = db.query(Source).filter(Source.id == f_obj.source_id).first()
    if not source or not source.root_path or not os.path.isdir(source.root_path):
        source_name = source.name if source else "sconosciuto"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Il disco '{source_name}' non è raggiungibile o è scollegato."
        )

    rel_path = f_obj.trash_relative_path if f_obj.availability_status == "trashed" else f_obj.relative_path
    safe_path = resolve_safe_source_file(source.root_path, rel_path)
    if not safe_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File non trovato fisicamente sul disco: {rel_path}"
        )

    try:
        reveal_path_in_file_manager(safe_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Impossibile aprire il gestore file: {str(e)}"
        )

    return {
        "status": "success",
        "file_id": f_obj.id,
        "filename": f_obj.filename,
        "source_name": source.name,
        "path": safe_path
    }


@router.post("/{media_id}/reveal")
def reveal_media_endpoint(
    media_id: str,
    file_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    query = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media_id, Source.user_id == current_user.id)
    if file_id:
        query = query.filter(File.id == file_id)

    files = query.all()
    if not files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nessun file associato a questo media")

    for f, s in files:
        if s.root_path and os.path.isdir(s.root_path):
            rel_path = f.trash_relative_path if f.availability_status == "trashed" else f.relative_path
            safe_path = resolve_safe_source_file(s.root_path, rel_path)
            if safe_path:
                try:
                    reveal_path_in_file_manager(safe_path)
                    return {
                        "status": "success",
                        "file_id": f.id,
                        "filename": f.filename,
                        "source_name": s.name,
                        "path": safe_path
                    }
                except Exception as e:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Impossibile aprire il gestore file: {str(e)}"
                    )

    source_names = ", ".join({s.name for _, s in files})
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Tutti i dischi contenenti copie di questo media sono scollegati ({source_names})."
    )
