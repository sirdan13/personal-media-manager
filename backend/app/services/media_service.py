from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc
from fastapi import HTTPException, status
from app.models.entities import Media, File, Source, Thumbnail, ScanJob
from app.schemas.media import MediaOut, MediaDetailOut, FileOut, DuplicateGroupOut

def list_user_media(
    db: Session,
    user_id: str,
    media_type: Optional[str] = None,
    source_id: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "date_desc",
    offset: int = 0,
    limit: int = 50
) -> List[MediaOut]:
    query = db.query(
        Media,
        func.count(File.id).label("copies_count"),
        func.count(Thumbnail.id).label("thumb_count"),
        func.min(File.filename).label("primary_filename"),
        func.max(File.size_bytes).label("primary_size")
    ).outerjoin(File, Media.id == File.media_id)\
     .outerjoin(Thumbnail, Media.id == Thumbnail.media_id)\
     .filter(Media.user_id == user_id)

    if media_type:
        query = query.filter(Media.media_type == media_type)
    
    if source_id:
        query = query.filter(File.source_id == source_id)
        
    if search:
        query = query.filter(File.filename.ilike(f"%{search}%"))

    query = query.group_by(Media.id)

    if sort_by == "date_asc":
        query = query.order_by(asc(Media.captured_at), asc(Media.created_at))
    elif sort_by == "name_asc":
        query = query.order_by(asc(func.min(File.filename)))
    elif sort_by == "name_desc":
        query = query.order_by(desc(func.min(File.filename)))
    elif sort_by == "size_desc":
        query = query.order_by(desc(func.max(File.size_bytes)))
    elif sort_by == "size_asc":
        query = query.order_by(asc(func.max(File.size_bytes)))
    else: # date_desc
        query = query.order_by(desc(Media.captured_at), desc(Media.created_at))

    rows = query.offset(offset).limit(limit).all()

    results = []
    for media, copies_count, thumb_count, p_filename, p_size in rows:
        results.append(MediaOut(
            id=media.id,
            user_id=media.user_id,
            media_type=media.media_type,
            canonical_sha256=media.canonical_sha256,
            captured_at=media.captured_at,
            width=media.width,
            height=media.height,
            duration_seconds=media.duration_seconds,
            copies_count=copies_count,
            has_thumbnail=thumb_count > 0,
            is_live_photo=bool(getattr(media, "is_live_photo", 0)),
            live_video_media_id=getattr(media, "live_video_media_id", None),
            dhash=getattr(media, "dhash", None),
            latitude=getattr(media, "latitude", None),
            longitude=getattr(media, "longitude", None),
            primary_filename=p_filename,
            primary_size_bytes=p_size,
            created_at=media.created_at
        ))
    return results

def get_media_detail(db: Session, user_id: str, media_id: str) -> MediaDetailOut:
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == user_id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    files = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media.id).all()

    file_outs = []
    for f, s in files:
        file_outs.append(FileOut(
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
            first_indexed_at=f.first_indexed_at,
            last_seen_at=f.last_seen_at
        ))

    has_thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media.id).first() is not None

    return MediaDetailOut(
        id=media.id,
        user_id=media.user_id,
        media_type=media.media_type,
        canonical_sha256=media.canonical_sha256,
        captured_at=media.captured_at,
        width=media.width,
        height=media.height,
        duration_seconds=media.duration_seconds,
        copies_count=len(file_outs),
        has_thumbnail=has_thumb,
        is_live_photo=bool(getattr(media, "is_live_photo", 0)),
        live_video_media_id=getattr(media, "live_video_media_id", None),
        dhash=getattr(media, "dhash", None),
        latitude=getattr(media, "latitude", None),
        longitude=getattr(media, "longitude", None),
        primary_filename=file_outs[0].filename if file_outs else None,
        primary_size_bytes=file_outs[0].size_bytes if file_outs else None,
        created_at=media.created_at,
        files=file_outs
    )

def list_duplicate_groups(
    db: Session,
    user_id: str,
    offset: int = 0,
    limit: int = 50
) -> List[DuplicateGroupOut]:
    # Media with more than 1 file copy
    subquery = db.query(
        File.media_id,
        func.count(File.id).label("c")
    ).group_by(File.media_id).having(func.count(File.id) > 1).subquery()

    rows = db.query(Media).join(subquery, Media.id == subquery.c.media_id)\
             .filter(Media.user_id == user_id)\
             .order_by(desc(Media.created_at))\
             .offset(offset).limit(limit).all()

    results = []
    for media in rows:
        files = db.query(File, Source).join(Source, File.source_id == Source.id)\
                  .filter(File.media_id == media.id).all()
        file_outs = []
        total_size = 0
        for f, s in files:
            total_size += f.size_bytes
            file_outs.append(FileOut(
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
                first_indexed_at=f.first_indexed_at,
                last_seen_at=f.last_seen_at
            ))

        has_thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media.id).first() is not None

        results.append(DuplicateGroupOut(
            media_id=media.id,
            canonical_sha256=media.canonical_sha256,
            copies_count=len(file_outs),
            total_size_bytes=total_size,
            media_type=media.media_type,
            has_thumbnail=has_thumb,
            files=file_outs
        ))

    return results

def get_dashboard_stats(db: Session, user_id: str) -> Dict[str, Any]:
    total_photos = db.query(func.count(Media.id))\
                     .filter(Media.user_id == user_id, Media.media_type == "image").scalar() or 0
    total_videos = db.query(func.count(Media.id))\
                     .filter(Media.user_id == user_id, Media.media_type == "video").scalar() or 0
    total_sources = db.query(func.count(Source.id))\
                      .filter(Source.user_id == user_id).scalar() or 0
    
    total_physical_copies = db.query(func.count(File.id))\
                              .join(Media, File.media_id == Media.id)\
                              .filter(Media.user_id == user_id).scalar() or 0
    
    total_unique_media = total_photos + total_videos
    duplicate_copies = max(0, total_physical_copies - total_unique_media)

    total_bytes = db.query(func.sum(File.size_bytes))\
                    .join(Media, File.media_id == Media.id)\
                    .filter(Media.user_id == user_id).scalar() or 0

    return {
        "total_photos": total_photos,
        "total_videos": total_videos,
        "total_sources": total_sources,
        "total_physical_copies": total_physical_copies,
        "duplicate_copies": duplicate_copies,
        "total_bytes_indexed": total_bytes
    }
