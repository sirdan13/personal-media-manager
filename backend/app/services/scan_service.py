from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.entities import ScanJob, ScanHistory, generate_uuid
from app.services.source_service import get_source_by_id

def start_scan_job(db: Session, user_id: str, source_id: str, total_files_discovered: int = 0) -> ScanJob:
    source = get_source_by_id(db, user_id, source_id)
    source.status = "scanning"

    job = ScanJob(
        id=generate_uuid(),
        source_id=source.id,
        status="running",
        total_files_discovered=total_files_discovered,
        processed_files=0,
        failed_files=0,
        started_at=datetime.now(timezone.utc)
    )
    db.add(job)

    history = ScanHistory(
        id=generate_uuid(),
        scan_job_id=job.id,
        event_type="scan_started",
        payload_json=f'{{"total_discovered": {total_files_discovered}}}'
    )
    db.add(history)

    db.commit()
    db.refresh(job)
    return job

def get_scan_job(db: Session, user_id: str, scan_id: str) -> ScanJob:
    job = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scansione non trovata")
    
    # Verify ownership via source
    get_source_by_id(db, user_id, job.source_id)
    return job

def complete_scan_job(
    db: Session,
    user_id: str,
    scan_id: str,
    total_processed: int,
    failed_files: int = 0,
    error_message: str | None = None
) -> ScanJob:
    job = get_scan_job(db, user_id, scan_id)
    job.status = "completed" if not error_message else "failed"
    job.processed_files = total_processed
    job.failed_files = failed_files
    job.error_message = error_message
    job.completed_at = datetime.now(timezone.utc)

    # Update source last_scanned_at and restore status
    source = job.source
    source.status = "online"
    source.last_scanned_at = datetime.now(timezone.utc)

    history = ScanHistory(
        id=generate_uuid(),
        scan_job_id=job.id,
        event_type="scan_completed" if not error_message else "scan_failed",
        payload_json=f'{{"processed": {total_processed}, "failed": {failed_files}}}'
    )
    db.add(history)

    db.commit()
    db.refresh(job)
    return job
