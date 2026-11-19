import os
import io
import json
import uuid
import pytest
from datetime import datetime, timezone
from PIL import Image
from app.core.config import settings
from app.models.entities import User, Source, Media, File, Thumbnail, ScanJob, Album, AlbumMedia, Tag, MediaTag
from app.services.local_scanner_service import start_server_scan, cancel_server_scan

def create_dummy_jpeg(path: str, width: int = 100, height: int = 100, color: str = "red"):
    img = Image.new("RGB", (width, height), color=color)
    img.save(path, format="JPEG")

def create_dummy_webp(path: str, width: int = 50, height: int = 50):
    img = Image.new("RGB", (width, height), color="blue")
    img.save(path, format="WEBP")

def test_delete_source_cleans_orphan_media_and_thumbnails(client, auth_headers, db):
    # 1. Register a source via API
    res = client.post("/api/v1/sources", json={
        "name": "Disco Per Test Eliminazione",
        "source_type": "external_drive",
        "root_path": "/Volumes/TestDrive"
    }, headers=auth_headers)
    assert res.status_code == 201
    source_id = res.json()["id"]

    # 2. Get current user
    user = db.query(User).filter(User.email == "test@example.com").first()
    assert user is not None

    # 3. Create an orphan media and physical thumbnail
    media_id = str(uuid.uuid4())
    file_id = str(uuid.uuid4())
    thumb_id = str(uuid.uuid4())
    thumb_filename = f"{media_id}_test.webp"
    thumb_path = os.path.join(settings.THUMBNAILS_DIR, thumb_filename)
    create_dummy_webp(thumb_path)
    assert os.path.isfile(thumb_path)

    media = Media(
        id=media_id,
        user_id=user.id,
        media_type="image",
        canonical_sha256="fake_sha256_delete_source_test"
    )
    db.add(media)

    file_record = File(
        id=file_id,
        media_id=media_id,
        source_id=source_id,
        filename="photo_orphan.jpg",
        relative_path="DCIM/photo_orphan.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=50000,
        sha256="fake_sha256_delete_source_test",
        availability_status="present"
    )
    db.add(file_record)

    thumb_record = Thumbnail(
        id=thumb_id,
        media_id=media_id,
        storage_path=thumb_filename,
        format="webp",
        width=50,
        height=50,
        size_bytes=os.path.getsize(thumb_path)
    )
    db.add(thumb_record)
    db.commit()

    # 4. Delete the source via API
    del_res = client.delete(f"/api/v1/sources/{source_id}", headers=auth_headers)
    assert del_res.status_code == 204

    # 5. Verify source, orphan media, and physical thumbnail are deleted
    assert db.query(Source).filter(Source.id == source_id).first() is None
    assert db.query(Media).filter(Media.id == media_id).first() is None
    assert db.query(File).filter(File.id == file_id).first() is None
    assert db.query(Thumbnail).filter(Thumbnail.id == thumb_id).first() is None
    assert not os.path.exists(thumb_path)

def test_stream_and_thumbnail_require_auth_and_enforce_ownership(client, auth_headers, other_user_headers, db, tmp_path):
    user = db.query(User).filter(User.email == "test@example.com").first()

    # Create dummy source directory with media file
    src_dir = tmp_path / "media_dir"
    src_dir.mkdir()
    sample_file = src_dir / "sample.jpg"
    create_dummy_jpeg(str(sample_file))

    source = Source(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name="Source Auth Test",
        source_type="local_folder",
        root_path=str(src_dir),
        status="online"
    )
    db.add(source)

    media_id = str(uuid.uuid4())
    media = Media(
        id=media_id,
        user_id=user.id,
        media_type="image",
        canonical_sha256="sample_auth_sha256"
    )
    db.add(media)

    file_rec = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source.id,
        filename="sample.jpg",
        relative_path="sample.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=os.path.getsize(str(sample_file)),
        sha256="sample_auth_sha256",
        availability_status="present"
    )
    db.add(file_rec)

    thumb_filename = f"{media_id}_sample.webp"
    thumb_path = os.path.join(settings.THUMBNAILS_DIR, thumb_filename)
    create_dummy_webp(thumb_path)

    thumb_rec = Thumbnail(
        id=str(uuid.uuid4()),
        media_id=media_id,
        storage_path=thumb_filename,
        format="webp",
        width=50,
        height=50,
        size_bytes=os.path.getsize(thumb_path)
    )
    db.add(thumb_rec)
    db.commit()

    # 1. No token -> 401
    assert client.get(f"/api/v1/media/{media_id}/thumbnail").status_code == 401
    assert client.get(f"/api/v1/media/{media_id}/stream").status_code == 401

    # 2. Other user's token -> 404 (multi-tenant isolation)
    assert client.get(f"/api/v1/media/{media_id}/thumbnail", headers=other_user_headers).status_code == 404
    assert client.get(f"/api/v1/media/{media_id}/stream", headers=other_user_headers).status_code == 404

    # 3. Valid user Bearer token -> 200
    res_thumb = client.get(f"/api/v1/media/{media_id}/thumbnail", headers=auth_headers)
    assert res_thumb.status_code == 200
    assert res_thumb.headers["content-type"] == "image/webp"

    res_stream = client.get(f"/api/v1/media/{media_id}/stream", headers=auth_headers)
    assert res_stream.status_code == 200
    assert res_stream.headers["content-type"] == "image/jpeg"

    # 4. Query param ?token=<valid_token> -> 200
    token = auth_headers["Authorization"].split(" ")[1]
    res_query_thumb = client.get(f"/api/v1/media/{media_id}/thumbnail?token={token}")
    assert res_query_thumb.status_code == 200

    res_query_stream = client.get(f"/api/v1/media/{media_id}/stream?token={token}")
    assert res_query_stream.status_code == 200

