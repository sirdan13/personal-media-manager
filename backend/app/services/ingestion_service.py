import os
import base64
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.entities import Media, File, Thumbnail, generate_uuid
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

    new_media_count = 0
    duplicate_instances_count = 0
    processed_count = 0
    failed_count = 0

    now = datetime.now(timezone.utc)

    for item in batch_data.items:
        try:
            # 1. Check if logical Media exists for this user and hash
            media = db.query(Media).filter(
                Media.user_id == user_id,
                Media.canonical_sha256 == item.sha256
            ).first()

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
                    duration_seconds=item.duration_seconds
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
                save_thumbnail(db, media.id, item.sha256, item.thumbnail_base64)

            processed_count += 1
            if batch_data.checkpoint_path:
                job.last_checkpoint_path = batch_data.checkpoint_path

        except Exception as e:
            failed_count += 1
            print(f"Error processing item {item.relative_path}: {e}")

    job.processed_files = (job.processed_files or 0) + processed_count
    job.failed_files = (job.failed_files or 0) + failed_count
    db.commit()

    return ScanBatchResponse(
        processed=processed_count,
        new_media_created=new_media_count,
        duplicate_instances_associated=duplicate_instances_count,
        failed=failed_count
    )

def save_thumbnail(db: Session, media_id: str, sha256: str, thumbnail_base64: str):
    # Check if thumbnail already saved
    existing_thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media_id).first()
    if existing_thumb:
        return

    try:
        # Strip data URL prefix if present (e.g. data:image/webp;base64,...)
        if "," in thumbnail_base64:
            thumbnail_base64 = thumbnail_base64.split(",", 1)[1]

        thumb_bytes = base64.b64decode(thumbnail_base64)
        
        # Partitioned directory structure: /data/thumbnails/ab/cd/abcdef...webp
        sub1 = sha256[:2]
        sub2 = sha256[2:4]
        dir_path = os.path.join(settings.THUMBNAILS_DIR, sub1, sub2)
        os.makedirs(dir_path, exist_ok=True)

        filename = f"{sha256}.webp"
        file_path = os.path.join(dir_path, filename)
        rel_storage_path = os.path.join(sub1, sub2, filename)

        with open(file_path, "wb") as f:
            f.write(thumb_bytes)

        thumb = Thumbnail(
            id=generate_uuid(),
            media_id=media_id,
            storage_path=rel_storage_path,
            format="webp",
            width=384,
            height=256,
            size_bytes=len(thumb_bytes)
        )
        db.add(thumb)
    except Exception as e:
        print(f"Thumbnail save error for media {media_id}: {e}")
