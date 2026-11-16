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
from app.services.scan_service import start_scan_job, get_scan_job, complete_scan_job
from app.services.ingestion_service import process_scan_batch
from app.api.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/scans", tags=["Scansione & Ingestione"])

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
