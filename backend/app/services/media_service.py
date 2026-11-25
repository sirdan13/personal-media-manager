from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, and_, or_, exists
from fastapi import HTTPException, status
from app.models.entities import Media, File, Source, Thumbnail, ScanJob, Album, AlbumMedia, Tag, MediaTag
from app.schemas.media import (
    MediaOut, MediaDetailOut, FileOut, DuplicateGroupOut,
    TimelineBucketOut, MapMediaOut, MediaAlbumTagItem
)
from app.services.source_service import get_source_by_id

RAW_EXTENSIONS = {
    "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2",
    "raf", "orf", "rw2", "raw", "pef", "srw", "3fr", "fff", "iiq",
    "x3f", "rwl", "erf", "kdc", "dcr", "mos"
}

INACTIVE_FILE_STATUSES = ("missing", "trashed")

def compute_protection_status(copies_count: int, distinct_sources_count: int) -> str:
    if copies_count <= 0:
        return "missing"
    if copies_count > distinct_sources_count:
        return "intra_source_duplicate"
    if distinct_sources_count >= 2:
        return "protected"
    return "unprotected"

def list_user_media(
    db: Session,
    user_id: str,
    media_type: Optional[str] = None,
    source_id: Optional[str] = None,
    search: Optional[str] = None,
    album_id: Optional[str] = None,
    tag_id: Optional[str] = None,
    month_key: Optional[str] = None,
    lat_min: Optional[float] = None,
    lat_max: Optional[float] = None,
    lon_min: Optional[float] = None,
    lon_max: Optional[float] = None,
    is_favorite: Optional[bool] = None,
    protection_status: Optional[str] = None,
    sort_by: str = "date_desc",
    offset: int = 0,
    limit: int = 50,
    include_total: bool = False
):
    prot_global = (
        db.query(
            File.media_id.label("m_id"),
            func.count(func.distinct(File.id)).label("c_files"),
            func.count(func.distinct(File.source_id)).label("c_sources")
        )
        .filter(File.availability_status.notin_(INACTIVE_FILE_STATUSES))
        .group_by(File.media_id)
        .subquery()
    )

    query = db.query(
        Media,
        func.coalesce(prot_global.c.c_files, 0).label("copies_count"),
        func.coalesce(prot_global.c.c_sources, 0).label("distinct_sources_count"),
        func.count(func.distinct(Thumbnail.id)).label("thumb_count"),
        func.min(File.filename).label("primary_filename"),
        func.min(File.extension).label("primary_extension"),
        func.max(File.size_bytes).label("primary_size")
    ).outerjoin(prot_global, Media.id == prot_global.c.m_id)\
     .outerjoin(File, Media.id == File.media_id)\
     .outerjoin(Thumbnail, Media.id == Thumbnail.media_id)\
     .filter(Media.user_id == user_id)

    if media_type:
        if media_type.lower() == "raw":
            query = query.filter(func.lower(File.extension).in_(RAW_EXTENSIONS))
        else:
            query = query.filter(Media.media_type == media_type)
    else:
        # Hide secondary live photo MOV videos from main gallery
        live_video_subq = db.query(Media.live_video_media_id).filter(
            Media.user_id == user_id,
            Media.live_video_media_id.isnot(None)
        )
        query = query.filter(~Media.id.in_(live_video_subq))
    
    if is_favorite is not None:
        query = query.filter(Media.is_favorite == (1 if is_favorite else 0))

    if source_id:
        query = query.filter(File.source_id == source_id)
        
    if search:
        s = f"%{search.strip()}%"
        tag_match_subq = exists().where(
            MediaTag.media_id == Media.id,
            MediaTag.tag_id == Tag.id,
            Tag.name.ilike(s)
        )
        query = query.filter(
            or_(
                File.filename.ilike(s),
                File.relative_path.ilike(s),
                File.extension.ilike(s),
                File.metadata_json.ilike(s),
                Media.place_name.ilike(s),
                tag_match_subq,
                func.strftime('%Y', func.coalesce(Media.captured_at, Media.created_at)).ilike(s),
                func.strftime('%Y-%m', func.coalesce(Media.captured_at, Media.created_at)).ilike(s)
            )
        )

    if album_id:
        query = query.join(AlbumMedia, Media.id == AlbumMedia.media_id)\
                     .filter(AlbumMedia.album_id == album_id)

    if tag_id:
        query = query.join(MediaTag, Media.id == MediaTag.media_id)\
                     .filter(MediaTag.tag_id == tag_id)

    if month_key:
        query = query.filter(
            func.strftime('%Y-%m', func.coalesce(Media.captured_at, Media.created_at)) == month_key
        )

    # GPS bounding box filter (e.g. from clicking a cluster or location on map)
    if lat_min is not None and lat_max is not None:
        query = query.filter(Media.latitude >= lat_min, Media.latitude <= lat_max)
    if lon_min is not None and lon_max is not None:
        query = query.filter(Media.longitude >= lon_min, Media.longitude <= lon_max)

    if protection_status == "missing":
        from sqlalchemy.orm import aliased
        FileMissing = aliased(File)
        missing_file_exists = exists().where(
            FileMissing.media_id == Media.id,
            FileMissing.availability_status == "missing"
        )
        query = query.filter(
            func.coalesce(prot_global.c.c_files, 0) == 0,
            missing_file_exists
        )
    else:
        # Exclude completely missing/trashed orphan media from normal library views
        query = query.filter(func.coalesce(prot_global.c.c_files, 0) >= 1)
        if protection_status == "unprotected":
            query = query.filter(and_(prot_global.c.c_sources == 1, prot_global.c.c_files == 1))
        elif protection_status == "protected":
            query = query.filter(and_(prot_global.c.c_sources >= 2, prot_global.c.c_files == prot_global.c.c_sources))
        elif protection_status == "intra_source_duplicate":
            query = query.filter(prot_global.c.c_files > prot_global.c.c_sources)

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

    total_count = 0
    if include_total:
        count_subquery = query.statement.with_only_columns(Media.id).order_by(None).subquery()
        total_count = db.query(func.count()).select_from(count_subquery).scalar() or 0

    rows = query.offset(offset).limit(limit).all()

    results = []
    for media, copies_count, distinct_sources_count, thumb_count, p_filename, p_extension, p_size in rows:
        c_count = int(copies_count or 0)
        s_count = int(distinct_sources_count or 0)
        prot_status = compute_protection_status(c_count, s_count)
        results.append(MediaOut(
            id=media.id,
            user_id=media.user_id,
            media_type=media.media_type,
            canonical_sha256=media.canonical_sha256,
            captured_at=media.captured_at,
            width=media.width,
            height=media.height,
            duration_seconds=media.duration_seconds,
            copies_count=c_count,
            distinct_sources_count=s_count,
            protection_status=prot_status,
            has_thumbnail=thumb_count > 0,
            is_live_photo=bool(getattr(media, "is_live_photo", 0)),
            live_video_media_id=getattr(media, "live_video_media_id", None),
            dhash=getattr(media, "dhash", None),
            latitude=getattr(media, "latitude", None),
            longitude=getattr(media, "longitude", None),
            place_name=getattr(media, "place_name", None),
            is_favorite=bool(getattr(media, "is_favorite", 0)),
            primary_filename=p_filename,
            primary_extension=p_extension,
            primary_size_bytes=p_size,
            created_at=media.created_at
        ))
    if include_total:
        return results, total_count
    return results

