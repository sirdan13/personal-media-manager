from datetime import datetime, timezone
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException, status
from app.models.entities import ScanJob, ScanHistory, Source, generate_uuid
from app.schemas.scan import ScanJobOut
from app.services.source_service import get_source_by_id

def list_user_scan_jobs(db: Session, user_id: str) -> List[ScanJobOut]:
    jobs = db.query(ScanJob, Source.name)\
             .join(Source, ScanJob.source_id == Source.id)\
             .filter(Source.user_id == user_id)\
             .order_by(desc(ScanJob.started_at)).all()
    results = []
    for job, src_name in jobs:
        out = ScanJobOut.model_validate(job)
        out.source_name = src_name
        results.append(out)
    return results

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
