def test_offline_source_preserves_catalog(client, auth_headers):
    # 1. Create source
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Hard Disk Viaggi",
        "source_type": "external_drive"
    }).json()

    # 2. Ingest 1 photo
    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "colosseo.jpg",
            "relative_path": "Roma/colosseo.jpg",
            "extension": "jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 1200000,
            "sha256": "4444555566667777888899990000aaaabbbbccccddddeeeeffff111122223333"
        }]
    })
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 1})

    # Verify media exists in library
    media_list = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_list) == 1
    media_id = media_list[0]["id"]

    # 3. Disconnect source (toggle to offline)
    toggle_res = client.post(f"/api/v1/sources/{src['id']}/toggle-status", headers=auth_headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["status"] == "offline"

    # 4. CRITICAL REQ: Media must STILL be present in catalog when source is offline!
    media_after = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_after) == 1

    # 5. Detail view should indicate that the copy is on an offline source
    detail = client.get(f"/api/v1/media/{media_id}", headers=auth_headers).json()
    assert detail["files"][0]["source_status"] == "offline"

    # 6. Reconnect source (toggle back to online)
    toggle_online = client.post(f"/api/v1/sources/{src['id']}/toggle-status", headers=auth_headers)
    assert toggle_online.json()["status"] == "online"

def test_reconciliation_missing_and_restored_files(client, auth_headers):
    # 1. Create source and ingest file A and file B
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Cartella Progetti",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "A.jpg",
                "relative_path": "A.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 1000,
                "sha256": "aaaa00001111222233334444555566667777888899990000aaaabbbbccccdddd"
            },
            {
                "filename": "B.jpg",
                "relative_path": "B.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 2000,
                "sha256": "bbbb00001111222233334444555566667777888899990000aaaabbbbccccdddd"
            }
        ]
    })

    # 2. Check fingerprints endpoint
    fps = client.get(f"/api/v1/sources/{src['id']}/fingerprints", headers=auth_headers).json()
    assert "A.jpg" in fps
    assert "B.jpg" in fps
    assert fps["A.jpg"]["availability_status"] == "available"

    # 3. Reconcile with only A.jpg present (B.jpg removed/deleted by user)
    rec1 = client.post(f"/api/v1/sources/{src['id']}/reconcile", headers=auth_headers, json={
        "seen_paths": ["A.jpg"]
    }).json()
    assert rec1["marked_missing"] == 1
    assert rec1["total_active"] == 1

    fps_after = client.get(f"/api/v1/sources/{src['id']}/fingerprints", headers=auth_headers).json()
    assert fps_after["B.jpg"]["availability_status"] == "missing"
    assert fps_after["A.jpg"]["availability_status"] == "available"

    # 4. Reconcile with both A.jpg and B.jpg restored
    rec2 = client.post(f"/api/v1/sources/{src['id']}/reconcile", headers=auth_headers, json={
        "seen_paths": ["A.jpg", "B.jpg"]
    }).json()
    assert rec2["restored_available"] == 1

    fps_restored = client.get(f"/api/v1/sources/{src['id']}/fingerprints", headers=auth_headers).json()
    assert fps_restored["B.jpg"]["availability_status"] == "available"

def test_modified_file_updates_hash_and_media(client, auth_headers):
    # Ingest file version 1
    src = client.post("/api/v1/sources", headers=auth_headers, json={"name": "SSD"}).json()
    scan1 = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
    client.post(f"/api/v1/scans/{scan1['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "design.png",
            "relative_path": "Work/design.png",
            "extension": "png",
            "mime_type": "image/png",
            "size_bytes": 5000,
            "sha256": "1111111111111111111111111111111111111111111111111111111111111111"
        }]
    })

    media_v1 = client.get("/api/v1/media", headers=auth_headers).json()
    assert media_v1[0]["canonical_sha256"] == "1111111111111111111111111111111111111111111111111111111111111111"

    # Re-scan same path with modified content and new hash
    scan2 = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
    client.post(f"/api/v1/scans/{scan2['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "design.png",
            "relative_path": "Work/design.png",
            "extension": "png",
            "mime_type": "image/png",
            "size_bytes": 7500,
            "sha256": "2222222222222222222222222222222222222222222222222222222222222222"
        }]
    })

    media_v2 = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(media_v2) == 1
    assert media_v2[0]["canonical_sha256"] == "2222222222222222222222222222222222222222222222222222222222222222"