def get_media_detail(db: Session, user_id: str, media_id: str) -> MediaDetailOut:
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == user_id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")

    files = db.query(File, Source).join(Source, File.source_id == Source.id)\
              .filter(File.media_id == media.id).all()

    # Auto-repair legacy low-res metadata (e.g. <= 200px from initial RAW thumbnail bug) when file is online
    if (media.width is None or media.width <= 200) and files:
        for f, s in files:
            if s.root_path and s.status == "online":
                try:
                    from app.services.source_service import resolve_safe_source_file
                    safe_path = resolve_safe_source_file(s.root_path, f.relative_path)
                    if safe_path:
                        from app.services.media_preview_service import generate_image_preview_bytes
                        _, true_w, true_h, meta, _ = generate_image_preview_bytes(safe_path)
                        if true_w and true_w > 200:
                            media.width = true_w
                            media.height = true_h
                            f.width = true_w
                            f.height = true_h
                            db.commit()
                            break
                except Exception:
                    db.rollback()

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
            trash_relative_path=f.trash_relative_path,
            trashed_at=f.trashed_at,
            metadata_json=f.metadata_json,
            first_indexed_at=f.first_indexed_at,
            last_seen_at=f.last_seen_at
        ))

    has_thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media.id).first() is not None

    # Fetch albums and tags for this media
    album_rows = db.query(Album.id, Album.name)\
                   .join(AlbumMedia, Album.id == AlbumMedia.album_id)\
                   .filter(AlbumMedia.media_id == media.id).all()
    media_albums = [MediaAlbumTagItem(id=a_id, name=a_name) for a_id, a_name in album_rows]

    tag_rows = db.query(Tag.id, Tag.name, Tag.color)\
                 .join(MediaTag, Tag.id == MediaTag.tag_id)\
                 .filter(MediaTag.media_id == media.id).all()
    media_tags = [MediaAlbumTagItem(id=t_id, name=t_name, color=t_color) for t_id, t_name, t_color in tag_rows]

    active_files = [f for f in file_outs if f.availability_status not in INACTIVE_FILE_STATUSES]
    c_count = len(active_files)
    s_count = len({f.source_id for f in active_files})
    prot_status = compute_protection_status(c_count, s_count)

    return MediaDetailOut(
        id=media.id,
        user_id=media.user_id,
        media_type=media.media_type,
        canonical_sha256=media.canonical_sha256,
        captured_at=media.captured_at,
        width=media.width,
        height=media.height,
        duration_seconds=media.duration_seconds,
        copies_count=c_count,
        distinct_sources_count=s_count,
        protection_status=prot_status,
        has_thumbnail=has_thumb,
        is_live_photo=bool(getattr(media, "is_live_photo", 0)),
        live_video_media_id=getattr(media, "live_video_media_id", None),
        dhash=getattr(media, "dhash", None),
        latitude=getattr(media, "latitude", None),
        longitude=getattr(media, "longitude", None),
        place_name=getattr(media, "place_name", None),
        is_favorite=bool(getattr(media, "is_favorite", 0)),
        primary_filename=file_outs[0].filename if file_outs else None,
        primary_extension=file_outs[0].extension if file_outs else None,
        primary_size_bytes=file_outs[0].size_bytes if file_outs else None,
        created_at=media.created_at,
        files=file_outs,
        albums=media_albums,
        tags=media_tags
    )