def test_stream_blocks_path_traversal(client, auth_headers, db, tmp_path):
    user = db.query(User).filter(User.email == "test@example.com").first()
    src_dir = tmp_path / "safe_dir"
    src_dir.mkdir()

    source = Source(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name="Traversal Safe Source",
        source_type="local_folder",
        root_path=str(src_dir),
        status="online"
    )
    db.add(source)

    media_id = str(uuid.uuid4())
    media = Media(
        id=media_id,
        user_id=user.id,
        media_type="image",
        canonical_sha256="traversal_sha256"
    )
    db.add(media)

    # Malicious relative_path attempting directory traversal
    file_rec = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source.id,
        filename="passwd",
        relative_path="../../etc/passwd",
        extension="",
        mime_type="text/plain",
        size_bytes=100,
        sha256="traversal_sha256",
        availability_status="present"
    )
    db.add(file_rec)
    db.commit()

    # Stream endpoint MUST return 404 and block traversal
    res = client.get(f"/api/v1/media/{media_id}/stream", headers=auth_headers)
    assert res.status_code == 404

def test_search_combined_with_tag_and_copies_count_accuracy(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()

    source1 = Source(id=str(uuid.uuid4()), user_id=user.id, name="S1", source_type="folder")
    source2 = Source(id=str(uuid.uuid4()), user_id=user.id, name="S2", source_type="folder")
    db.add_all([source1, source2])

    media_id = str(uuid.uuid4())
    media = Media(
        id=media_id,
        user_id=user.id,
        media_type="image",
        canonical_sha256="tag_search_accurate_sha256"
    )
    db.add(media)

    # 2 Physical files (same photo on two sources)
    f1 = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source1.id,
        filename="tramonto_dolomiti.jpg",
        relative_path="tramonto_dolomiti.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=1000,
        sha256="tag_search_accurate_sha256",
        availability_status="present"
    )
    f2 = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source2.id,
        filename="tramonto_dolomiti_backup.jpg",
        relative_path="backup/tramonto_dolomiti_backup.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=1000,
        sha256="tag_search_accurate_sha256",
        availability_status="present"
    )
    db.add_all([f1, f2])

    # 3 Tags attached to the same media
    t1 = Tag(id=str(uuid.uuid4()), user_id=user.id, name="Montagna")
    t2 = Tag(id=str(uuid.uuid4()), user_id=user.id, name="Vacanze")
    t3 = Tag(id=str(uuid.uuid4()), user_id=user.id, name="Estate")
    db.add_all([t1, t2, t3])

    mt1 = MediaTag(id=str(uuid.uuid4()), media_id=media_id, tag_id=t1.id)
    mt2 = MediaTag(id=str(uuid.uuid4()), media_id=media_id, tag_id=t2.id)
    mt3 = MediaTag(id=str(uuid.uuid4()), media_id=media_id, tag_id=t3.id)
    db.add_all([mt1, mt2, mt3])
    db.commit()

    # Query with search + tag_id
    res = client.get(f"/api/v1/media?search=tramonto&tag_id={t1.id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.headers.get("X-Total-Count") == "1"

    data = res.json()
    assert len(data) == 1
    assert data[0]["id"] == media_id
    # Copies count MUST remain 2 (not inflated to 6 by tag joins!)
    assert data[0]["copies_count"] == 2

def test_media_detail_exposes_metadata_json_and_preview_endpoint(client, auth_headers, db, tmp_path):
    user = db.query(User).filter(User.email == "test@example.com").first()

    src_dir = tmp_path / "preview_dir"
    src_dir.mkdir()
    img_path = src_dir / "detail_photo.jpg"
    create_dummy_jpeg(str(img_path), width=800, height=600, color="green")

    source = Source(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name="Detail Preview Source",
        source_type="local_folder",
        root_path=str(src_dir),
        status="online"
    )
    db.add(source)

    media_id = str(uuid.uuid4())
    media = Media(
        id=media_id,
        user_id=user.id,
        media_type="image",
        canonical_sha256="detail_preview_sha256"
    )
    db.add(media)

    meta = {"make": "Apple", "model": "iPhone 15 Pro", "iso": 100, "focal_length": 24.0}
    file_rec = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source.id,
        filename="detail_photo.jpg",
        relative_path="detail_photo.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=os.path.getsize(str(img_path)),
        sha256="detail_preview_sha256",
        metadata_json=json.dumps(meta),
        availability_status="present"
    )
    db.add(file_rec)
    db.commit()

    # 1. Detail endpoint returns metadata_json
    res_detail = client.get(f"/api/v1/media/{media_id}", headers=auth_headers)
    assert res_detail.status_code == 200
    detail_data = res_detail.json()
    assert len(detail_data["files"]) == 1
    assert "Apple" in detail_data["files"][0]["metadata_json"]

    # 2. Preview endpoint returns downscaled JPEG
    res_preview = client.get(f"/api/v1/media/{media_id}/preview?max_edge=400", headers=auth_headers)
    assert res_preview.status_code == 200
    assert res_preview.headers["content-type"] == "image/jpeg"
    assert "max-age=3600" in res_preview.headers["cache-control"]

