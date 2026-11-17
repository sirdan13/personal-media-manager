import os
import io
from PIL import Image, ImageOps
from pydantic import BaseModel, field_validator
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.entities import User, Media, Thumbnail

router = APIRouter(prefix="/settings", tags=["Impostazioni Sistema"])

class StorageSettingsUpdate(BaseModel):
    thumbnail_profile: str

    @field_validator("thumbnail_profile")
    @classmethod
    def validate_profile(cls, v: str) -> str:
        v_clean = v.lower()
        if v_clean not in settings.THUMBNAIL_PROFILES:
            raise ValueError(f"Profilo non valido. Scegli tra: {', '.join(settings.THUMBNAIL_PROFILES.keys())}")
        return v_clean

@router.get("/storage")
def get_storage_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = getattr(current_user, "thumbnail_profile", "balanced") or "balanced"

    stats = (
        db.query(
            func.count(Thumbnail.id),
            func.coalesce(func.sum(Thumbnail.size_bytes), 0)
        )
        .join(Media, Thumbnail.media_id == Media.id)
        .filter(Media.user_id == current_user.id)
        .first()
    )

    count = stats[0] if stats else 0
    total_bytes = stats[1] if stats else 0
    avg_kb = round(total_bytes / count / 1024, 1) if count > 0 else 0.0

    return {
        "thumbnail_profile": profile,
        "thumbnails_count": count,
        "total_bytes": total_bytes,
        "avg_kb": avg_kb,
        "available_profiles": settings.THUMBNAIL_PROFILES
    }

@router.put("/storage")
def update_storage_settings(
    payload: StorageSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.thumbnail_profile = payload.thumbnail_profile
    db.commit()
    db.refresh(current_user)
    return {
        "message": "Profilo miniature aggiornato con successo",
        "thumbnail_profile": current_user.thumbnail_profile
    }

@router.post("/storage/compact")
def compact_user_thumbnails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile_name = getattr(current_user, "thumbnail_profile", "balanced") or "balanced"
    prof = settings.THUMBNAIL_PROFILES.get(profile_name, settings.THUMBNAIL_PROFILES["balanced"])
    max_edge = prof["max_edge"]
    quality = prof["quality"]

    thumbs = (
        db.query(Thumbnail)
        .join(Media, Thumbnail.media_id == Media.id)
        .filter(Media.user_id == current_user.id)
        .all()
    )

    compacted_count = 0
    before_bytes = 0
    after_bytes = 0

    for thumb in thumbs:
        full_path = os.path.join(settings.THUMBNAILS_DIR, thumb.storage_path)
        if not os.path.isfile(full_path):
            alt_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/thumbnails", thumb.storage_path))
            if os.path.isfile(alt_path):
                full_path = alt_path
            else:
                continue

        try:
            curr_size = os.path.getsize(full_path)
            before_bytes += curr_size

            with Image.open(full_path) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                w, h = img.size

                buf = io.BytesIO()
                img.save(buf, format="WEBP", quality=quality, method=4)
                new_bytes = buf.getvalue()

            with open(full_path, "wb") as f:
                f.write(new_bytes)

            new_size = len(new_bytes)
            after_bytes += new_size

            thumb.width = w
            thumb.height = h
            thumb.size_bytes = new_size
            thumb.format = "webp"
            compacted_count += 1
        except Exception as e:
            print(f"Error compacting thumbnail {thumb.id}: {e}")

    db.commit()
    saved_bytes = max(0, before_bytes - after_bytes)

    return {
        "compacted_count": compacted_count,
        "before_bytes": before_bytes,
        "after_bytes": after_bytes,
        "saved_bytes": saved_bytes,
        "profile_applied": profile_name
    }