def toggle_media_favorite(db: Session, user_id: str, media_id: str) -> bool:
    media = db.query(Media).filter(Media.id == media_id, Media.user_id == user_id).first()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media non trovato")
    curr = getattr(media, "is_favorite", 0) or 0
    new_fav = 0 if curr == 1 else 1
    media.is_favorite = new_fav
    db.commit()
    return bool(new_fav)


def batch_set_favorite(db: Session, user_id: str, media_ids: List[str], is_favorite: bool) -> int:
    fav_val = 1 if is_favorite else 0
    updated = db.query(Media).filter(
        Media.user_id == user_id,
        Media.id.in_(media_ids)
    ).update({Media.is_favorite: fav_val}, synchronize_session=False)
    db.commit()
    return updated


def get_timeline_buckets(db: Session, user_id: str) -> List[TimelineBucketOut]:
    live_video_subq = db.query(Media.live_video_media_id).filter(
        Media.user_id == user_id,
        Media.live_video_media_id.isnot(None)
    )
    month_expr = func.strftime('%Y-%m', func.coalesce(Media.captured_at, Media.created_at)).label("month_key")
    rows = db.query(
        month_expr,
        func.count(Media.id).label("c")
    ).filter(
        Media.user_id == user_id,
        ~Media.id.in_(live_video_subq)
    )\
     .group_by("month_key")\
     .order_by(desc("month_key")).all()

    buckets = []
    for m_key, count in rows:
        if not m_key:
            continue
        try:
            parts = m_key.split("-")
            year = int(parts[0])
            month = int(parts[1])
        except (ValueError, IndexError):
            continue
        buckets.append(TimelineBucketOut(
            month_key=m_key,
            year=year,
            month=month,
            count=count
        ))
    return buckets