def test_album_cover_and_rename(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()

    # Create Album
    res_album = client.post("/api/v1/albums", json={
        "name": "Viaggio in Giappone",
        "description": "Tokyo e Kyoto"
    }, headers=auth_headers)
    assert res_album.status_code == 201
    album_id = res_album.json()["id"]

    # Create Media with Thumbnail
    media_id = str(uuid.uuid4())
    media = Media(id=media_id, user_id=user.id, media_type="image", canonical_sha256="japan_sha256")
    thumb = Thumbnail(
        id=str(uuid.uuid4()),
        media_id=media_id,
        storage_path="japan.webp",
        format="webp",
        width=100,
        height=100,
        size_bytes=100
    )
    db.add_all([media, thumb])
    db.commit()

    # Add media to album
    res_add = client.post(f"/api/v1/albums/{album_id}/media", json={"media_ids": [media_id]}, headers=auth_headers)
    assert res_add.status_code == 200

    # List albums -> cover_media_id should be populated
    res_list = client.get("/api/v1/albums", headers=auth_headers)
    assert res_list.status_code == 200
    albums = res_list.json()
    target_album = next(a for a in albums if a["id"] == album_id)
    assert target_album["cover_media_id"] == media_id
    assert target_album["media_count"] == 1

    # Rename and update description via PATCH
    res_patch = client.patch(f"/api/v1/albums/{album_id}", json={
        "name": "Viaggio in Giappone 2026",
        "description": "Itinerario definitivo aggiornato"
    }, headers=auth_headers)
    assert res_patch.status_code == 200
    assert res_patch.json()["name"] == "Viaggio in Giappone 2026"
    assert res_patch.json()["description"] == "Itinerario definitivo aggiornato"

def test_duplicates_summary_and_ignores_missing_files(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    source1 = Source(id=str(uuid.uuid4()), user_id=user.id, name="S1", source_type="folder")
    source2 = Source(id=str(uuid.uuid4()), user_id=user.id, name="S2", source_type="folder")
    db.add_all([source1, source2])

    media_id = str(uuid.uuid4())
    media = Media(id=media_id, user_id=user.id, media_type="image", canonical_sha256="dup_summary_sha256")
    db.add(media)

    f1 = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source1.id,
        filename="orig.jpg",
        relative_path="orig.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=2048,
        sha256="dup_summary_sha256",
        availability_status="present"
    )
    f2 = File(
        id=str(uuid.uuid4()),
        media_id=media_id,
        source_id=source2.id,
        filename="copy.jpg",
        relative_path="copy.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=2048,
        sha256="dup_summary_sha256",
        availability_status="present"
    )
    db.add_all([f1, f2])
    db.commit()

    # 1. Active duplicate group present
    res_summary = client.get("/api/v1/duplicates/summary", headers=auth_headers)
    assert res_summary.status_code == 200
    data = res_summary.json()
    assert data["total_groups"] == 1
    assert data["total_redundant_copies"] == 1
    assert data["total_recoverable_bytes"] == 2048

    # 2. Mark copy as 'missing' -> no longer an active duplicate group
    f2.availability_status = "missing"
    db.commit()

    res_summary_after = client.get("/api/v1/duplicates/summary", headers=auth_headers)
    assert res_summary_after.status_code == 200
    data_after = res_summary_after.json()
    assert data_after["total_groups"] == 0
    assert data_after["total_redundant_copies"] == 0
    assert data_after["total_recoverable_bytes"] == 0

def test_server_scan_workflow_synchronous(client, auth_headers, db, tmp_path):
    user = db.query(User).filter(User.email == "test@example.com").first()
    user_id = user.id

    scan_dir = tmp_path / "server_scan_test"
    scan_dir.mkdir()

    # Create 2 JPG images + 1 sidecar XMP
    img1 = scan_dir / "photo1.jpg"
    img2 = scan_dir / "photo2.jpg"
    xmp1 = scan_dir / "photo1.xmp"

    create_dummy_jpeg(str(img1), width=120, height=120, color="purple")
    create_dummy_jpeg(str(img2), width=120, height=120, color="orange")
    xmp1.write_text("<x:xmpmeta>Dummy XMP sidecar</x:xmpmeta>", encoding="utf-8")

    source = Source(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name="Server Scan Test Source",
        source_type="local_folder",
        root_path=str(scan_dir),
        status="online"
    )
    db.add(source)
    db.commit()

    # Run server scan synchronously using the test session
    job = start_server_scan(db, user_id, source.id, backfill_thumbnails_only=False, run_sync=True)
    assert job.status == "completed"
    assert job.processed_files == 2

    # Verify media indexed in database
    media_items = db.query(Media).filter(Media.user_id == user_id).all()
    assert len(media_items) == 2

    # Verify thumbnails were created
    thumbs = db.query(Thumbnail).all()
    assert len(thumbs) == 2

    # Verify XMP sidecar is NOT a standalone media
    xmp_media = db.query(File).filter(File.extension == "xmp").first()
    assert xmp_media is None

def test_health_api_v1_and_stale_scan_recovery(client, auth_headers, db):
    # 1. Health endpoint
    res_health = client.get("/api/v1/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"

    # 2. Setup a stale scan job and scanning source
    user = db.query(User).filter(User.email == "test@example.com").first()
    source = Source(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name="Stale Scan Source",
        source_type="local_folder",
        root_path="/tmp/fake_stale_path",
        status="scanning"
    )
    db.add(source)

    job = ScanJob(
        id=str(uuid.uuid4()),
        source_id=source.id,
        status="running",
        started_at=datetime.now(timezone.utc)
    )
    db.add(job)
    db.commit()

    # 3. Call maintenance cleanup endpoint
    res_cleanup = client.post("/api/v1/settings/maintenance/cleanup-stale-scans", headers=auth_headers)
    assert res_cleanup.status_code == 200
    assert res_cleanup.json()["recovered_count"] >= 1

    # Verify job is failed and source is no longer 'scanning'
    db.refresh(job)
    db.refresh(source)
    assert job.status == "failed"
    assert source.status in ["online", "offline"]

def test_database_backup_and_maintenance_endpoints(client, auth_headers, db):
    # 1. WAL-safe database backup
    res_backup = client.get("/api/v1/settings/backup/db", headers=auth_headers)
    assert res_backup.status_code == 200
    assert res_backup.headers["content-type"] == "application/x-sqlite3"
    assert len(res_backup.content) > 0

    # 2. Geotag backfill maintenance
    res_geo = client.post("/api/v1/settings/maintenance/geotag-backfill", headers=auth_headers)
    assert res_geo.status_code == 200
    assert "updated_count" in res_geo.json()

    # 3. Dashboard stats enriched endpoint
    res_stats = client.get("/api/v1/media/dashboard/stats", headers=auth_headers)
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "missing_thumbnails_count" in stats
    assert "geotagged_count" in stats
    assert "favorites_count" in stats
    assert "raw_count" in stats
    assert "live_photos_count" in stats
    assert "recoverable_duplicate_bytes" in stats
    assert "storage_by_source" in stats
