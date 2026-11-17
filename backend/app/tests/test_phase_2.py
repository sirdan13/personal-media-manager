from app.models.entities import Media, File


def test_sidecar_aae_and_dat_files_are_skipped(client, auth_headers, db):
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Phase 2 Sidecar Test",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 3}).json()

    # Send 1 real photo, 1 .aae file, 1 .dat file
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "IMG_1001.HEIC",
                "relative_path": "DCIM/100APPLE/IMG_1001.HEIC",
                "extension": "heic",
                "mime_type": "image/heic",
                "size_bytes": 2500000,
                "sha256": "aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee1"
            },
            {
                "filename": "IMG_1001.AAE",
                "relative_path": "DCIM/100APPLE/IMG_1001.AAE",
                "extension": "aae",
                "mime_type": "application/xml",
                "size_bytes": 1200,
                "sha256": "bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee2"
            },
            {
                "filename": "Thumbs.dat",
                "relative_path": "DCIM/100APPLE/Thumbs.dat",
                "extension": "dat",
                "mime_type": "application/octet-stream",
                "size_bytes": 4096,
                "sha256": "cccc1111222233334444555566667777888899990000aaaabbbbccccddddeeee3"
            }
        ]
    })
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 3})

    # Verify that only the real photo was created as Media
    media_aae = db.query(Media).filter(Media.canonical_sha256 == "bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee2").first()
    media_dat = db.query(Media).filter(Media.canonical_sha256 == "cccc1111222233334444555566667777888899990000aaaabbbbccccddddeeee3").first()
    media_heic = db.query(Media).filter(Media.canonical_sha256 == "aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee1").first()

    assert media_aae is None
    assert media_dat is None
    assert media_heic is not None


def test_apple_live_photo_pairing(client, auth_headers, db):
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Phase 2 Live Photo Test",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()

    # Ingest IMG_2000.HEIC and IMG_2000.MOV in the same folder
    photo_sha = "dddd1111222233334444555566667777888899990000aaaabbbbccccddddeeee4"
    video_sha = "eeee1111222233334444555566667777888899990000aaaabbbbccccddddeeee5"

    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "IMG_2000.HEIC",
                "relative_path": "DCIM/100APPLE/IMG_2000.HEIC",
                "extension": "heic",
                "mime_type": "image/heic",
                "size_bytes": 2200000,
                "sha256": photo_sha
            },
            {
                "filename": "IMG_2000.MOV",
                "relative_path": "DCIM/100APPLE/IMG_2000.MOV",
                "extension": "mov",
                "mime_type": "video/quicktime",
                "size_bytes": 3500000,
                "sha256": video_sha
            }
        ]
    })
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 2})

    photo_media = db.query(Media).filter(Media.canonical_sha256 == photo_sha).first()
    video_media = db.query(Media).filter(Media.canonical_sha256 == video_sha).first()

    assert photo_media is not None
    assert video_media is not None
    assert photo_media.is_live_photo == 1
    assert photo_media.live_video_media_id == video_media.id

    # Check that detail endpoint exposes is_live_photo
    detail = client.get(f"/api/v1/media/{photo_media.id}", headers=auth_headers).json()
    assert detail["is_live_photo"] is True
    assert detail["live_video_media_id"] == video_media.id