def get_map_media(db: Session, user_id: str) -> List[MapMediaOut]:
    rows = db.query(
        Media,
        func.count(Thumbnail.id).label("thumb_count"),
        func.min(File.filename).label("primary_filename")
    ).outerjoin(Thumbnail, Media.id == Thumbnail.media_id)\
     .outerjoin(File, Media.id == File.media_id)\
     .filter(
         Media.user_id == user_id,
         Media.latitude.isnot(None),
         Media.longitude.isnot(None)
     ).group_by(Media.id)\
      .order_by(desc(Media.captured_at)).all()

    results = []
    for media, thumb_count, p_filename in rows:
        results.append(MapMediaOut(
            id=media.id,
            latitude=float(media.latitude),
            longitude=float(media.longitude),
            primary_filename=p_filename,
            captured_at=media.captured_at,
            has_thumbnail=thumb_count > 0,
            media_type=media.media_type,
            place_name=getattr(media, "place_name", None)
        ))
    return results

def list_duplicate_groups(
    db: Session,
    user_id: str,
    offset: int = 0,
    limit: int = 50,
    mode: str = "all",
    sort_by: str = "size_desc"
) -> List[DuplicateGroupOut]:
    subq_builder = db.query(
        File.media_id,
        func.count(File.id).label("c"),
        func.count(func.distinct(File.source_id)).label("s"),
        func.max(File.size_bytes).label("file_size"),
        (func.max(File.size_bytes) * (func.count(File.id) - func.count(func.distinct(File.source_id)))).label("wasted_size")
    ).filter(File.availability_status.notin_(INACTIVE_FILE_STATUSES))\
     .group_by(File.media_id)

    if mode == "intra_source":
        subquery = subq_builder.having(func.count(File.id) > func.count(func.distinct(File.source_id))).subquery()
    elif mode == "multi_source":
        subquery = subq_builder.having(and_(
            func.count(func.distinct(File.source_id)) >= 2,
            func.count(File.id) == func.count(func.distinct(File.source_id))
        )).subquery()
    else:  # "all"
        subquery = subq_builder.having(func.count(File.id) > 1).subquery()

    query = db.query(Media).join(subquery, Media.id == subquery.c.media_id)\
             .filter(Media.user_id == user_id)

    if sort_by == "size_desc":
        query = query.order_by(desc(subquery.c.file_size), desc(Media.created_at))
    elif sort_by == "size_asc":
        query = query.order_by(asc(subquery.c.file_size), desc(Media.created_at))
    elif sort_by == "wasted_desc":
        query = query.order_by(desc(subquery.c.wasted_size), desc(subquery.c.file_size), desc(Media.created_at))
    elif sort_by == "copies_desc":
        query = query.order_by(desc(subquery.c.c), desc(subquery.c.file_size), desc(Media.created_at))
    elif sort_by == "oldest":
        query = query.order_by(asc(Media.created_at))
    elif sort_by == "newest":
        query = query.order_by(desc(Media.created_at))
    else:
        query = query.order_by(desc(subquery.c.file_size), desc(Media.created_at))

    rows = query.offset(offset).limit(limit).all()

    if not rows:
        return []

    page_media_ids = [m.id for m in rows]

    # Bulk query 1: All files for these media
    files_with_sources = db.query(File, Source).join(Source, File.source_id == Source.id)\
                           .filter(File.media_id.in_(page_media_ids), File.availability_status.notin_(INACTIVE_FILE_STATUSES)).all()

    files_by_media: Dict[str, List[FileOut]] = {mid: [] for mid in page_media_ids}
    total_sizes_by_media: Dict[str, int] = {mid: 0 for mid in page_media_ids}

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
        total_sizes_by_media[f.media_id] += f.size_bytes

    # Bulk query 2: Thumbnail presence
    thumbs = db.query(Thumbnail.media_id).filter(Thumbnail.media_id.in_(page_media_ids)).all()
    thumb_media_ids = {t[0] for t in thumbs}

    results = []
    for media in rows:
        file_outs = files_by_media.get(media.id, [])
        total_size = total_sizes_by_media.get(media.id, 0)
        c_count = len(file_outs)
        s_count = len({f.source_id for f in file_outs})
        single_size = max((f.size_bytes for f in file_outs), default=0)
        intra_wasted = single_size * max(0, c_count - s_count)
        multi_backup = single_size * max(0, s_count - 1)

        if s_count >= 2 and c_count == s_count:
            red_type = "healthy_multi_source"
        elif s_count == 1 and c_count > 1:
            red_type = "intra_source_duplicate"
        else:
            red_type = "mixed"

        results.append(DuplicateGroupOut(
            media_id=media.id,
            canonical_sha256=media.canonical_sha256,
            copies_count=c_count,
            distinct_sources_count=s_count,
            redundancy_type=red_type,
            intra_source_wasted_bytes=intra_wasted,
            multi_source_backup_bytes=multi_backup,
            total_size_bytes=total_size,
            media_type=media.media_type,
            has_thumbnail=media.id in thumb_media_ids,
            files=file_outs
        ))

    return results

