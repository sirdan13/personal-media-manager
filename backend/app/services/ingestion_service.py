import os
import io
import base64
import json
from typing import Optional
from datetime import datetime, timezone
from PIL import Image, ImageOps
from sqlalchemy.orm import Session
from app.models.entities import Media, File, Thumbnail, User, generate_uuid
from app.schemas.scan import ScanBatchRequest, ScanBatchResponse
from app.services.scan_service import get_scan_job
from app.core.config import settings

def process_scan_batch(
    db: Session,
    user_id: str,
    scan_id: str,
    batch_data: ScanBatchRequest
) -> ScanBatchResponse:
    job = get_scan_job(db, user_id, scan_id)
    source_id = job.source_id

    # Retrieve user thumbnail profile
    user = db.query(User).filter(User.id == user_id).first()
    thumb_profile = getattr(user, "thumbnail_profile", "balanced") if user else "balanced"

    new_media_count = 0
    duplicate_instances_count = 0
    processed_count = 0
    failed_count = 0

    now = datetime.now(timezone.utc)

    IGNORED_EXTENSIONS = {"aae", "xmp", "lrv", "thm", "dat", "ds_store", "db", "ini"}

    # Pre-resolve GPS places in batch
    coords = []
    for item in batch_data.items:
        if item.metadata_json:
            lat = item.metadata_json.get("latitude")
            lon = item.metadata_json.get("longitude")
            if lat is not None and lon is not None:
                try:
                    coords.append((float(lat), float(lon)))
                except (ValueError, TypeError):
                    pass

    places_map = {}
    if coords:
        try:
            from app.services.geo_service import resolve_and_cache_places_batch, coord_to_key
            places_map = resolve_and_cache_places_batch(db, coords)
        except Exception as e:
            print(f"Batch geocoding warning: {e}")

    for item in batch_data.items:
        try:
            # Ignore sidecar and non-media system files
            if item.extension and item.extension.lower() in IGNORED_EXTENSIONS:
                continue

            # 1. Check if logical Media exists for this user and hash
            media = db.query(Media).filter(
                Media.user_id == user_id,
                Media.canonical_sha256 == item.sha256
            ).first()

            lat = item.metadata_json.get("latitude") if item.metadata_json else None
            lon = item.metadata_json.get("longitude") if item.metadata_json else None
            place = None
            if lat is not None and lon is not None:
                try:
                    from app.services.geo_service import coord_to_key
                    place = places_map.get(coord_to_key(float(lat), float(lon)))
                except Exception:
                    pass

            if not media:
                media_type = "video" if item.mime_type.startswith("video") else "image"
                media = Media(
                    id=generate_uuid(),
                    user_id=user_id,
                    media_type=media_type,
                    canonical_sha256=item.sha256,
                    captured_at=item.captured_at,
                    width=item.width,
                    height=item.height,
                    duration_seconds=item.duration_seconds,
                    latitude=lat,
                    longitude=lon,
                    place_name=place
                )
                db.add(media)
                db.flush() # Flush to get media.id
                new_media_count += 1
            else:
                # Media already exists -> this new file instance is a duplicate/additional copy!
                duplicate_instances_count += 1
                # If existing media lacked metadata, update it
                if not media.captured_at and item.captured_at:
                    media.captured_at = item.captured_at
                if not media.width and item.width:
                    media.width = item.width
                    media.height = item.height
                if media.latitude is None and lat is not None:
                    media.latitude = lat
                    media.longitude = lon
                    if not media.place_name and place:
                        media.place_name = place

            # 2. Check if File record already exists for this source and path (Idempotency)
            existing_file = db.query(File).filter(
                File.source_id == source_id,
                File.relative_path == item.relative_path
            ).first()

            meta_str = json.dumps(item.metadata_json) if item.metadata_json else None

            if existing_file:
                old_media_id = existing_file.media_id if existing_file.media_id != media.id else None

                # Update existing record
                existing_file.media_id = media.id
                existing_file.sha256 = item.sha256
                existing_file.size_bytes = item.size_bytes
                existing_file.filename = item.filename
                existing_file.extension = item.extension
                existing_file.mime_type = item.mime_type
                existing_file.filesystem_modified_at = item.filesystem_modified_at
                existing_file.captured_at = item.captured_at
                existing_file.width = item.width
                existing_file.height = item.height
                existing_file.duration_seconds = item.duration_seconds
                existing_file.metadata_json = meta_str
                existing_file.availability_status = "available"
                existing_file.last_seen_at = now

                # If file changed media and old media has no remaining copies, clean it up
                if old_media_id:
                    db.flush()
                    remaining = db.query(File).filter(File.media_id == old_media_id).count()
                    if remaining == 0:
                        db.query(Media).filter(Media.id == old_media_id).delete()
            else:
                new_file = File(
                    id=generate_uuid(),
                    media_id=media.id,
                    source_id=source_id,
                    filename=item.filename,
                    relative_path=item.relative_path,
                    extension=item.extension,
                    mime_type=item.mime_type,
                    size_bytes=item.size_bytes,
                    filesystem_modified_at=item.filesystem_modified_at,
                    filesystem_created_at=item.filesystem_created_at,
                    captured_at=item.captured_at,
                    width=item.width,
                    height=item.height,
                    duration_seconds=item.duration_seconds,
                    metadata_json=meta_str,
                    sha256=item.sha256,
                    availability_status="available",
                    first_indexed_at=now,
                    last_seen_at=now
                )
                db.add(new_file)

            # 3. Store Thumbnail on disk if provided and not yet stored
            if item.thumbnail_base64:
                save_thumbnail(db, media.id, item.sha256, item.thumbnail_base64, profile=thumb_profile)

            processed_count += 1
            if batch_data.checkpoint_path:
                job.last_checkpoint_path = batch_data.checkpoint_path

        except Exception as e:
            failed_count += 1
            print(f"Error processing item {item.relative_path}: {e}")

    try:
        job.processed_files = (job.processed_files or 0) + processed_count
        job.failed_files = (job.failed_files or 0) + failed_count
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error committing batch for scan {scan_id}: {e}")
        return ScanBatchResponse(
            processed=0,
            new_media_created=0,
            duplicate_instances_associated=0,
            failed=len(batch_data.items)
        )

    # Link any newly discovered Live Photo pairs
    try:
        touched_dirs = {os.path.dirname(item.relative_path or "") for item in batch_data.items}
        link_live_photos_for_user(db, user_id, source_id=source_id, directories=touched_dirs)
    except Exception as e:
        print(f"Live photo linking warning: {e}")

    return ScanBatchResponse(
        processed=processed_count,
        new_media_created=new_media_count,
        duplicate_instances_associated=duplicate_instances_count,
        failed=failed_count
    )

