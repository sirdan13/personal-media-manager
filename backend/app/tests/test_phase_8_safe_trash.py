import os
import json
import pytest
from app.services.source_service import reconcile_source_files

DUP_HASH = "8888888888888888888888888888888888888888888888888888888888888888"

def setup_disk_with_intra_duplicates(client, auth_headers, tmp_path):
    disk_dir = tmp_path / "disk_a"
    disk_dir.mkdir(parents=True, exist_ok=True)

    # Subfolders
    album_dir = disk_dir / "album"
    dup_dir = disk_dir / "dup_folder"
    album_dir.mkdir(parents=True, exist_ok=True)
    dup_dir.mkdir(parents=True, exist_ok=True)

    # 1. Physical files
    keep_file_path = album_dir / "photo.jpg"
    copy_file_path = dup_dir / "photo_copy.jpg"
    sidecar_path = dup_dir / "photo_copy.xmp"

    dummy_content = b"ORIGINAL_PHOTO_IMAGE_BYTES_123456"
    keep_file_path.write_bytes(dummy_content)
    copy_file_path.write_bytes(dummy_content)
    sidecar_path.write_text("<xmp>Test Sidecar Metadata</xmp>")

    # 2. Register source
    source_res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Hard Disk A",
        "source_type": "external_drive",
        "root_path": str(disk_dir),
        "role": "primary"
    }).json()
    source_id = source_res["id"]

    # 3. Ingest both copies via scan batch
    scan = client.post(f"/api/v1/scans/{source_id}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "photo.jpg",
                "relative_path": "album/photo.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": len(dummy_content),
                "sha256": DUP_HASH
            },
            {
                "filename": "photo_copy.jpg",
                "relative_path": "dup_folder/photo_copy.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": len(dummy_content),
                "sha256": DUP_HASH
            }
        ]
    })

    # 4. Retrieve media and file ids
    media_list = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_list) == 1
    media_id = media_list[0]["id"]
    assert media_list[0]["copies_count"] == 2

    detail = client.get(f"/api/v1/media/{media_id}", headers=auth_headers).json()
    files_by_name = {f["filename"]: f for f in detail["files"]}
    keep_file_id = files_by_name["photo.jpg"]["id"]
    copy_file_id = files_by_name["photo_copy.jpg"]["id"]

    return {
        "disk_dir": disk_dir,
        "source_id": source_id,
        "media_id": media_id,
        "keep_file_id": keep_file_id,
        "copy_file_id": copy_file_id,
        "keep_file_path": keep_file_path,
        "copy_file_path": copy_file_path,
        "sidecar_path": sidecar_path
    }


def test_trash_intra_source_duplicate_moves_file_to_disk_trash_and_updates_stats(client, auth_headers, tmp_path):
    ctx = setup_disk_with_intra_duplicates(client, auth_headers, tmp_path)
    copy_file_id = ctx["copy_file_id"]
    keep_file_id = ctx["keep_file_id"]
    disk_dir = ctx["disk_dir"]

    # 1. Call trash endpoint
    res = client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": [copy_file_id],
        "keep_file_ids": [keep_file_id]
    })
    assert res.status_code == 200
    data = res.json()
    assert data["trashed_count"] == 1
    assert data["errors"] == []

    # 2. Filesystem verification
    # Original keep file must remain untouched
    assert ctx["keep_file_path"].is_file()

    # The trashed copy must NO LONGER be at the original location
    assert not ctx["copy_file_path"].exists()
    assert not ctx["sidecar_path"].exists()

    # The file must physically exist in .pmm_trash/files/dup_folder/photo_copy.jpg
    expected_trash_path = disk_dir / ".pmm_trash" / "files" / "dup_folder" / "photo_copy.jpg"
    expected_sidecar_trash_path = disk_dir / ".pmm_trash" / "files" / "dup_folder" / "photo_copy.xmp"
    assert expected_trash_path.is_file()
    assert expected_sidecar_trash_path.is_file()

    # Manifest must exist and contain the trash action
    manifest_path = disk_dir / ".pmm_trash" / "manifest.jsonl"
    assert manifest_path.is_file()
    lines = [json.loads(l) for l in manifest_path.read_text().splitlines() if l.strip()]
    assert any(entry["action"] == "trash" and entry["file_id"] == copy_file_id for entry in lines)

    # 3. Check media and duplicates API: copies_count must now be 1, 0 intra duplicates
    media_res = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_res) == 1
    assert media_res[0]["copies_count"] == 1
    assert media_res[0]["protection_status"] == "unprotected"

    dup_res = client.get("/api/v1/duplicates?mode=intra_source", headers=auth_headers).json()
    assert len(dup_res) == 0