def get_duplicates_summary(db: Session, user_id: str) -> Dict[str, Any]:
    subq = db.query(
        Media.id.label("media_id"),
        Media.is_favorite.label("is_favorite"),
        func.count(File.id).label("copies"),
        func.count(func.distinct(File.source_id)).label("sources"),
        func.coalesce(func.max(File.size_bytes), 0).label("max_size")
    ).join(File, Media.id == File.media_id)\
     .filter(Media.user_id == user_id, File.availability_status.notin_(INACTIVE_FILE_STATUSES))\
     .group_by(Media.id, Media.is_favorite).subquery()

    rows = db.query(
        subq.c.copies,
        subq.c.sources,
        subq.c.max_size,
        subq.c.is_favorite
    ).all()

    total_active = len(rows)
    total_groups = 0
    intra_source_groups = 0
    healthy_multi_source_groups = 0
    unprotected_count = 0
    unprotected_fav_count = 0
    protected_count = 0
    intra_wasted_bytes = 0
    multi_backup_bytes = 0
    total_redundant_copies = 0
    total_recoverable_bytes = 0

    for copies, sources, max_size, is_fav in rows:
        copies = int(copies or 0)
        sources = int(sources or 0)
        max_size = int(max_size or 0)
        is_fav = bool(is_fav)

        if copies > 1:
            total_groups += 1
            total_redundant_copies += (copies - 1)
            total_recoverable_bytes += max_size * (copies - 1)

        if copies > sources:
            intra_source_groups += 1
            intra_wasted_bytes += max_size * (copies - sources)

        if sources >= 2:
            protected_count += 1
            multi_backup_bytes += max_size * (sources - 1)
            if copies == sources:
                healthy_multi_source_groups += 1
        else:
            if copies <= 1:
                unprotected_count += 1
                if is_fav:
                    unprotected_fav_count += 1

    coverage_pct = round((protected_count / total_active * 100), 1) if total_active > 0 else 0.0

    return {
        "total_groups": total_groups,
        "intra_source_groups": intra_source_groups,
        "healthy_multi_source_groups": healthy_multi_source_groups,
        "unprotected_media_count": unprotected_count,
        "unprotected_favorites_count": unprotected_fav_count,
        "protected_media_count": protected_count,
        "protection_coverage_pct": coverage_pct,
        "intra_source_wasted_bytes": intra_wasted_bytes,
        "multi_source_backup_bytes": multi_backup_bytes,
        "total_redundant_copies": total_redundant_copies,
        "total_recoverable_bytes": total_recoverable_bytes
    }

