from typing import List, Dict, Any, Optional
from PIL import Image
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.entities import Media, File, Thumbnail, Source


from typing import List, Dict, Any, Optional
from datetime import timedelta
from PIL import Image
import numpy as np
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
        return (int(h1, 16) ^ int(h2, 16)).bit_count()
    except Exception:
        return 64


def find_similar_media_groups(
    db: Session,
    user_id: str,
    max_distance: int = 6,
    max_time_diff_hours: Optional[int] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Finds clusters of visually similar photos (e.g. burst shots, slight edits)
    that have different canonical SHA-256 hashes but Hamming distance <= max_distance.
    Optimized for high-scale media libraries (>50,000 photos) using SIMD/vectorized bitwise
    operations and temporal sliding-window indexing.
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

    if not media_list:
        return []

    # Parse and index items
    valid_items = []
    for m in media_list:
        try:
            dhash_int = int(m.dhash, 16)
            valid_items.append((m, dhash_int))
        except (ValueError, TypeError):
            continue

    if not valid_items:
        return []

    clusters: List[Dict[str, Any]] = []

    # CASE A: Temporal window active (burst shots / same day) -> O(N log N) sliding window
    if max_time_diff_hours is not None:
        window_delta = timedelta(hours=max_time_diff_hours)
        # Filter items with captured_at and sort temporally
        dated_items = [item for item in valid_items if item[0].captured_at is not None]
        dated_items.sort(key=lambda x: x[0].captured_at)

        visited = set()
        for i in range(len(dated_items)):
            if len(clusters) >= limit:
                break
            m1, dhash1_int = dated_items[i]
            if m1.id in visited:
                continue

            similar_items = []
            for j in range(i + 1, len(dated_items)):
                m2, dhash2_int = dated_items[j]
                if m2.captured_at - m1.captured_at > window_delta:
                    break
                if m2.id in visited or m1.canonical_sha256 == m2.canonical_sha256:
                    continue

                dist = (dhash1_int ^ dhash2_int).bit_count()
                if dist <= max_distance:
                    similarity_pct = round((64 - dist) / 64.0 * 100, 1)
                    similar_items.append({
                        "id": m2.id,
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
                base_dict = {
                    "id": m1.id,
                    "media_id": m1.id,
                    "filename": m1.primary_filename,
                    "size_bytes": m1.primary_size,
                    "captured_at": m1.captured_at.isoformat() if m1.captured_at else None,
                    "dhash": m1.dhash,
                    "distance": 0,
                    "similarity_pct": 100.0
                }
                media_items = [base_dict] + similar_items
                clusters.append({
                    "group_id": f"sim_{m1.id}",
                    "base_media": base_dict,
                    "similar_count": len(media_items),
                    "count": len(media_items),
                    "matches": similar_items,
                    "media_items": media_items
                })

        return clusters

    # CASE B: Global search across entire library -> NumPy vectorized SIMD popcount
    arr_hashes = np.array([item[1] for item in valid_items], dtype=np.uint64)
    arr_shas = np.array([item[0].canonical_sha256 for item in valid_items])
    n = len(arr_hashes)
    visited_mask = np.zeros(n, dtype=bool)

    for i in range(n):
        if len(clusters) >= limit:
            break
        if visited_mask[i]:
            continue

        q_val = arr_hashes[i]
        q_sha = arr_shas[i]
        m1 = valid_items[i][0]

        # Vectorized bitwise XOR and popcount across all unvisited elements
        unvisited = ~visited_mask
        unvisited[i] = False

        # Fast vectorized Hamming distance in C/SIMD
        dist_arr = np.bitwise_count(arr_hashes ^ q_val)
        matches_mask = unvisited & (dist_arr <= max_distance) & (arr_shas != q_sha)
        match_indices = np.where(matches_mask)[0]

        if len(match_indices) > 0:
            visited_mask[i] = True
            visited_mask[match_indices] = True

            similar_items = []
            for idx in match_indices:
                m2 = valid_items[idx][0]
                dist = int(dist_arr[idx])
                similarity_pct = round((64 - dist) / 64.0 * 100, 1)
                similar_items.append({
                    "id": m2.id,
                    "media_id": m2.id,
                    "filename": m2.primary_filename,
                    "size_bytes": m2.primary_size,
                    "captured_at": m2.captured_at.isoformat() if m2.captured_at else None,
                    "dhash": m2.dhash,
                    "distance": dist,
                    "similarity_pct": similarity_pct
                })

            base_dict = {
                "id": m1.id,
                "media_id": m1.id,
                "filename": m1.primary_filename,
                "size_bytes": m1.primary_size,
                "captured_at": m1.captured_at.isoformat() if m1.captured_at else None,
                "dhash": m1.dhash,
                "distance": 0,
                "similarity_pct": 100.0
            }
            media_items = [base_dict] + similar_items
            clusters.append({
                "group_id": f"sim_{m1.id}",
                "base_media": base_dict,
                "similar_count": len(media_items),
                "count": len(media_items),
                "matches": similar_items,
                "media_items": media_items
            })

    # Batch annotate has_thumbnail for all items in returned clusters
    all_cluster_media_ids = set()
    for c in clusters:
        all_cluster_media_ids.add(c["base_media"]["id"])
        for m in c["matches"]:
            all_cluster_media_ids.add(m["id"])

    if all_cluster_media_ids:
        thumb_rows = db.query(Thumbnail.media_id).filter(Thumbnail.media_id.in_(all_cluster_media_ids)).all()
        has_thumb_set = {t[0] for t in thumb_rows}
        for c in clusters:
            c["base_media"]["has_thumbnail"] = c["base_media"]["id"] in has_thumb_set
            for m in c["matches"]:
                m["has_thumbnail"] = m["id"] in has_thumb_set
            for item in c["media_items"]:
                item["has_thumbnail"] = item["id"] in has_thumb_set

    return clusters