def test_trash_guardrail_blocks_trashing_all_copies_of_a_media(client, auth_headers, tmp_path):
    ctx = setup_disk_with_intra_duplicates(client, auth_headers, tmp_path)
    copy_file_id = ctx["copy_file_id"]
    keep_file_id = ctx["keep_file_id"]

    # 1. Attempt to trash BOTH active copies (would orphan the media)
    res_both = client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": [copy_file_id, keep_file_id]
    })
    assert res_both.status_code == 400
    assert "conservare almeno 1 copia attiva" in res_both.json()["detail"]

    # 2. Attempt to trash the only remaining active copy when keep_file_ids contains it
    res_keep_conflict = client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": [keep_file_id],
        "keep_file_ids": [keep_file_id]
    })
    assert res_keep_conflict.status_code == 400

    # Ensure NO files were moved on disk
    assert ctx["keep_file_path"].is_file()
    assert ctx["copy_file_path"].is_file()


def test_restore_from_trash_returns_file_to_exact_original_path(client, auth_headers, tmp_path):
    ctx = setup_disk_with_intra_duplicates(client, auth_headers, tmp_path)
    copy_file_id = ctx["copy_file_id"]
    keep_file_id = ctx["keep_file_id"]
    disk_dir = ctx["disk_dir"]

    # 1. Trash the copy
    client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": [copy_file_id],
        "keep_file_ids": [keep_file_id]
    })
    assert not ctx["copy_file_path"].exists()

    # 2. List trashed files via GET /duplicates/trash
    trash_list = client.get("/api/v1/duplicates/trash", headers=auth_headers).json()
    assert trash_list["total_count"] == 1
    item = trash_list["items"][0]
    assert item["file_id"] == copy_file_id
    assert item["original_relative_path"] == "dup_folder/photo_copy.jpg"
    assert ".pmm_trash" in item["trash_relative_path"]

    # 3. Restore the file via POST /duplicates/trash/restore
    res_restore = client.post("/api/v1/duplicates/trash/restore", headers=auth_headers, json={
        "file_ids": [copy_file_id]
    })
    assert res_restore.status_code == 200
    data = res_restore.json()
    assert data["restored_count"] == 1

    # 4. Verify filesystem: file and sidecar must be back in dup_folder/
    assert ctx["copy_file_path"].is_file()
    assert ctx["sidecar_path"].is_file()

    # 5. Verify database state
    detail = client.get(f"/api/v1/media/{ctx['media_id']}", headers=auth_headers).json()
    files_by_name = {f["filename"]: f for f in detail["files"]}
    restored_f = files_by_name["photo_copy.jpg"]
    assert restored_f["availability_status"] == "available"
    assert restored_f["trash_relative_path"] is None

    # 6. Trash list must now be empty
    empty_trash = client.get("/api/v1/duplicates/trash", headers=auth_headers).json()
    assert empty_trash["total_count"] == 0


def test_scanner_and_reconcile_ignore_pmm_trash_folder(client, auth_headers, db, tmp_path):
    ctx = setup_disk_with_intra_duplicates(client, auth_headers, tmp_path)
    copy_file_id = ctx["copy_file_id"]
    keep_file_id = ctx["keep_file_id"]
    source_id = ctx["source_id"]

    # 1. Trash the copy
    client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": [copy_file_id],
        "keep_file_ids": [keep_file_id]
    })

    # 2. Run reconcile_source_files with only the remaining active file
    from app.models.entities import Source, File
    src = db.query(Source).filter(Source.id == source_id).first()
    seen_paths = ["album/photo.jpg"]
    reconcile_source_files(db, src.user_id, source_id, seen_paths)

    # 3. Verify that the trashed file did NOT become 'missing' and remained 'trashed'
    trashed_record = db.query(File).filter(File.id == copy_file_id).first()
    assert trashed_record.availability_status == "trashed"
    assert trashed_record.trash_relative_path is not None

    # 4. Check media API
    media_res = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_res) == 1
    assert media_res[0]["copies_count"] == 1
