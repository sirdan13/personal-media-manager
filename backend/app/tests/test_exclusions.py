import uuid
from PIL import Image
from app.models.entities import User, Source, File, Media, Thumbnail
from app.services.local_scanner_service import start_server_scan

def create_dummy_jpeg(path: str, width: int = 100, height: int = 100, color: str = "blue"):
    img = Image.new("RGB", (width, height), color=color)
    img.save(path, format="JPEG")

def test_source_exclusions_and_retroactive_purge(client, auth_headers, db, tmp_path):
    user = db.query(User).filter(User.email == "test@example.com").first()
    user_id = user.id

    scan_dir = tmp_path / "exclusion_test_drive"
    scan_dir.mkdir()

    photos_dir = scan_dir / "Photos"
    photos_dir.mkdir()
    music_dir = scan_dir / "Music"
    music_dir.mkdir()
    archive_dir = scan_dir / "Archive" / "Old"
    archive_dir.mkdir(parents=True)

    img_photo = photos_dir / "pic1.jpg"
    img_music = music_dir / "song_cover.jpg"
    img_old = archive_dir / "doc.jpg"

    create_dummy_jpeg(str(img_photo), color="blue")
    create_dummy_jpeg(str(img_music), color="green")
    create_dummy_jpeg(str(img_old), color="red")

    # 1. Create source
    source = Source(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name="Exclusion Test Source",
        source_type="external_drive",
        root_path=str(scan_dir),
        status="online"
    )
    db.add(source)
    db.commit()

    # 2. Run initial full scan
    job = start_server_scan(db, user_id, source.id, run_sync=True)
    assert job.status == "completed"
    assert job.processed_files == 3

    # Check files in DB
    files_before = db.query(File).filter(File.source_id == source.id).all()
    assert len(files_before) == 3

    # 3. Test list folders endpoint
    folders_res = client.get(f"/api/v1/sources/{source.id}/folders", headers=auth_headers)
    assert folders_res.status_code == 200
    folder_names = [f["folder"] for f in folders_res.json()]
    assert "Photos" in folder_names
    assert "Music" in folder_names
    assert "Archive/Old" in folder_names

    # 4. Apply exclusions with retroactive purge
    res = client.post(
        f"/api/v1/sources/{source.id}/exclusions",
        headers=auth_headers,
        json={"excluded_paths": "Music, *Old*", "purge_existing": True}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["purged_files"] == 2
    assert data["purged_media"] == 2

    # Check that only Photos/pic1.jpg remains in DB
    remaining_files = db.query(File).filter(File.source_id == source.id).all()
    assert len(remaining_files) == 1
    assert "pic1.jpg" in remaining_files[0].filename

    # Verify 100% Read-Only Safety: physical files on disk MUST NOT BE DELETED
    assert img_photo.exists()
    assert img_music.exists()
    assert img_old.exists()

    # 5. Re-run scan: excluded paths must be skipped upstream
    job2 = start_server_scan(db, user_id, source.id, run_sync=True)
    assert job2.status == "completed"
    # Discovered should only be 1 (pic1.jpg) because Music and Archive/Old were pruned upstream
    assert job2.total_files_discovered == 1
