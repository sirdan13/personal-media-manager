import io
import tempfile
import pytest
from PIL import Image
from datetime import datetime, timezone
from app.models.entities import User, Media, File, Source, Thumbnail
from agent.scanner_agent import ScannerAgent

def test_embedded_jpeg_extraction_from_raw():
    # 1. Create a valid test JPEG in memory
    buf = io.BytesIO()
    test_img = Image.new("RGB", (320, 240), color=(120, 180, 240))
    test_img.save(buf, format="JPEG")
    valid_jpeg_bytes = buf.getvalue()
    assert len(valid_jpeg_bytes) > 8192 or len(valid_jpeg_bytes) > 1000

    # If small, pad inside JPEG comment or enlarge dimensions so it's > 8192 bytes
    if len(valid_jpeg_bytes) <= 8192:
        buf = io.BytesIO()
        test_img = Image.new("RGB", (640, 480), color=(120, 180, 240))
        # Add some random pattern so compressed JPEG is > 8192 bytes
        pixels = test_img.load()
        for x in range(640):
            for y in range(480):
                if (x + y) % 3 == 0:
                    pixels[x, y] = (x % 255, y % 255, (x * y) % 255)
        test_img.save(buf, format="JPEG", quality=95)
        valid_jpeg_bytes = buf.getvalue()

    assert len(valid_jpeg_bytes) > 8192

    # 2. Wrap it inside synthetic RAW container bytes (dummy header + embedded JPEG + raw data)
    synthetic_raw_data = b"DNG_HEADER_TIFF_TAGS_0000" * 200 + valid_jpeg_bytes + b"RAW_SENSOR_PIXEL_DATA" * 500

    with tempfile.NamedTemporaryFile(suffix=".dng", delete=False) as f:
        f.write(synthetic_raw_data)
        f.flush()
        temp_dng_path = f.name

    try:
        agent = ScannerAgent("http://localhost:8000", "test@test.com", "pass")
        extracted_bytes = agent.extract_largest_embedded_jpeg(temp_dng_path)
        assert extracted_bytes is not None
        assert extracted_bytes == valid_jpeg_bytes
    finally:
        import os
        if os.path.exists(temp_dng_path):
            os.remove(temp_dng_path)


def test_media_raw_filter_and_primary_extension(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    source = Source(user_id=user.id, name="RAW Test Source", source_type="local_folder")
    db.add(source)
    db.flush()

    # RAW Media (DNG)
    m_raw = Media(user_id=user.id, media_type="image", canonical_sha256="sha_raw_1")
    # Standard Media (JPG)
    m_jpg = Media(user_id=user.id, media_type="image", canonical_sha256="sha_jpg_1")
    db.add_all([m_raw, m_jpg])
    db.flush()

    f_raw = File(
        media_id=m_raw.id, source_id=source.id, filename="photo.dng",
        relative_path="photo.dng", extension="dng", mime_type="image/x-adobe-dng",
        size_bytes=25000000, sha256="sha_raw_1"
    )
    f_jpg = File(
        media_id=m_jpg.id, source_id=source.id, filename="photo.jpg",
        relative_path="photo.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=3000000, sha256="sha_jpg_1"
    )
    db.add_all([f_raw, f_jpg])
    db.commit()

    # Query with media_type=raw
    resp = client.get("/api/v1/media?media_type=raw", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["id"] == m_raw.id
    assert items[0]["primary_extension"] == "dng"

    # Query all images
    resp_all = client.get("/api/v1/media?media_type=image", headers=auth_headers)
    assert resp_all.status_code == 200
    all_ids = [item["id"] for item in resp_all.json()]
    assert m_raw.id in all_ids
    assert m_jpg.id in all_ids


def test_source_fingerprints_has_thumbnail_field(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    source = Source(user_id=user.id, name="Thumb Check Source", source_type="local_folder")
    db.add(source)
    db.flush()

    m_with_thumb = Media(user_id=user.id, media_type="image", canonical_sha256="sha_thumb_yes")
    m_no_thumb = Media(user_id=user.id, media_type="image", canonical_sha256="sha_thumb_no")
    db.add_all([m_with_thumb, m_no_thumb])
    db.flush()

    f1 = File(
        media_id=m_with_thumb.id, source_id=source.id, filename="has_thumb.jpg",
        relative_path="has_thumb.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=1000, sha256="sha_thumb_yes"
    )
    f2 = File(
        media_id=m_no_thumb.id, source_id=source.id, filename="no_thumb.dng",
        relative_path="no_thumb.dng", extension="dng", mime_type="image/x-adobe-dng",
        size_bytes=2000, sha256="sha_thumb_no"
    )
    db.add_all([f1, f2])

    t1 = Thumbnail(media_id=m_with_thumb.id, storage_path="fake/path.webp", format="webp", width=320, height=240, size_bytes=5000)
    db.add(t1)
    db.commit()

    resp = client.get(f"/api/v1/sources/{source.id}/fingerprints", headers=auth_headers)
    assert resp.status_code == 200
    fps = resp.json()

    assert "has_thumb.jpg" in fps
    assert fps["has_thumb.jpg"]["has_thumbnail"] is True
    assert "no_thumb.dng" in fps
    assert fps["no_thumb.dng"]["has_thumbnail"] is False


def test_live_photo_secondary_mov_hidden_from_main_gallery(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    source = Source(user_id=user.id, name="Live Source", source_type="local_folder")
    db.add(source)
    db.flush()

    # Video part of live photo
    m_mov = Media(user_id=user.id, media_type="video", canonical_sha256="sha_live_mov")
    db.add(m_mov)
    db.flush()

    # Photo part of live photo referencing m_mov
    m_heic = Media(
        user_id=user.id,
        media_type="image",
        canonical_sha256="sha_live_heic",
        is_live_photo=1,
        live_video_media_id=m_mov.id
    )
    db.add(m_heic)
    db.flush()

    f_mov = File(
        media_id=m_mov.id, source_id=source.id, filename="IMG_0001.MOV",
        relative_path="IMG_0001.MOV", extension="mov", mime_type="video/quicktime",
        size_bytes=5000000, sha256="sha_live_mov"
    )
    f_heic = File(
        media_id=m_heic.id, source_id=source.id, filename="IMG_0001.HEIC",
        relative_path="IMG_0001.HEIC", extension="heic", mime_type="image/heic",
        size_bytes=2000000, sha256="sha_live_heic"
    )
    db.add_all([f_mov, f_heic])
    db.commit()

    # 1. Main gallery (no media_type filter): m_heic is present, secondary m_mov is hidden
    resp_main = client.get("/api/v1/media", headers=auth_headers)
    assert resp_main.status_code == 200
    main_ids = [item["id"] for item in resp_main.json()]
    assert m_heic.id in main_ids
    assert m_mov.id not in main_ids

    # 2. Filter explicit video: m_mov is present
    resp_video = client.get("/api/v1/media?media_type=video", headers=auth_headers)
    assert resp_video.status_code == 200
    video_ids = [item["id"] for item in resp_video.json()]
    assert m_mov.id in video_ids
    assert m_heic.id not in video_ids
