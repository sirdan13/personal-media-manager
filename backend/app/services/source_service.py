import os
import platform
import fnmatch
import shutil
import hashlib
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Set
from sqlalchemy.orm import Session
from sqlalchemy import func, exists
from fastapi import HTTPException, status
from app.models.entities import Source, File, Thumbnail, Media, AlbumMedia, MediaTag, generate_uuid
from app.core.config import settings
from app.schemas.source import SourceCreate, SourceUpdate, SourceOut

def cleanup_orphan_media_ids(db: Session, media_ids: Set[str]) -> int:
    """Deletes orphan Media records (with 0 remaining File records) along with thumbnails, albums, and tags."""
    purged_media_count = 0
    for m_id in media_ids:
        remaining = db.query(File).filter(File.media_id == m_id).count()
        if remaining == 0:
            thumbs = db.query(Thumbnail).filter(Thumbnail.media_id == m_id).all()
            for t in thumbs:
                if t.storage_path:
                    disk_path = os.path.join(settings.THUMBNAILS_DIR, t.storage_path)
                    if os.path.exists(disk_path):
                        try:
                            os.remove(disk_path)
                        except Exception:
                            pass
                db.delete(t)
            db.query(AlbumMedia).filter(AlbumMedia.media_id == m_id).delete(synchronize_session=False)
            db.query(MediaTag).filter(MediaTag.media_id == m_id).delete(synchronize_session=False)
            db.query(Media).filter(Media.id == m_id).delete(synchronize_session=False)
            purged_media_count += 1
    return purged_media_count

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

def get_user_sources(db: Session, user_id: str) -> List[SourceOut]:
    sources = db.query(Source).filter(Source.user_id == user_id).all()
    results = []
    for s in sources:
        count = db.query(func.count(File.id)).filter(File.source_id == s.id).scalar() or 0
        
        # Real-time physical mount check for external drives / local folders with a root_path
        computed_status = s.status
        if s.root_path and s.source_type in ("external_drive", "local_folder", "network_share"):
            is_physically_present = os.path.exists(s.root_path)
            # If path doesn't exist on server/Mac, it is physically OFFLINE
            if not is_physically_present:
                computed_status = "offline"
                if s.status != "offline":
                    s.status = "offline"
                    db.commit()
            elif is_physically_present and s.status == "offline":
                # Automatically restore to online when plugged back in
                computed_status = "online"
                s.status = "online"
                db.commit()

        s_out = SourceOut(
            id=s.id,
            user_id=s.user_id,
            device_id=s.device_id,
            name=s.name,
            source_type=s.source_type,
            role=getattr(s, "role", "primary") or "primary",
            root_path=s.root_path,
            excluded_paths=getattr(s, "excluded_paths", None),
            persistent_identifier=s.persistent_identifier,
            status=computed_status,
            created_at=s.created_at,
            last_scanned_at=s.last_scanned_at,
            file_count=count
        )
        results.append(s_out)
    return results

def get_source_by_id(db: Session, user_id: str, source_id: str) -> Source:
    source = db.query(Source).filter(Source.id == source_id, Source.user_id == user_id).first()
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fonte non trovata o non accessibile"
        )
    return source

