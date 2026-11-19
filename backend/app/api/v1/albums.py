from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.entities import User, Album, AlbumMedia, Media, Thumbnail
from app.schemas.album_tag import AlbumCreate, AlbumUpdate, AlbumOut, AlbumAddMedia

router = APIRouter(prefix="/albums", tags=["Album"])

@router.get("", response_model=List[AlbumOut])
def list_albums(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    rows = db.query(
        Album,
        func.count(AlbumMedia.id).label("media_count")
    ).outerjoin(AlbumMedia, Album.id == AlbumMedia.album_id)\
     .filter(Album.user_id == current_user.id)\
     .group_by(Album.id)\
     .order_by(Album.name.asc()).all()

    album_ids = [album.id for album, _ in rows]
    cover_map = {}
    if album_ids:
        entries = (
            db.query(AlbumMedia.album_id, AlbumMedia.media_id, Thumbnail.id)
            .outerjoin(Thumbnail, AlbumMedia.media_id == Thumbnail.media_id)
            .filter(AlbumMedia.album_id.in_(album_ids))
            .all()
        )
        for a_id, m_id, t_id in entries:
            if a_id not in cover_map:
                cover_map[a_id] = m_id
            elif t_id:
                cover_map[a_id] = m_id

    return [
        AlbumOut(
            id=album.id,
            user_id=album.user_id,
            name=album.name,
            description=album.description,
            created_at=album.created_at,
            media_count=media_count,
            cover_media_id=cover_map.get(album.id)
        )
        for album, media_count in rows
    ]

@router.post("", response_model=AlbumOut, status_code=status.HTTP_201_CREATED)
def create_album(
    album_in: AlbumCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    album = Album(
        user_id=current_user.id,
        name=album_in.name.strip(),
        description=album_in.description.strip() if album_in.description else None
    )
    db.add(album)
    db.commit()
    db.refresh(album)
    return AlbumOut(
        id=album.id,
        user_id=album.user_id,
        name=album.name,
        description=album.description,
        created_at=album.created_at,
        media_count=0
    )

@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    album = db.query(Album).filter(Album.id == album_id, Album.user_id == current_user.id).first()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album non trovato")
    db.delete(album)
    db.commit()
    return None

@router.patch("/{album_id}", response_model=AlbumOut)
def update_album(
    album_id: str,
    album_in: AlbumUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    album = db.query(Album).filter(Album.id == album_id, Album.user_id == current_user.id).first()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album non trovato")
    if album_in.name is not None:
        album.name = album_in.name.strip()
    if album_in.description is not None:
        album.description = album_in.description.strip() if album_in.description else None
    db.commit()
    db.refresh(album)
    count = db.query(func.count(AlbumMedia.id)).filter(AlbumMedia.album_id == album.id).scalar() or 0
    first_media = db.query(AlbumMedia.media_id).filter(AlbumMedia.album_id == album.id).first()
    return AlbumOut(
        id=album.id,
        user_id=album.user_id,
        name=album.name,
        description=album.description,
        created_at=album.created_at,
        media_count=count,
        cover_media_id=first_media[0] if first_media else None
    )

@router.post("/{album_id}/media", status_code=status.HTTP_200_OK)
def add_media_to_album(
    album_id: str,
    body: AlbumAddMedia,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    album = db.query(Album).filter(Album.id == album_id, Album.user_id == current_user.id).first()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album non trovato")

    added_count = 0
    for media_id in body.media_ids:
        # Check media belongs to user
        media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
        if not media:
            continue
        exists = db.query(AlbumMedia).filter(AlbumMedia.album_id == album_id, AlbumMedia.media_id == media_id).first()
        if not exists:
            db.add(AlbumMedia(album_id=album_id, media_id=media_id))
            added_count += 1
    db.commit()
    return {"status": "ok", "added_count": added_count}

@router.delete("/{album_id}/media/{media_id}", status_code=status.HTTP_200_OK)
def remove_media_from_album(
    album_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    album = db.query(Album).filter(Album.id == album_id, Album.user_id == current_user.id).first()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album non trovato")

    entry = db.query(AlbumMedia).filter(AlbumMedia.album_id == album_id, AlbumMedia.media_id == media_id).first()
    if entry:
        db.delete(entry)
        db.commit()
    return {"status": "ok", "removed": bool(entry)}
