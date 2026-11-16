from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.entities import Source, File
from app.schemas.source import SourceCreate, SourceUpdate, SourceOut

def get_user_sources(db: Session, user_id: str) -> List[SourceOut]:
    sources = db.query(Source).filter(Source.user_id == user_id).all()
    results = []
    for s in sources:
        count = db.query(func.count(File.id)).filter(File.source_id == s.id).scalar() or 0
        s_out = SourceOut(
            id=s.id,
            user_id=s.user_id,
            device_id=s.device_id,
            name=s.name,
            source_type=s.source_type,
            root_path=s.root_path,
            persistent_identifier=s.persistent_identifier,
            status=s.status,
            created_at=s.created_at,
            last_scanned_at=s.last_scanned_at,
            file_count=count
        )
        results.append(s_out)
    return results

def get_source_by_id(db: Session, user_id: str, source_id: str) -> Source:
    source = db.query(Source).filter(Source.id == source_id, Source.user_id == user_id).first()
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fonte non trovata o non accessibile"
        )
    return source

def create_source(db: Session, user_id: str, source_in: SourceCreate) -> Source:
    source = Source(
        user_id=user_id,
        name=source_in.name,
        source_type=source_in.source_type,
        root_path=source_in.root_path,
        persistent_identifier=source_in.persistent_identifier,
        status="online"
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source

def update_source(db: Session, user_id: str, source_id: str, source_in: SourceUpdate) -> Source:
    source = get_source_by_id(db, user_id, source_id)
    if source_in.name is not None:
        source.name = source_in.name
    if source_in.status is not None:
        source.status = source_in.status
    if source_in.root_path is not None:
        source.root_path = source_in.root_path
    
    db.commit()
    db.refresh(source)
    return source
