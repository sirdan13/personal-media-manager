import os
import mimetypes
import base64
import hashlib
import threading
from typing import Dict, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.database import SessionLocal
from app.models.entities import ScanJob, Source
from app.schemas.scan import ScanBatchItem, ScanBatchRequest
from app.services.source_service import get_source_by_id, get_source_file_fingerprints, reconcile_source_files
from app.services.scan_service import start_scan_job, complete_scan_job, get_scan_job
from app.services.ingestion_service import process_scan_batch
from app.services.media_preview_service import (
    IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, IGNORED_EXTENSIONS, IGNORED_DIR_NAMES,
    generate_image_preview_bytes, generate_video_thumbnail_bytes
)

_ACTIVE_SCANS: Dict[str, threading.Event] = {}
_LOCK = threading.Lock()

def compute_file_sha256(filepath: str, cancel_event: threading.Event, chunk_size: int = 65536) -> Optional[str]:
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            while chunk := f.read(chunk_size):
                if cancel_event.is_set():
                    return None
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None

def start_server_scan(
    db: Session,
    user_id: str,
    source_id: str,
    backfill_thumbnails_only: bool = False,
    session_factory=None,
    run_sync: bool = False
) -> ScanJob:
    source = get_source_by_id(db, user_id, source_id)
    if not source.root_path or not os.path.isdir(source.root_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Percorso fonte non accessibile sul server o disco offline"
        )

    # Check for active running scan
    existing_running = db.query(ScanJob).filter(
        ScanJob.source_id == source_id,
        ScanJob.status == "running"
    ).first()
    if existing_running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Una scansione è già in corso per questa fonte"
        )

    job = start_scan_job(db, user_id, source_id, 0)
    cancel_event = threading.Event()
    with _LOCK:
        _ACTIVE_SCANS[job.id] = cancel_event

    if run_sync:
        _run_server_scan_worker(
            job.id, user_id, source_id, source.root_path,
            backfill_thumbnails_only, cancel_event, session_factory=session_factory or (lambda: db)
        )
    else:
        t = threading.Thread(
            target=_run_server_scan_worker,
            args=(job.id, user_id, source_id, source.root_path, backfill_thumbnails_only, cancel_event, session_factory),
            daemon=True
        )
        t.start()
    return job

def cancel_server_scan(db: Session, user_id: str, scan_id: str) -> ScanJob:
    job = get_scan_job(db, user_id, scan_id)
    with _LOCK:
        event = _ACTIVE_SCANS.get(scan_id)
        if event:
            event.set()
        elif job.status == "running":
            job.status = "failed"
            job.error_message = "Scansione annullata"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
    db.refresh(job)
    return job

