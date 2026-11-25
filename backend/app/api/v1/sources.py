from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, status, Body, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.source import SourceCreate, SourceUpdate, SourceOut
from app.services.source_service import (
    get_user_sources,
    get_source_by_id,
    create_source,
    update_source,
    delete_source,
    get_source_file_fingerprints,
    reconcile_source_files,
    browse_server_filesystem,
    get_source_folders,
    exclude_and_purge_paths,
    quick_verify_sources,
    purge_missing_records,
    compare_sources,
    backup_copy_to_source
)
from app.api.deps import get_current_user
from app.models.entities import User

class ReconcileRequest(BaseModel):
    seen_paths: List[str]

class ExclusionRequest(BaseModel):
    excluded_paths: str
    purge_existing: bool = True

class VerifySourcesRequest(BaseModel):
    source_id: Optional[str] = None

class PurgeMissingRequest(BaseModel):
    source_id: Optional[str] = None
    media_ids: Optional[List[str]] = None

class BackupCopyRequest(BaseModel):
    media_ids: List[str]
    target_source_id: str
    target_subfolder: str = ""

router = APIRouter(prefix="/sources", tags=["Fonti & Archivi"])

@router.get("/browse/filesystem")
def browse_filesystem(
    path: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Browse directories and detected mounted volumes on the server (Mac/host).
    """
    return browse_server_filesystem(path)

@router.get("", response_model=List[SourceOut])
def list_sources(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_user_sources(db, current_user.id)

@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def add_source(
    source_in: SourceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    source = create_source(db, current_user.id, source_in)
    return SourceOut.model_validate(source)

@router.post("/verify")
def verify_sources_endpoint(
    payload: Optional[VerifySourcesRequest] = Body(default=None),
    source_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_source_id = (payload.source_id if payload else None) or source_id
    return quick_verify_sources(db, current_user.id, source_id=target_source_id)

@router.post("/purge-missing")
def purge_missing_endpoint(
    payload: Optional[PurgeMissingRequest] = Body(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return purge_missing_records(
        db,
        current_user.id,
        source_id=payload.source_id if payload else None,
        media_ids=payload.media_ids if payload else None
    )

@router.get("/compare")
def compare_sources_endpoint(
    primary_id: str = Query(..., description="ID disco origine (A)"),
    secondary_id: str = Query(..., description="ID disco backup (B)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return compare_sources(db, current_user.id, primary_id, secondary_id)

@router.post("/backup-copy")
def backup_copy_endpoint(
    payload: BackupCopyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return backup_copy_to_source(
        db,
        current_user.id,
        media_ids=payload.media_ids,
        target_source_id=payload.target_source_id,
        target_subfolder=payload.target_subfolder
    )

@router.get("/{source_id}", response_model=SourceOut)
def get_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    source = get_source_by_id(db, current_user.id, source_id)
    return SourceOut.model_validate(source)

@router.patch("/{source_id}", response_model=SourceOut)
def patch_source(
    source_id: str,
    source_in: SourceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    source = update_source(db, current_user.id, source_id, source_in)
    return SourceOut.model_validate(source)

@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    delete_source(db, current_user.id, source_id)
    return None

@router.get("/{source_id}/fingerprints")
def get_fingerprints(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_source_file_fingerprints(db, current_user.id, source_id)

@router.post("/{source_id}/reconcile")
def reconcile(
    source_id: str,
    payload: ReconcileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return reconcile_source_files(db, current_user.id, source_id, payload.seen_paths)

@router.post("/{source_id}/toggle-status", response_model=SourceOut)
def toggle_status(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    source = get_source_by_id(db, current_user.id, source_id)
    new_status = "offline" if source.status != "offline" else "online"
    source = update_source(db, current_user.id, source_id, SourceUpdate(status=new_status))
    return SourceOut.model_validate(source)

@router.get("/{source_id}/folders")
def list_source_folders(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List top-level and indexed folders for a source with file counts.
    """
    return get_source_folders(db, current_user.id, source_id)

@router.post("/{source_id}/exclusions")
def set_exclusions(
    source_id: str,
    payload: ExclusionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Configure folder exclusions and optionally purge matching files retroactively.
    """
    return exclude_and_purge_paths(
        db,
        current_user.id,
        source_id,
        payload.excluded_paths,
        purge_existing=payload.purge_existing
    )
