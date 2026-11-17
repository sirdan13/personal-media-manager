import os
import io
import base64
from PIL import Image
from app.models.entities import Thumbnail, Media


def test_png_payload_converted_to_true_webp_on_server(client, auth_headers, db):
    # 1. Create a dummy PNG in memory
    img = Image.new("RGBA", (800, 600), color=(255, 0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_base64 = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"

    # 2. Register source and start scan
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Phase 1 Test Drive",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()

    # 3. Ingest item with PNG base64 thumbnail
    sha = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff0"
    resp = client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "test_safari_fallback.png",
            "relative_path": "photos/test_safari_fallback.png",
            "extension": "png",
            "mime_type": "image/png",
            "size_bytes": len(buf.getvalue()),
            "sha256": sha,
            "thumbnail_base64": png_base64
        }]
    })
    assert resp.status_code == 200

    # 4. Check DB thumbnail record
    media = db.query(Media).filter(Media.canonical_sha256 == sha).first()
    assert media is not None

    thumb = db.query(Thumbnail).filter(Thumbnail.media_id == media.id).first()
    assert thumb is not None
    assert thumb.format == "webp"
    # Max edge in balanced profile is 320
    assert max(thumb.width, thumb.height) <= 320

    # 5. Check magic bytes on disk
    from app.core.config import settings
    full_path = os.path.join(settings.THUMBNAILS_DIR, thumb.storage_path)
    if not os.path.isfile(full_path):
        # Alternative path check
        alt = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/thumbnails", thumb.storage_path))
        if os.path.isfile(alt):
            full_path = alt

    assert os.path.isfile(full_path)
    with open(full_path, "rb") as f:
        header = f.read(12)
        assert header[:4] == b"RIFF"
        assert header[8:12] == b"WEBP"


def test_storage_settings_and_compaction_endpoints(client, auth_headers):
    # 1. Get storage stats
    res = client.get("/api/v1/settings/storage", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "thumbnail_profile" in data
    assert "available_profiles" in data

    # 2. Update profile to compact
    put_res = client.put("/api/v1/settings/storage", headers=auth_headers, json={
        "thumbnail_profile": "compact"
    })
    assert put_res.status_code == 200
    assert put_res.json()["thumbnail_profile"] == "compact"

    # 3. Compact thumbnails
    compact_res = client.post("/api/v1/settings/storage/compact", headers=auth_headers)
    assert compact_res.status_code == 200
    assert "compacted_count" in compact_res.json()
    assert compact_res.json()["profile_applied"] == "compact"
