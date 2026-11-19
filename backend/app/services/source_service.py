import os
import platform
import fnmatch
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.entities import Source, File, Thumbnail, Media
from app.core.config import settings
from app.schemas.source import SourceCreate, SourceUpdate, SourceOut

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

    for f in files:
        if f.relative_path not in seen_set:
            if f.availability_status != "missing":
                f.availability_status = "missing"
                marked_missing += 1
        else:
            total_active += 1
            if f.availability_status == "missing":
                f.availability_status = "available"
                restored_available += 1

    db.commit()
    return {
        "marked_missing": marked_missing,
        "restored_available": restored_available,
        "total_active": total_active
    }

def is_path_excluded(rel_path: str, excluded_patterns: List[str]) -> bool:
    if not rel_path or not excluded_patterns:
        return False
    rel_clean = rel_path.replace("\\", "/").strip("/").lower()
    parts = rel_clean.split("/")
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
