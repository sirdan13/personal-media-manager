from typing import List, Dict, Any
from PIL import Image
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.entities import Media, File, Thumbnail, Source


def compute_dhash(img: Image.Image) -> str:
    """Computes a 64-bit Difference Hash (dHash) formatted as a 16-character hex string."""
    gray = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(gray.get_flattened_data()) if hasattr(gray, "get_flattened_data") else list(gray.getdata())

    decimal_val = 0
    bit_idx = 0
    for row in range(8):
        row_offset = row * 9
        for col in range(8):
            pixel_left = pixels[row_offset + col]
            pixel_right = pixels[row_offset + col + 1]
            if pixel_left > pixel_right:
                decimal_val |= 1 << (63 - bit_idx)
            bit_idx += 1

    return f"{decimal_val:016x}"


def hamming_distance(h1: str, h2: str) -> int:
    """Calculates the bitwise Hamming distance between two 16-hex dHash strings."""
    try:
        return bin(int(h1, 16) ^ int(h2, 16)).count("1")
    except Exception:
        return 64


def find_similar_media_groups(db: Session, user_id: str, max_distance: int = 6) -> List[Dict[str, Any]]:
    """
    Finds clusters of visually similar photos (e.g. burst shots, slight edits)
    that have different canonical SHA-256 hashes but Hamming distance <= max_distance.
    """
    # Fetch all user media with non-null dhash
    media_list = (
        db.query(
            Media.id,
            Media.canonical_sha256,
            Media.dhash,
            Media.captured_at,
            Media.width,
            Media.height,
            Media.media_type,
            func.min(File.filename).label("primary_filename"),
            func.max(File.size_bytes).label("primary_size"),
            func.count(File.id).label("copies_count")
        )
        .join(File, Media.id == File.media_id)
        .filter(Media.user_id == user_id, Media.dhash.isnot(None), Media.media_type == "image")
        .group_by(Media.id)
        .all()
    )

    visited = set()
    clusters = []

    for i in range(len(media_list)):
        m1 = media_list[i]
        if m1.id in visited:
            continue

        similar_items = []
        for j in range(i + 1, len(media_list)):
            m2 = media_list[j]
            if m2.id in visited:
                continue

            # Don't cluster exact duplicates (they are already in exact duplicates view)
            if m1.canonical_sha256 == m2.canonical_sha256:
                continue

            dist = hamming_distance(m1.dhash, m2.dhash)
            if dist <= max_distance:
                similarity_pct = round((64 - dist) / 64.0 * 100, 1)
                similar_items.append({
                    "media_id": m2.id,
                    "filename": m2.primary_filename,
                    "size_bytes": m2.primary_size,
                    "captured_at": m2.captured_at.isoformat() if m2.captured_at else None,
                    "dhash": m2.dhash,
                    "distance": dist,
                    "similarity_pct": similarity_pct
                })
                visited.add(m2.id)

        if similar_items:
            visited.add(m1.id)
            clusters.append({
                "base_media": {
                    "media_id": m1.id,
                    "filename": m1.primary_filename,
                    "size_bytes": m1.primary_size,
                    "captured_at": m1.captured_at.isoformat() if m1.captured_at else None,
                    "dhash": m1.dhash
                },
                "similar_count": len(similar_items) + 1,
                "matches": similar_items
            })

    return clusters
