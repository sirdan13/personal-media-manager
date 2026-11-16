from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime

class ScanStartRequest(BaseModel):
    total_files_discovered: int = 0

class ScanBatchItem(BaseModel):
    filename: str
    relative_path: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256: str
    filesystem_modified_at: Optional[datetime] = None
    filesystem_created_at: Optional[datetime] = None
    captured_at: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_seconds: Optional[float] = None
    metadata_json: Optional[Dict[str, Any]] = None
    thumbnail_base64: Optional[str] = None # Base64 webp/jpeg thumbnail for direct zero-install storage

class ScanBatchRequest(BaseModel):
    items: List[ScanBatchItem]
    checkpoint_path: Optional[str] = None

class ScanBatchResponse(BaseModel):
    processed: int
    new_media_created: int
    duplicate_instances_associated: int
    failed: int

class ScanCompleteRequest(BaseModel):
    total_processed: int
    failed_files: int = 0
    error_message: Optional[str] = None

class ScanJobOut(BaseModel):
    id: str
    source_id: str
    status: str
    total_files_discovered: int
    processed_files: int
    failed_files: int
    last_checkpoint_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
