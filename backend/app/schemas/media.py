from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class FileOut(BaseModel):
    id: str
    media_id: str
    source_id: str
    source_name: Optional[str] = None
    source_status: Optional[str] = None
    filename: str
    relative_path: str
    extension: str
    mime_type: str
    size_bytes: int
    captured_at: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_seconds: Optional[float] = None
    sha256: str
    availability_status: str
    first_indexed_at: datetime
    last_seen_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MediaOut(BaseModel):
    id: str
    user_id: str
    media_type: str
    canonical_sha256: str
    captured_at: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_seconds: Optional[float] = None
    copies_count: int = 1
    has_thumbnail: bool = False
    is_live_photo: bool = False
    live_video_media_id: Optional[str] = None
    dhash: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    primary_filename: Optional[str] = None
    primary_size_bytes: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MediaDetailOut(MediaOut):
    files: List[FileOut] = []

class DuplicateGroupOut(BaseModel):
    media_id: str
    canonical_sha256: str
    copies_count: int
    total_size_bytes: int
    media_type: str
    has_thumbnail: bool = False
    files: List[FileOut]
