import os
import pytest


def _ingest_dummy_image(client, auth_headers, source_id: str, filename: str, rel_path: str, sha256: str, size_bytes: int = 1024):
    scan = client.post(
        f"/api/v1/scans/{source_id}/start",
        headers=auth_headers,
        json={"total_files_discovered": 1}
    ).json()
    res = client.post(
        f"/api/v1/scans/{scan['id']}/batch",
        headers=auth_headers,
        json={
            "items": [
                {
                    "filename": filename,
                    "relative_path": rel_path,
                    "extension": "jpg",
                    "mime_type": "image/jpeg",
                    "size_bytes": size_bytes,
                    "sha256": sha256,
                    "width": 800,
                    "height": 600
                }
            ]
        }
    )
    assert res.status_code == 200
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 1, "failed_files": 0})


def test_quick_verify_and_orphan_lifecycle(client, auth_headers, tmp_path):
    disk_a = tmp_path / "disk_a"
    disk_b = tmp_path / "disk_b"
    disk_a.mkdir()
    disk_b.mkdir()

    # Photo 1 on both Disk A & Disk B (protected)
    p1_a = disk_a / "p1.jpg"
    p1_b = disk_b / "p1.jpg"
    p1_a.write_bytes(b"PHOTO_ONE_DATA")
    p1_b.write_bytes(b"PHOTO_ONE_DATA")

    # Photo 2 only on Disk A (unprotected)
    p2_a = disk_a / "p2.jpg"
    p2_a.write_bytes(b"PHOTO_TWO_DATA")

    src_a = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk A", "source_type": "external_drive", "root_path": str(disk_a), "role": "primary"
    }).json()["id"]
    src_b = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk B", "source_type": "external_drive", "root_path": str(disk_b), "role": "backup"
    }).json()["id"]

    sha1 = "1111111111111111111111111111111111111111111111111111111111111111"
    sha2 = "2222222222222222222222222222222222222222222222222222222222222222"

    _ingest_dummy_image(client, auth_headers, src_a, "p1.jpg", "p1.jpg", sha1, 14)
    _ingest_dummy_image(client, auth_headers, src_b, "p1.jpg", "p1.jpg", sha1, 14)
    _ingest_dummy_image(client, auth_headers, src_a, "p2.jpg", "p2.jpg", sha2, 14)

    # Confirm initial states
    media_list = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_list) == 2

    # Delete p1.jpg from Disk B and p2.jpg from Disk A externally via filesystem
    os.remove(p1_b)
    os.remove(p2_a)

    # Run Quick Verify
    verify_res = client.post("/api/v1/sources/verify", headers=auth_headers, json={}).json()
    assert verify_res["checked_sources"] == 2
    assert verify_res["newly_missing"] == 2
    assert verify_res["orphan_media_count"] == 1

    # Normal library list should now only show p1 (and its status should be unprotected = 1 disk!)
    active_list = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(active_list) == 1
    assert active_list[0]["primary_filename"] == "p1.jpg"
    assert active_list[0]["protection_status"] == "unprotected"
    assert active_list[0]["distinct_sources_count"] == 1

    # Missing filter should show p2 (the orphan media)
    missing_list = client.get("/api/v1/media?protection_status=missing", headers=auth_headers).json()
    assert len(missing_list) == 1
    assert missing_list[0]["primary_filename"] == "p2.jpg"
    assert missing_list[0]["protection_status"] == "missing"

    # Purge missing records
    purge_res = client.post("/api/v1/sources/purge-missing", headers=auth_headers, json={}).json()
    assert purge_res["purged_files_count"] == 2
    assert purge_res["purged_orphan_media_count"] == 1

    # Missing list should now be empty
    assert client.get("/api/v1/media?protection_status=missing", headers=auth_headers).json() == []


def test_batch_trash_and_empty_trash(client, auth_headers, tmp_path):
    disk_dir = tmp_path / "disk_trash"
    disk_dir.mkdir()
    photo = disk_dir / "to_trash.jpg"
    photo.write_bytes(b"TRASH_ME_BYTES_999")

    src_id = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Trash Disk", "source_type": "external_drive", "root_path": str(disk_dir), "role": "primary"
    }).json()["id"]

    sha = "3333333333333333333333333333333333333333333333333333333333333333"
    _ingest_dummy_image(client, auth_headers, src_id, "to_trash.jpg", "to_trash.jpg", sha, 18)

    media_id = client.get("/api/v1/media", headers=auth_headers).json()[0]["id"]

    # Move to .pmm_trash via library batch trash
    trash_res = client.post("/api/v1/media/batch/trash", headers=auth_headers, json={
        "media_ids": [media_id]
    }).json()
    assert trash_res["trashed_files_count"] == 1
    assert not photo.exists()

    # Should no longer appear in normal library list
    assert client.get("/api/v1/media", headers=auth_headers).json() == []

    # Should appear in /duplicates/trash
    trash_list = client.get("/api/v1/duplicates/trash", headers=auth_headers).json()
    assert trash_list["total_count"] == 1
    trashed_disk_file = disk_dir / trash_list["items"][0]["trash_relative_path"]
    assert trashed_disk_file.exists()

    # Empty trash permanently
    empty_res = client.post("/api/v1/duplicates/trash/empty", headers=auth_headers, json={}).json()
    assert empty_res["deleted_files_count"] == 1
    assert empty_res["freed_bytes"] == 18
    assert empty_res["deleted_media_count"] == 1
    assert not trashed_disk_file.exists()
    assert client.get("/api/v1/duplicates/trash", headers=auth_headers).json()["total_count"] == 0
