import csv
import io
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.media import DuplicateGroupOut
from app.services.media_service import list_duplicate_groups, get_duplicates_summary, compute_backup_gap
from app.services.dhash_service import find_similar_media_groups
from app.api.deps import get_current_user
from app.models.entities import User, Media, File, Source

router = APIRouter(prefix="/duplicates", tags=["Duplicati Esatti"])

@router.get("", response_model=List[DuplicateGroupOut])
def get_duplicates(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    mode: str = Query("all", pattern="^(all|intra_source|multi_source)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return list_duplicate_groups(db, current_user.id, offset, limit, mode=mode)

@router.get("/summary")
def get_duplicates_summary_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_duplicates_summary(db, current_user.id)

@router.get("/backup-gap")
def get_backup_gap_endpoint(
    primary_source_id: str = Query(..., description="ID della fonte principale / SSD"),
    backup_source_id: str = Query(..., description="ID della fonte di backup / HDD / NAS"),
    only_favorites: bool = Query(False, description="Considera solo foto e video preferiti"),
    export_format: Optional[str] = Query(None, pattern="^(csv|json|rsync_txt)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    gap = compute_backup_gap(
        db,
        current_user.id,
        primary_source_id=primary_source_id,
        backup_source_id=backup_source_id,
        only_favorites=only_favorites
    )

    if export_format == "rsync_txt":
        lines = "\n".join(item["relative_path"] for item in gap["missing_items"])
        if gap["missing_items"]:
            lines += "\n"
        return Response(
            content=lines,
            media_type="text/plain",
            headers={"Content-Disposition": 'attachment; filename="missing_on_backup_rsync.txt"'}
        )

    if export_format == "csv":
        output = io.StringIO()
        fieldnames = [
            "media_id", "canonical_sha256", "filename", "relative_path",
            "size_bytes", "captured_at", "is_favorite", "has_thumbnail", "media_type"
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(gap["missing_items"])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="missing_on_backup.csv"'}
        )

    return gap

@router.get("/export")
def export_duplicate_report(
    format: str = Query("csv", pattern="^(csv|json)$"),
    mode: str = Query("all", pattern="^(all|intra_source|multi_source)$"),
    preferred_source_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    groups = list_duplicate_groups(db, current_user.id, offset=0, limit=10000, mode=mode)
    
    rows = []
    for g in groups:
        sorted_files = list(g.files)
        if preferred_source_id:
            sorted_files.sort(key=lambda x: 0 if x.source_id == preferred_source_id else 1)

        seen_sources = set()
        for idx, f in enumerate(sorted_files):
            if idx == 0:
                action = "KEEP"
                role = "PRIMARY_KEEP"
                seen_sources.add(f.source_id)
            elif f.source_id not in seen_sources:
                action = "KEEP"
                role = "BACKUP_REPLICA_KEEP"
                seen_sources.add(f.source_id)
            else:
                action = "REDUNDANT_COPY"
                role = "REDUNDANT_SAME_DISK"

            rows.append({
                "group_sha256": g.canonical_sha256,
                "media_id": g.media_id,
                "file_id": f.id,
                "source_name": f.source_name or "N/A",
                "source_status": f.source_status or "online",
                "relative_path": f.relative_path,
                "filename": f.filename,
                "size_bytes": f.size_bytes,
                "recommended_action": action,
                "redundancy_role": role
            })

    if format == "json":
        return rows

    # CSV formatting
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "group_sha256", "media_id", "file_id", "source_name", "source_status",
        "relative_path", "filename", "size_bytes", "recommended_action", "redundancy_role"
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
    max_time_diff_hours: Optional[int] = Query(None, ge=1, le=8760),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return find_similar_media_groups(
        db,
        current_user.id,
        max_distance=max_distance,
        max_time_diff_hours=max_time_diff_hours
    )
