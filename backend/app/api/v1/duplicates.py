import csv
import io
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import DuplicateGroupOut
from app.services.media_service import list_duplicate_groups
from app.services.dhash_service import find_similar_media_groups
from app.api.deps import get_current_user
from app.models.entities import User, Media, File, Source

router = APIRouter(prefix="/duplicates", tags=["Duplicati Esatti"])

@router.get("", response_model=List[DuplicateGroupOut])
def get_duplicates(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_duplicate_groups(db, current_user.id, offset, limit)

@router.get("/export")
def export_duplicate_report(
    format: str = Query("csv", pattern="^(csv|json)$"),
    preferred_source_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    groups = list_duplicate_groups(db, current_user.id, offset=0, limit=10000)
    
    rows = []
    for g in groups:
        # Determine KEEP vs REDUNDANT_COPY
        keep_chosen = False
        for f in g.files:
            action = "REDUNDANT_COPY"
            if not keep_chosen:
                if preferred_source_id and f.source_id == preferred_source_id:
                    action = "KEEP"
                    keep_chosen = True
                elif not preferred_source_id:
                    action = "KEEP"
                    keep_chosen = True
            rows.append({
                "group_sha256": g.canonical_sha256,
                "media_id": g.media_id,
                "file_id": f.id,
                "source_name": f.source_name or "N/A",
                "source_status": f.source_status or "online",
                "relative_path": f.relative_path,
                "filename": f.filename,
                "size_bytes": f.size_bytes,
                "recommended_action": action
            })

    if format == "json":
        return rows

    # CSV formatting
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "group_sha256", "media_id", "file_id", "source_name", "source_status",
        "relative_path", "filename", "size_bytes", "recommended_action"
    ])
    writer.writeheader()
    writer.writerows(rows)

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="duplicates_report.csv"'}
    )

@router.get("/similar")
def get_similar_photos(
    max_distance: int = Query(6, ge=0, le=32),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return find_similar_media_groups(db, current_user.id, max_distance=max_distance)
