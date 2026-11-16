from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class SourceCreate(BaseModel):
    name: str
    source_type: str = "browser_folder"
    root_path: Optional[str] = None
    persistent_identifier: Optional[str] = None

class SourceUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    root_path: Optional[str] = None

class SourceOut(BaseModel):
    id: str
    user_id: str
    device_id: Optional[str] = None
    name: str
    source_type: str
    root_path: Optional[str] = None
    persistent_identifier: Optional[str] = None
    status: str
    created_at: datetime
    last_scanned_at: Optional[datetime] = None
    file_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)