def _run_server_scan_worker(
    scan_id: str,
    user_id: str,
    source_id: str,
    root_path: str,
    backfill_thumbnails_only: bool,
    cancel_event: threading.Event,
    session_factory=None
):
    close_db = False
    if session_factory:
        db: Session = session_factory()
    else:
        db: Session = SessionLocal()
        close_db = True
    try:
        job = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
        if not job:
            return

        fingerprints = get_source_file_fingerprints(db, user_id, source_id)

        # 1. Discover files
        discovered: List[str] = []
        for dirpath, dirnames, filenames in os.walk(root_path):
            if cancel_event.is_set():
                break
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d.lower() not in IGNORED_DIR_NAMES]

            for fname in filenames:
                if fname.startswith("."):
                    continue
                ext = os.path.splitext(fname)[1].lower().lstrip(".")
                if ext in IGNORED_EXTENSIONS:
                    continue
                if ext in IMAGE_EXTENSIONS or ext in VIDEO_EXTENSIONS:
                    discovered.append(os.path.join(dirpath, fname))

        if cancel_event.is_set():
            complete_scan_job(db, user_id, scan_id, 0, 0, "Scansione annullata dall'utente")
            return

        job.total_files_discovered = len(discovered)
        db.commit()

        # 2. Process in batches of 25
        BATCH_SIZE = 25
        batch_items: List[ScanBatchItem] = []
        seen_paths: List[str] = []
        processed_total = 0
        failed_total = 0

        for full_path in discovered:
            if cancel_event.is_set():
                break

            try:
                rel_path = os.path.relpath(full_path, root_path).replace("\\", "/")
                seen_paths.append(rel_path)
                stat = os.stat(full_path)
                size_bytes = stat.st_size
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                fname = os.path.basename(full_path)
                ext = os.path.splitext(fname)[1].lower().lstrip(".")
                mime_type = mimetypes.guess_type(full_path)[0] or (
                    "video/mp4" if ext in VIDEO_EXTENSIONS else "image/jpeg"
                )

                fp = fingerprints.get(rel_path)

                if backfill_thumbnails_only and fp and fp.get("has_thumbnail"):
                    processed_total += 1
                    continue

                sha256 = None
                if fp and fp.get("size_bytes") == size_bytes and fp.get("sha256"):
                    sha256 = fp["sha256"]
                else:
                    sha256 = compute_file_sha256(full_path, cancel_event)
                    if not sha256:
                        if cancel_event.is_set():
                            break
                        failed_total += 1
                        continue

                thumb_b64 = None
                meta_json = None
                w, h = None, None
                duration = None
                captured_at = None

                if ext in IMAGE_EXTENSIONS:
                    t_bytes, w, h, meta_json, captured_at = generate_image_preview_bytes(
                        full_path, max_edge=384, quality=70, fmt="WEBP"
                    )
                    if t_bytes:
                        thumb_b64 = base64.b64encode(t_bytes).decode("ascii")
                elif ext in VIDEO_EXTENSIONS:
                    v_bytes, w, h, duration = generate_video_thumbnail_bytes(
                        full_path, max_edge=384, quality=70
                    )
                    if v_bytes:
                        thumb_b64 = base64.b64encode(v_bytes).decode("ascii")

                batch_items.append(ScanBatchItem(
                    filename=fname,
                    relative_path=rel_path,
                    extension=ext,
                    mime_type=mime_type,
                    size_bytes=size_bytes,
                    sha256=sha256,
                    filesystem_modified_at=mtime,
                    captured_at=captured_at,
                    width=w,
                    height=h,
                    duration_seconds=duration,
                    metadata_json=meta_json,
                    thumbnail_base64=thumb_b64
                ))

                if len(batch_items) >= BATCH_SIZE:
                    req = ScanBatchRequest(items=batch_items, checkpoint_path=rel_path)
                    res = process_scan_batch(db, user_id, scan_id, req)
                    processed_total += res.processed
                    failed_total += res.failed
                    batch_items = []

            except Exception as e:
                try:
                    db.rollback()
                except Exception:
                    pass
                failed_total += 1
                batch_items = []
                print(f"Error scanning local file {full_path}: {e}")

        # Final batch
        if batch_items and not cancel_event.is_set():
            try:
                last_cp = batch_items[-1].relative_path
                req = ScanBatchRequest(items=batch_items, checkpoint_path=last_cp)
                res = process_scan_batch(db, user_id, scan_id, req)
                processed_total += res.processed
                failed_total += res.failed
            except Exception as e:
                try:
                    db.rollback()
                except Exception:
                    pass
                failed_total += len(batch_items)
                print(f"Error in final scan batch: {e}")
            batch_items = []

        if cancel_event.is_set():
            complete_scan_job(db, user_id, scan_id, processed_total, failed_total, "Scansione annullata dall'utente")
            return

        if not backfill_thumbnails_only:
            try:
                reconcile_source_files(db, user_id, source_id, seen_paths)
            except Exception as e:
                print(f"Reconciliation error on server scan: {e}")

        complete_scan_job(db, user_id, scan_id, processed_total, failed_total)

    except Exception as e:
        print(f"Server scan worker error: {e}")
        try:
            complete_scan_job(db, user_id, scan_id, 0, 0, str(e))
        except Exception:
            pass
    finally:
        with _LOCK:
            _ACTIVE_SCANS.pop(scan_id, None)
        if close_db:
            db.close()