def compute_backup_gap(
    db: Session,
    user_id: str,
    primary_source_id: str,
    backup_source_id: str,
    only_favorites: bool = False
) -> Dict[str, Any]:
    # 1. Ownership check
    get_source_by_id(db, user_id, primary_source_id)
    get_source_by_id(db, user_id, backup_source_id)

    # 2. Get active media on primary source
    prim_query = db.query(
        Media,
        File
    ).join(File, Media.id == File.media_id)\
     .filter(
         Media.user_id == user_id,
         File.source_id == primary_source_id,
         File.availability_status.notin_(INACTIVE_FILE_STATUSES)
     )

    if only_favorites:
        prim_query = prim_query.filter(Media.is_favorite == 1)

    primary_records = prim_query.order_by(desc(Media.captured_at), desc(Media.created_at)).all()

    # Deduplicate primary media by media.id (keep first physical file found on primary)
    primary_media_map: Dict[str, tuple] = {}
    for media, f in primary_records:
        if media.id not in primary_media_map:
            primary_media_map[media.id] = (media, f)

    total_primary = len(primary_media_map)

    # 3. Get all active media ids on backup source
    backup_rows = db.query(File.media_id)\
                    .join(Media, File.media_id == Media.id)\
                    .filter(
                        Media.user_id == user_id,
                        File.source_id == backup_source_id,
                        File.availability_status.notin_(INACTIVE_FILE_STATUSES)
                    ).distinct().all()
    backed_up_media_ids = {r[0] for r in backup_rows}

    # Thumbnail presence lookup for primary media
    primary_ids = list(primary_media_map.keys())
    thumb_rows = db.query(Thumbnail.media_id).filter(Thumbnail.media_id.in_(primary_ids)).all()
    thumb_set = {t[0] for t in thumb_rows}

    # 4. Construct missing items list
    missing_items = []
    backed_up_count = 0

    for m_id, (media, primary_file) in primary_media_map.items():
        if m_id in backed_up_media_ids:
            backed_up_count += 1
        else:
            missing_items.append({
                "media_id": media.id,
                "canonical_sha256": media.canonical_sha256,
                "filename": primary_file.filename,
                "relative_path": primary_file.relative_path,
                "size_bytes": primary_file.size_bytes,
                "captured_at": media.captured_at.isoformat() if media.captured_at else None,
                "is_favorite": bool(media.is_favorite),
                "has_thumbnail": media.id in thumb_set,
                "media_type": media.media_type
            })

    coverage_pct = round(backed_up_count / total_primary * 100, 1) if total_primary > 0 else 100.0

    return {
        "primary_source_id": primary_source_id,
        "backup_source_id": backup_source_id,
        "total_primary_media": total_primary,
        "backed_up_media": backed_up_count,
        "missing_on_backup_count": len(missing_items),
        "missing_on_backup_bytes": sum(x["size_bytes"] for x in missing_items),
        "coverage_pct": coverage_pct,
        "missing_items": missing_items
    }

