from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.entities import User, Tag, MediaTag, Media
from app.schemas.album_tag import TagCreate, TagOut, TagMediaRequest

router = APIRouter(prefix="/tags", tags=["Tag"])

@router.get("", response_model=List[TagOut])
def list_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    rows = db.query(
        Tag,
        func.count(MediaTag.id).label("media_count")
    ).outerjoin(MediaTag, Tag.id == MediaTag.tag_id)\
     .filter(Tag.user_id == current_user.id)\
     .group_by(Tag.id)\
     .order_by(Tag.name.asc()).all()

    return [
        TagOut(
            id=tag.id,
            user_id=tag.user_id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
            media_count=media_count
        )
        for tag, media_count in rows
    ]

@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
def create_tag(
    tag_in: TagCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    name = tag_in.name.strip()
    existing = db.query(Tag).filter(Tag.user_id == current_user.id, Tag.name == name).first()
    if existing:
        return TagOut(
            id=existing.id,
            user_id=existing.user_id,
            name=existing.name,
            color=existing.color,
            created_at=existing.created_at,
            media_count=db.query(MediaTag).filter(MediaTag.tag_id == existing.id).count()
        )

    tag = Tag(
        user_id=current_user.id,
        name=name,
        color=tag_in.color or "#38bdf8"
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagOut(
        id=tag.id,
        user_id=tag.user_id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        media_count=0
    )

@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag non trovato")
    db.delete(tag)
    db.commit()
    return None

@router.post("/{tag_id}/media", status_code=status.HTTP_200_OK)
def add_media_to_tag(
    tag_id: str,
    body: TagMediaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag non trovato")

    added_count = 0
    for media_id in body.media_ids:
        media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
        if not media:
            continue
        exists = db.query(MediaTag).filter(MediaTag.tag_id == tag_id, MediaTag.media_id == media_id).first()
        if not exists:
            db.add(MediaTag(tag_id=tag_id, media_id=media_id))
            added_count += 1
    db.commit()
    return {"status": "ok", "added_count": added_count}

@router.delete("/{tag_id}/media/{media_id}", status_code=status.HTTP_200_OK)
def remove_media_from_tag(
    tag_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag non trovato")

    entry = db.query(MediaTag).filter(MediaTag.tag_id == tag_id, MediaTag.media_id == media_id).first()
    if entry:
        db.delete(entry)
        db.commit()
    return {"status": "ok", "removed": bool(entry)}