def create_source(db: Session, user_id: str, source_in: SourceCreate) -> Source:
    source = Source(
        user_id=user_id,
        name=source_in.name,
        source_type=source_in.source_type,
        role=source_in.role or "primary",
        root_path=source_in.root_path,
        excluded_paths=source_in.excluded_paths,
        persistent_identifier=source_in.persistent_identifier,
        status="online"
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source

def update_source(db: Session, user_id: str, source_id: str, source_in: SourceUpdate) -> Source:
    source = get_source_by_id(db, user_id, source_id)
    if source_in.name is not None:
        source.name = source_in.name
    if source_in.status is not None:
        source.status = source_in.status
    if source_in.role is not None:
        source.role = source_in.role
    if source_in.root_path is not None:
        source.root_path = source_in.root_path
    if source_in.excluded_paths is not None:
        source.excluded_paths = source_in.excluded_paths
    
    db.commit()
    db.refresh(source)
    return source

def delete_source(db: Session, user_id: str, source_id: str) -> None:
    source = get_source_by_id(db, user_id, source_id)
    # Get all media_ids linked to files in this source
    affected_media_ids = [r[0] for r in db.query(File.media_id).filter(File.source_id == source.id).distinct().all()]

    # Delete the source (cascades to scan_jobs and files)
    db.delete(source)
    db.commit()

    # Clean up orphan media entities that have no remaining physical files anywhere
    if affected_media_ids:
        chunk_size = 500
        all_orphan_ids = []
        for i in range(0, len(affected_media_ids), chunk_size):
            chunk = affected_media_ids[i:i + chunk_size]
            orphans = db.query(Media.id).outerjoin(File, Media.id == File.media_id)\
                        .filter(Media.id.in_(chunk), File.id.is_(None)).all()
            all_orphan_ids.extend([o[0] for o in orphans])

        if all_orphan_ids:
            for i in range(0, len(all_orphan_ids), chunk_size):
                chunk = all_orphan_ids[i:i + chunk_size]
                # Collect thumbnail paths before deleting Media (which cascades to Thumbnail)
                thumbs = db.query(Thumbnail.storage_path).filter(Thumbnail.media_id.in_(chunk)).all()
                thumb_paths = [t[0] for t in thumbs if t[0]]

                # Explicitly delete dependent relation rows to be resilient across all SQLite configs
                db.query(Thumbnail).filter(Thumbnail.media_id.in_(chunk)).delete(synchronize_session=False)
                db.query(Media).filter(Media.id.in_(chunk)).delete(synchronize_session=False)
                db.commit()

                # Clean physical thumbnail files on disk if not referenced elsewhere
                for p in thumb_paths:
                    remaining = db.query(Thumbnail).filter(Thumbnail.storage_path == p).first()
                    if not remaining:
                        full_path = os.path.join(settings.THUMBNAILS_DIR, p)
                        try:
                            if os.path.isfile(full_path):
                                os.remove(full_path)
                        except OSError:
                            pass

def get_source_file_fingerprints(db: Session, user_id: str, source_id: str) -> dict:
    get_source_by_id(db, user_id, source_id) # ownership check
    rows = db.query(File, Thumbnail.id.label("thumb_id"))\
             .outerjoin(Thumbnail, File.media_id == Thumbnail.media_id)\
             .filter(File.source_id == source_id).all()
    fingerprints = {}
    for f, thumb_id in rows:
        fingerprints[f.relative_path] = {
            "id": f.id,
            "size_bytes": f.size_bytes,
            "filesystem_modified_at": f.filesystem_modified_at.isoformat() if f.filesystem_modified_at else None,
            "sha256": f.sha256,
            "availability_status": f.availability_status,
            "has_thumbnail": thumb_id is not None
        }
    return fingerprints

def reconcile_source_files(db: Session, user_id: str, source_id: str, seen_paths: List[str]) -> dict:
    get_source_by_id(db, user_id, source_id) # ownership check
    seen_set = set(seen_paths)
    
    files = db.query(File).filter(File.source_id == source_id).all()
    marked_missing = 0
    restored_available = 0
    total_active = 0
    moved_cleaned = 0

    active_sha256s = set()
    missing_candidates = []

    for f in files:
        if f.relative_path not in seen_set:
            if f.availability_status not in ("missing", "trashed"):
                f.availability_status = "missing"
                marked_missing += 1
            if f.availability_status == "missing":
                missing_candidates.append(f)
        else:
            total_active += 1
            active_sha256s.add(f.sha256)
            if f.availability_status in ("missing", "trashed"):
                f.availability_status = "available"
                f.trash_relative_path = None
                f.trashed_at = None
                restored_available += 1

    # Move/rename detection: if a missing file on this source has an active counterpart with identical SHA-256 on the same source, remove the dead missing reference
    for mf in missing_candidates:
        if mf.sha256 and mf.sha256 in active_sha256s:
            db.delete(mf)
            moved_cleaned += 1

    db.commit()
    return {
        "marked_missing": marked_missing,
        "restored_available": restored_available,
        "moved_cleaned": moved_cleaned,
        "total_active": total_active
    }

def quick_verify_sources(db: Session, user_id: str, source_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Fast O(N) os.path.isfile verification of indexed files on currently online sources.
    Detects externally deleted or restored files in <1s without hashing or thumbnailing.
    """
    query = db.query(Source).filter(Source.user_id == user_id)
    if source_id:
        get_source_by_id(db, user_id, source_id)
        query = query.filter(Source.id == source_id)
    sources = query.all()

    checked_sources = 0
    checked_files = 0
    newly_missing = 0
    restored_available = 0

    for s in sources:
        if not s.root_path or not os.path.isdir(s.root_path):
            if s.root_path and s.status != "offline":
                s.status = "offline"
            continue

        if s.status == "offline":
            s.status = "online"

        checked_sources += 1
        files = db.query(File).filter(
            File.source_id == s.id,
            File.availability_status != "trashed"
        ).all()

        for f in files:
            checked_files += 1
            full_path = os.path.join(s.root_path, f.relative_path)
            exists_on_disk = os.path.isfile(full_path)
            if not exists_on_disk:
                if f.availability_status == "available":
                    f.availability_status = "missing"
                    newly_missing += 1
            else:
                if f.availability_status == "missing":
                    f.availability_status = "available"
                    restored_available += 1

    db.commit()

    total_missing_files = (
        db.query(func.count(File.id))
        .join(Media, File.media_id == Media.id)
        .filter(Media.user_id == user_id, File.availability_status == "missing")
        .scalar() or 0
    )

    active_media_exists = exists().where(
        File.media_id == Media.id,
        File.availability_status.notin_(("missing", "trashed"))
    )
    missing_file_exists = exists().where(
        File.media_id == Media.id,
        File.availability_status == "missing"
    )
    orphan_media_count = (
        db.query(func.count(Media.id))
        .filter(Media.user_id == user_id, ~active_media_exists, missing_file_exists)
        .scalar() or 0
    )

    return {
        "checked_sources": checked_sources,
        "checked_files": checked_files,
        "newly_missing": newly_missing,
        "restored_available": restored_available,
        "total_missing_files": total_missing_files,
        "orphan_media_count": orphan_media_count
    }

def purge_missing_records(
    db: Session,
    user_id: str,
    source_id: Optional[str] = None,
    media_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Removes File records marked as 'missing' from the catalog and cleans up any Media
    records (and their thumbnails) that are left with 0 remaining File records.
    """
    query = (
        db.query(File)
        .join(Media, File.media_id == Media.id)
        .filter(Media.user_id == user_id, File.availability_status == "missing")
    )
    if source_id:
        get_source_by_id(db, user_id, source_id)
        query = query.filter(File.source_id == source_id)
    if media_ids:
        query = query.filter(File.media_id.in_(media_ids))

    files_to_delete = query.all()
    if not files_to_delete:
        return {"purged_files_count": 0, "purged_orphan_media_count": 0}

    affected_media_ids = {f.media_id for f in files_to_delete}
    purged_files_count = len(files_to_delete)

    for f in files_to_delete:
        db.delete(f)
    db.flush()

    purged_orphan_media_count = cleanup_orphan_media_ids(db, affected_media_ids)
    db.commit()

    return {
        "purged_files_count": purged_files_count,
        "purged_orphan_media_count": purged_orphan_media_count
    }

def _sha256_file(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def compare_sources(
    db: Session,
    user_id: str,
    primary_source_id: str,
    secondary_source_id: str
) -> Dict[str, Any]:
    """
    Compares primary_source_id against secondary_source_id and returns media present
    on primary that are missing on secondary, grouped by top-level folder.
    """
    from app.services.media_service import compute_backup_gap
    gap = compute_backup_gap(db, user_id, primary_source_id, secondary_source_id, only_favorites=False)

    by_folder_map: Dict[str, Dict[str, Any]] = {}
    for item in gap["missing_items"]:
        rel = (item.get("relative_path") or "").replace("\\", "/").strip("/")
        parts = rel.split("/") if rel else []
        top_folder = parts[0] if len(parts) > 1 else "(Radice)"
        if top_folder not in by_folder_map:
            by_folder_map[top_folder] = {"folder": top_folder, "count": 0, "bytes": 0}
        by_folder_map[top_folder]["count"] += 1
        by_folder_map[top_folder]["bytes"] += (item.get("size_bytes") or 0)

    by_folder = sorted(by_folder_map.values(), key=lambda x: -x["bytes"])

    return {
        "primary_source_id": primary_source_id,
        "secondary_source_id": secondary_source_id,
        "total_primary_media": gap["total_primary_media"],
        "backed_up_media": gap["backed_up_media"],
        "missing_count": gap["missing_on_backup_count"],
        "missing_bytes": gap["missing_on_backup_bytes"],
        "coverage_pct": gap["coverage_pct"],
        "by_folder": by_folder,
        "missing_items": gap["missing_items"]
    }

def backup_copy_to_source(
    db: Session,
    user_id: str,
    media_ids: List[str],
    target_source_id: str,
    target_subfolder: str = ""
) -> Dict[str, Any]:
    """
    Copies physical files for selected media_ids from any online source onto target_source_id,
    verifies SHA-256 and size, and registers new File records so protection status updates immediately.
    """
    target_source = get_source_by_id(db, user_id, target_source_id)
    if not target_source.root_path or not os.path.isdir(target_source.root_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La fonte di destinazione '{target_source.name}' è offline o non accessibile."
        )

    unique_ids = list(dict.fromkeys(media_ids or []))
    if not unique_ids:
        return {"copied_count": 0, "skipped_count": 0, "copied_bytes": 0, "copied_items": [], "errors": []}

    # Find media_ids already present on target_source_id
    existing_on_target = {
        r[0] for r in db.query(File.media_id).filter(
            File.source_id == target_source_id,
            File.media_id.in_(unique_ids),
            File.availability_status.notin_(("missing", "trashed"))
        ).all()
    }

    clean_sub = (target_subfolder or "").replace("\\", "/").strip("/")
    copied_items = []
    errors = []
    skipped_count = 0
    now_utc = datetime.now(timezone.utc)

    for m_id in unique_ids:
        if m_id in existing_on_target:
            skipped_count += 1
            continue

        media = db.query(Media).filter(Media.id == m_id, Media.user_id == user_id).first()
        if not media:
            errors.append({"media_id": m_id, "error": "Media non trovato."})
            continue

        # Find an online active source copy
        candidates = (
            db.query(File, Source)
            .join(Source, File.source_id == Source.id)
            .filter(
                File.media_id == m_id,
                File.availability_status.notin_(("missing", "trashed"))
            ).all()
        )

        src_file_obj = None
        src_full_path = None
        for f, s in candidates:
            if s.root_path and os.path.isdir(s.root_path):
                resolved = resolve_safe_source_file(s.root_path, f.relative_path)
                if resolved:
                    src_file_obj = f
                    src_full_path = resolved
                    break

        if not src_file_obj or not src_full_path:
            errors.append({"media_id": m_id, "error": "Nessuna copia sorgente online trovata su disco."})
            continue

        clean_rel = src_file_obj.relative_path.replace("\\", "/").lstrip("/")
        dest_rel = f"{clean_sub}/{clean_rel}" if clean_sub else clean_rel

        # Resolve safe destination path inside target_source.root_path
        real_root = os.path.realpath(target_source.root_path)
        dest_full = os.path.realpath(os.path.join(real_root, dest_rel))
        if os.path.commonpath([real_root, dest_full]) != real_root or dest_full == real_root:
            errors.append({"media_id": m_id, "filename": src_file_obj.filename, "error": "Percorso di destinazione non valido."})
            continue

        # Handle collision if a different file already exists at dest_full
        if os.path.exists(dest_full):
            existing_sha = _sha256_file(dest_full)
            if existing_sha != src_file_obj.sha256:
                base, ext = os.path.splitext(dest_rel)
                dest_rel = f"{base}_{m_id[:8]}{ext}"
                dest_full = os.path.realpath(os.path.join(real_root, dest_rel))

        try:
            os.makedirs(os.path.dirname(dest_full), exist_ok=True)
            if not os.path.exists(dest_full):
                shutil.copy2(src_full_path, dest_full)

            copied_sha = _sha256_file(dest_full)
            copied_size = os.path.getsize(dest_full)

            if copied_sha != src_file_obj.sha256:
                try:
                    os.remove(dest_full)
                except Exception:
                    pass
                errors.append({"media_id": m_id, "filename": src_file_obj.filename, "error": "Verifica SHA-256 fallita dopo la copia."})
                continue

            new_file = File(
                id=generate_uuid(),
                media_id=media.id,
                source_id=target_source.id,
                filename=os.path.basename(dest_rel),
                relative_path=dest_rel,
                extension=src_file_obj.extension,
                mime_type=src_file_obj.mime_type,
                size_bytes=copied_size,
                filesystem_modified_at=src_file_obj.filesystem_modified_at,
                filesystem_created_at=src_file_obj.filesystem_created_at,
                captured_at=src_file_obj.captured_at,
                width=src_file_obj.width,
                height=src_file_obj.height,
                duration_seconds=src_file_obj.duration_seconds,
                metadata_json=src_file_obj.metadata_json,
                sha256=copied_sha,
                availability_status="available",
                first_indexed_at=now_utc,
                last_seen_at=now_utc
            )
            db.add(new_file)
            copied_items.append({
                "media_id": media.id,
                "filename": new_file.filename,
                "relative_path": dest_rel,
                "size_bytes": copied_size
            })
        except Exception as e:
            errors.append({"media_id": m_id, "filename": src_file_obj.filename, "error": str(e)})

    db.commit()
    return {
        "copied_count": len(copied_items),
        "skipped_count": skipped_count,
        "copied_bytes": sum(x["size_bytes"] for x in copied_items),
        "copied_items": copied_items,
        "errors": errors
    }

def is_path_excluded(rel_path: str, excluded_patterns: List[str]) -> bool:
    if not rel_path:
        return False
    rel_clean = rel_path.replace("\\", "/").strip("/").lower()
    parts = rel_clean.split("/")
    if ".pmm_trash" in parts or rel_clean == ".pmm_trash" or rel_clean.startswith(".pmm_trash/"):
        return True
    if not excluded_patterns:
        return False
    filename = os.path.basename(rel_clean)

    for pat in excluded_patterns:
        pat_clean = pat.replace("\\", "/").strip("/").lower()
        if not pat_clean:
            continue
        # 1. Match folder component anywhere in tree (e.g. 'Musica' matches 'Musica/...' or 'A/Musica/B')
        if pat_clean in parts:
            return True
        # 2. Match exact path or subpath prefix
        if rel_clean == pat_clean or rel_clean.startswith(pat_clean + "/"):
            return True
        # 3. Wildcard pattern matching (e.g. *cover*, *.iso)
        if fnmatch.fnmatch(rel_clean, pat_clean) or fnmatch.fnmatch(filename, pat_clean):
            return True
    return False

def get_source_folders(db: Session, user_id: str, source_id: str) -> List[Dict[str, Any]]:
    get_source_by_id(db, user_id, source_id)
    files = db.query(File.relative_path).filter(File.source_id == source_id).all()
    
    folder_counts: Dict[str, int] = {}
    for (rel_path,) in files:
        if not rel_path:
            continue
        parts = rel_path.replace("\\", "/").strip("/").split("/")
        if len(parts) > 1:
            top_folder = parts[0]
            folder_counts[top_folder] = folder_counts.get(top_folder, 0) + 1
            if len(parts) > 2:
                second_folder = f"{parts[0]}/{parts[1]}"
                folder_counts[second_folder] = folder_counts.get(second_folder, 0) + 1
        else:
            folder_counts["(Radice)"] = folder_counts.get("(Radice)", 0) + 1

    result = [
        {"folder": folder, "file_count": count}
        for folder, count in sorted(folder_counts.items(), key=lambda x: -x[1])
    ]
    return result

def exclude_and_purge_paths(
    db: Session,
    user_id: str,
    source_id: str,
    excluded_paths_str: str,
    purge_existing: bool = True
) -> Dict[str, Any]:
    source = get_source_by_id(db, user_id, source_id)
    
    # Clean and split patterns
    patterns = [p.strip() for p in (excluded_paths_str or "").split(",") if p.strip()]
    cleaned_excluded_str = ", ".join(patterns) if patterns else None
    source.excluded_paths = cleaned_excluded_str

    purged_files_count = 0
    purged_media_count = 0

    if purge_existing and patterns:
        all_files = db.query(File).filter(File.source_id == source_id).all()
        files_to_delete = []
        affected_media_ids = set()

        for f in all_files:
            if is_path_excluded(f.relative_path, patterns):
                files_to_delete.append(f)
                affected_media_ids.add(f.media_id)

        purged_files_count = len(files_to_delete)

        for f in files_to_delete:
            db.delete(f)
        
        db.flush()

        # Check for orphan Media records
        for m_id in affected_media_ids:
            remaining = db.query(File).filter(File.media_id == m_id).count()
            if remaining == 0:
                thumbs = db.query(Thumbnail).filter(Thumbnail.media_id == m_id).all()
                for t in thumbs:
                    if t.storage_path:
                        disk_path = os.path.join(settings.THUMBNAILS_DIR, t.storage_path)
                        if os.path.exists(disk_path):
                            try:
                                os.remove(disk_path)
                            except Exception:
                                pass
                    db.delete(t)
                
                db.query(Media).filter(Media.id == m_id).delete()
                purged_media_count += 1

    db.commit()
    return {
        "source_id": source_id,
        "excluded_paths": source.excluded_paths,
        "purged_files": purged_files_count,
        "purged_media": purged_media_count
    }

def browse_server_filesystem(requested_path: Optional[str] = None) -> Dict[str, Any]:
    is_mac = platform.system() == "Darwin"
    
    # 1. Discover mounted volumes / external drives
    volumes = []
    if is_mac and os.path.exists("/Volumes"):
        try:
            for item in sorted(os.listdir("/Volumes")):
                if item.startswith("."):
                    continue
                full = os.path.join("/Volumes", item)
                if os.path.isdir(full) and item != "Recovery":
                    is_system = os.path.islink(full) and os.path.realpath(full) == "/"
                    volumes.append({
                        "name": item,
                        "path": full,
                        "is_removable": not is_system,
                        "type": "internal_drive" if is_system else "external_drive"
                    })
        except Exception:
            pass
    elif os.name == "nt":
        import string
        from ctypes import windll
        try:
            bitmask = windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    drive_path = f"{letter}:\\"
                    volumes.append({
                        "name": f"Disco ({letter}:)",
                        "path": drive_path,
                        "is_removable": False,
                        "type": "drive"
                    })
                bitmask >>= 1
        except Exception:
            pass
    else:
        for base in ["/media", "/mnt"]:
            if os.path.exists(base):
                try:
                    for item in sorted(os.listdir(base)):
                        full = os.path.join(base, item)
                        if os.path.isdir(full) and not item.startswith("."):
                            volumes.append({
                                "name": item,
                                "path": full,
                                "is_removable": True,
                                "type": "external_drive"
                            })
                except Exception:
                    pass

    # 2. Useful user home shortcuts
    home_dir = os.path.expanduser("~")
    user_shortcuts = []
    for folder_name, label in [
        ("Pictures", "Immagini"),
        ("Movies", "Filmati"),
        ("Documents", "Documenti"),
        ("Downloads", "Download"),
        ("Desktop", "Scrivania")
    ]:
        folder_path = os.path.join(home_dir, folder_name)
        if os.path.exists(folder_path) and os.path.isdir(folder_path):
            user_shortcuts.append({
                "name": label,
                "path": folder_path,
                "type": "user_folder"
            })

    # 3. Determine target directory
    if not requested_path or not os.path.exists(requested_path):
        target_path = "/Volumes" if (is_mac and os.path.exists("/Volumes")) else home_dir
    else:
        target_path = os.path.abspath(requested_path)

    # 4. List subdirectories
    subdirectories = []
    try:
        if os.path.isdir(target_path):
            for item in sorted(os.listdir(target_path), key=lambda x: x.lower()):
                if item.startswith(".") or item in ["$RECYCLE.BIN", "System Volume Information", "Recovery"]:
                    continue
                full_sub = os.path.join(target_path, item)
                try:
                    if os.path.isdir(full_sub) and not os.path.islink(full_sub):
                        subdirectories.append({
                            "name": item,
                            "path": full_sub
                        })
                except (PermissionError, OSError):
                    pass
    except (PermissionError, OSError):
        pass

    parent_path = os.path.dirname(target_path) if target_path not in ("/", "/Volumes") else None
    if target_path == "/Volumes":
        parent_path = None

    return {
        "current_path": target_path,
        "parent_path": parent_path,
        "subdirectories": subdirectories,
        "volumes": volumes,
        "user_shortcuts": user_shortcuts
    }
