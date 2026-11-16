from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.source import SourceCreate, SourceUpdate, SourceOut
from app.services.source_service import (
    get_user_sources,
    get_source_by_id,
    create_source,
    update_source
)
from app.api.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/sources", tags=["Fonti & Archivi"])

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
