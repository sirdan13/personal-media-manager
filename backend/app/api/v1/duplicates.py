from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import DuplicateGroupOut
from app.services.media_service import list_duplicate_groups
from app.api.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/duplicates", tags=["Duplicati Esatti"])

@router.get("", response_model=List[DuplicateGroupOut])
def get_duplicates(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_duplicate_groups(db, current_user.id, offset, limit)
