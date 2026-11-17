from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class AlbumCreate(BaseModel):
    name: str
    description: Optional[str] = None

class AlbumOut(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    media_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class AlbumAddMedia(BaseModel):
    media_ids: List[str]

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#38bdf8"

class TagOut(BaseModel):
    id: str
    user_id: str
    name: str
    color: str
    created_at: datetime
    media_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class TagMediaRequest(BaseModel):
    media_ids: List[str]