def link_live_photos_for_user(
    db: Session,
    user_id: str,
    source_id: Optional[str] = None,
    directories: Optional[set] = None
) -> int:
    """Finds matching photo + .mov pairs in the same directory and links them as Live Photos."""
    query = (
        db.query(File, Media)
        .join(Media, File.media_id == Media.id)
        .filter(Media.user_id == user_id)
    )
    if source_id:
        query = query.filter(File.source_id == source_id)
    files = query.all()

    if directories is not None:
        files = [
            (f, m) for f, m in files
            if os.path.dirname(f.relative_path or "") in directories
        ]

    photos_by_key = {}
    videos_by_key = {}

    for f, m in files:
        ext = (f.extension or "").lower()
        dir_name = os.path.dirname(f.relative_path or "")
        base_name = os.path.splitext(f.filename or "")[0].upper()
        key = (f.source_id, dir_name, base_name)

        if ext in {"heic", "jpg", "jpeg", "png", "dng"}:
            photos_by_key[key] = m
        elif ext in {"mov", "mp4"}:
            videos_by_key[key] = m

    linked_count = 0
    for key, photo_media in photos_by_key.items():
        if key in videos_by_key:
            video_media = videos_by_key[key]
            if photo_media.id != video_media.id:
                photo_media.is_live_photo = 1
                photo_media.live_video_media_id = video_media.id
                linked_count += 1

    if linked_count > 0:
        db.commit()

    return linked_count

def save_thumbnail(db: Session, media_id: str, sha256: str, thumbnail_base64: str, profile: str = "balanced"):
    # Check if thumbnail already saved in DB
    existing_thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media_id).first()
    if existing_thumb:
        return

    # Check if thumbnail already added to current session (pending in db.new)
    for obj in db.new:
        if isinstance(obj, Thumbnail) and getattr(obj, "media_id", None) == media_id:
            return

    try:
        # Strip data URL prefix if present (e.g. data:image/...;base64,...)
        if "," in thumbnail_base64:
            thumbnail_base64 = thumbnail_base64.split(",", 1)[1]

        raw_bytes = base64.b64decode(thumbnail_base64)

        # Profile parameters
        prof = settings.THUMBNAIL_PROFILES.get(profile, settings.THUMBNAIL_PROFILES["balanced"])
        max_edge = prof["max_edge"]
        quality = prof["quality"]

        # Decode, transpose orientation, convert to RGB, resize, and encode in true WebP
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")

            from app.services.dhash_service import compute_dhash
            dhash_str = compute_dhash(img)

            img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            real_w, real_h = img.size

            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=quality, method=4)
            webp_bytes = buf.getvalue()

        # Update media dhash
        media = db.query(Media).filter(Media.id == media_id).first()
        if media:
            media.dhash = dhash_str
        
        # Partitioned directory structure: /data/thumbnails/ab/cd/abcdef...webp
        sub1 = sha256[:2]
        sub2 = sha256[2:4]
        dir_path = os.path.join(settings.THUMBNAILS_DIR, sub1, sub2)
        os.makedirs(dir_path, exist_ok=True)

        filename = f"{sha256}.webp"
        file_path = os.path.join(dir_path, filename)
        rel_storage_path = os.path.join(sub1, sub2, filename)

        with open(file_path, "wb") as f:
            f.write(webp_bytes)

        thumb = Thumbnail(
            id=generate_uuid(),
            media_id=media_id,
            storage_path=rel_storage_path,
            format="webp",
            width=real_w,
            height=real_h,
            size_bytes=len(webp_bytes)
        )
        db.add(thumb)
    except Exception as e:
        print(f"Thumbnail save error for media {media_id}: {e}")
