from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.scan import (
    ScanStartRequest,
    ScanBatchRequest,
    ScanBatchResponse,
    ScanCompleteRequest,
    ScanJobOut
)
from app.services.scan_service import (
    start_scan_job,
    get_scan_job,
    complete_scan_job,
    list_user_scan_jobs
)
from app.services.ingestion_service import process_scan_batch
from app.api.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/scans", tags=["Scansione & Ingestione"])

@router.get("", response_model=List[ScanJobOut])
def list_scans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_user_scan_jobs(db, current_user.id)

@router.post("/{source_id}/start", response_model=ScanJobOut, status_code=status.HTTP_201_CREATED)
def start_scan(
    source_id: str,
    payload: ScanStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = start_scan_job(db, current_user.id, source_id, payload.total_files_discovered)
    return ScanJobOut.model_validate(job)

@router.post("/{scan_id}/batch", response_model=ScanBatchResponse)
def submit_batch(
    scan_id: str,
    batch_data: ScanBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return process_scan_batch(db, current_user.id, scan_id, batch_data)

@router.post("/{scan_id}/complete", response_model=ScanJobOut)
def finish_scan(
    scan_id: str,
    payload: ScanCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = complete_scan_job(
        db,
        current_user.id,
        scan_id,
        payload.total_processed,
        payload.failed_files,
        payload.error_message
    )
    return ScanJobOut.model_validate(job)

@router.get("/{scan_id}", response_model=ScanJobOut)
def get_scan_status(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = get_scan_job(db, current_user.id, scan_id)
    return ScanJobOut.model_validate(job)

class ServerScanRequest(BaseModel):
    backfill_thumbnails_only: bool = False

@router.post("/{source_id}/server-scan", response_model=ScanJobOut, status_code=status.HTTP_201_CREATED)
def trigger_server_scan(
    source_id: str,
    payload: Optional[ServerScanRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.services.local_scanner_service import start_server_scan
    backfill = payload.backfill_thumbnails_only if payload else False
    job = start_server_scan(db, current_user.id, source_id, backfill_thumbnails_only=backfill)
    return ScanJobOut.model_validate(job)

@router.post("/{scan_id}/cancel", response_model=ScanJobOut)
def cancel_scan(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.services.local_scanner_service import cancel_server_scan
    job = cancel_server_scan(db, current_user.id, scan_id)
    return ScanJobOut.model_validate(job)
