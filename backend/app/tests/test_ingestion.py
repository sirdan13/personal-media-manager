def test_scan_lifecycle_and_idempotent_ingestion(client, auth_headers):
    # 1. Create source
    src_res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Cartella Foto Vacanze",
        "source_type": "browser_folder"
    })
    source_id = src_res.json()["id"]

    # 2. Start scan
    start_res = client.post(f"/api/v1/scans/{source_id}/start", headers=auth_headers, json={
        "total_files_discovered": 2
    })
    assert start_res.status_code == 201
    scan_id = start_res.json()["id"]
    assert start_res.json()["status"] == "running"

    # 3. Submit first batch of 2 items
    batch_items = [
        {
            "filename": "IMG_0001.JPG",
            "relative_path": "2023/IMG_0001.JPG",
            "extension": "jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 1048576,
            "sha256": "aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee",
            "width": 1920,
            "height": 1080
        },
        {
            "filename": "IMG_0002.JPG",
            "relative_path": "2023/IMG_0002.JPG",
            "extension": "jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 2097152,
            "sha256": "bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee",
            "width": 1920,
            "height": 1080
        }
    ]

    batch_res = client.post(f"/api/v1/scans/{scan_id}/batch", headers=auth_headers, json={
        "items": batch_items,
        "checkpoint_path": "2023/IMG_0002.JPG"
    })
    assert batch_res.status_code == 200
    assert batch_res.json()["processed"] == 2
    assert batch_res.json()["new_media_created"] == 2
    assert batch_res.json()["duplicate_instances_associated"] == 0

    # Verify media count
    media_res = client.get("/api/v1/media", headers=auth_headers)
    assert len(media_res.json()) == 2

    # 4. IDEMPOTENCY TEST: Rescan the exact same files
    rescan_start = client.post(f"/api/v1/scans/{source_id}/start", headers=auth_headers, json={
        "total_files_discovered": 2
    })
    rescan_id = rescan_start.json()["id"]

    rescan_batch = client.post(f"/api/v1/scans/{rescan_id}/batch", headers=auth_headers, json={
        "items": batch_items
    })
    assert rescan_batch.status_code == 200
    assert rescan_batch.json()["processed"] == 2
    assert rescan_batch.json()["new_media_created"] == 0 # No new media created!
    assert rescan_batch.json()["duplicate_instances_associated"] == 2 # Recognized as existing media

    # Verify total media in catalog remains exactly 2 (no duplicates added to DB)
    media_after = client.get("/api/v1/media", headers=auth_headers)
    assert len(media_after.json()) == 2