def get_dashboard_stats(db: Session, user_id: str) -> Dict[str, Any]:
    active_media_exists = exists().where(
        File.media_id == Media.id,
        File.availability_status.notin_(INACTIVE_FILE_STATUSES)
    )
    missing_file_exists = exists().where(
        File.media_id == Media.id,
        File.availability_status == "missing"
    )

    total_photos = db.query(func.count(Media.id))\
                     .filter(Media.user_id == user_id, Media.media_type == "image", active_media_exists).scalar() or 0
    total_videos = db.query(func.count(Media.id))\
                     .filter(Media.user_id == user_id, Media.media_type == "video", active_media_exists).scalar() or 0
    total_sources = db.query(func.count(Source.id))\
                      .filter(Source.user_id == user_id).scalar() or 0
    
    total_physical_copies = db.query(func.count(File.id))\
                              .join(Media, File.media_id == Media.id)\
                              .filter(Media.user_id == user_id, File.availability_status.notin_(INACTIVE_FILE_STATUSES)).scalar() or 0
    
    total_unique_media = total_photos + total_videos
    duplicate_copies = max(0, total_physical_copies - total_unique_media)

    total_bytes = db.query(func.sum(File.size_bytes))\
                    .join(Media, File.media_id == Media.id)\
                    .filter(Media.user_id == user_id, File.availability_status.notin_(INACTIVE_FILE_STATUSES)).scalar() or 0

    thumb_subq = db.query(Thumbnail.media_id)
    missing_thumbnails_count = db.query(func.count(Media.id))\
                                 .filter(Media.user_id == user_id, active_media_exists, ~Media.id.in_(thumb_subq))\
                                 .scalar() or 0

    geotagged_count = db.query(func.count(Media.id))\
                        .filter(Media.user_id == user_id, active_media_exists, Media.latitude.isnot(None))\
                        .scalar() or 0

    favorites_count = db.query(func.count(Media.id))\
                        .filter(Media.user_id == user_id, active_media_exists, Media.is_favorite == True)\
                        .scalar() or 0

    live_photos_count = db.query(func.count(Media.id))\
                          .filter(Media.user_id == user_id, active_media_exists, Media.is_live_photo == True)\
                          .scalar() or 0

    raw_exts = RAW_EXTENSIONS | {f".{ext}" for ext in RAW_EXTENSIONS}
    raw_count = db.query(func.count(func.distinct(Media.id)))\
                  .join(File, Media.id == File.media_id)\
                  .filter(
                      Media.user_id == user_id,
                      File.availability_status.notin_(INACTIVE_FILE_STATUSES),
                      func.lower(File.extension).in_(raw_exts)
                  )\
                  .scalar() or 0

    missing_media_count = db.query(func.count(Media.id))\
                            .filter(Media.user_id == user_id, ~active_media_exists, missing_file_exists)\
                            .scalar() or 0
    missing_files_count = db.query(func.count(File.id))\
                            .join(Media, File.media_id == Media.id)\
                            .filter(Media.user_id == user_id, File.availability_status == "missing")\
                            .scalar() or 0

    dup_summary = get_duplicates_summary(db, user_id)
    recoverable_duplicate_bytes = dup_summary.get("total_recoverable_bytes", 0)

    user_sources = db.query(Source).filter(Source.user_id == user_id).all()
    storage_by_source = []
    for src in user_sources:
        src_stats = db.query(
            func.count(File.id).label("file_count"),
            func.coalesce(func.sum(File.size_bytes), 0).label("total_bytes")
        ).filter(File.source_id == src.id, File.availability_status.notin_(INACTIVE_FILE_STATUSES)).first()
        storage_by_source.append({
            "source_id": src.id,
            "source_name": src.name,
            "status": src.status,
            "file_count": int(src_stats.file_count or 0) if src_stats else 0,
            "total_bytes": int(src_stats.total_bytes or 0) if src_stats else 0,
        })
    storage_by_source.sort(key=lambda s: s["total_bytes"], reverse=True)

    return {
        "total_photos": total_photos,
        "total_videos": total_videos,
        "total_sources": total_sources,
        "total_physical_copies": total_physical_copies,
        "duplicate_copies": duplicate_copies,
        "total_bytes_indexed": total_bytes,
        "missing_thumbnails_count": missing_thumbnails_count,
        "missing_media_count": missing_media_count,
        "missing_files_count": missing_files_count,
        "geotagged_count": geotagged_count,
        "favorites_count": favorites_count,
        "raw_count": raw_count,
        "live_photos_count": live_photos_count,
        "recoverable_duplicate_bytes": recoverable_duplicate_bytes,
        "protection_coverage_pct": dup_summary.get("protection_coverage_pct", 0.0),
        "protected_media_count": dup_summary.get("protected_media_count", 0),
        "unprotected_media_count": dup_summary.get("unprotected_media_count", 0),
        "intra_source_wasted_bytes": dup_summary.get("intra_source_wasted_bytes", 0),
        "multi_source_backup_bytes": dup_summary.get("multi_source_backup_bytes", 0),
        "storage_by_source": storage_by_source
    }
