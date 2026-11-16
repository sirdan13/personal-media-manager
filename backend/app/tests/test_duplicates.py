def test_exact_duplicate_detection_across_sources(client, auth_headers):
    # 1. Create two separate sources (e.g. Hard Disk 1 and Hard Disk 2)
    s1_res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Hard Disk 1 - Vacanze",
        "source_type": "external_drive"
    })
    source1_id = s1_res.json()["id"]

    s2_res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Hard Disk 2 - Backup 2022",
        "source_type": "external_drive"
    })
    source2_id = s2_res.json()["id"]

    # Same binary hash for both copies, but different filename and different path
    identical_hash = "9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff"

    # Scan copy 1 on Source 1
    scan1 = client.post(f"/api/v1/scans/{source1_id}/start", headers=auth_headers, json={"total_files_discovered": 1})
    client.post(f"/api/v1/scans/{scan1.json()['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "IMG_001.JPG",
            "relative_path": "Foto/Vacanze/IMG_001.JPG",
            "extension": "jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 3500000,
            "sha256": identical_hash
        }]
    })

    # Scan copy 2 on Source 2
    scan2 = client.post(f"/api/v1/scans/{source2_id}/start", headers=auth_headers, json={"total_files_discovered": 1})
    client.post(f"/api/v1/scans/{scan2.json()['id']}/batch", headers=auth_headers, json={
        "items": [{
            "filename": "DSC_9876.JPG",
            "relative_path": "Backup/2022/DSC_9876.JPG",
            "extension": "jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 3500000,
            "sha256": identical_hash
        }]
    })

    # 2. Check Media library: Should only have ONE logical media item
    media_res = client.get("/api/v1/media", headers=auth_headers)
    assert media_res.status_code == 200
    media_list = media_res.json()
    assert len(media_list) == 1
    assert media_list[0]["canonical_sha256"] == identical_hash
    assert media_list[0]["copies_count"] == 2 # Two physical copies!

    # 3. Check Media detail: Should list both files with their source names and relative paths
    detail_res = client.get(f"/api/v1/media/{media_list[0]['id']}", headers=auth_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert len(detail["files"]) == 2
    paths = {f["relative_path"] for f in detail["files"]}
    assert "Foto/Vacanze/IMG_001.JPG" in paths
    assert "Backup/2022/DSC_9876.JPG" in paths

    # 4. Check Duplicates endpoint: Should report this duplicate group
    dup_res = client.get("/api/v1/duplicates", headers=auth_headers)
    assert dup_res.status_code == 200
    duplicates = dup_res.json()
    assert len(duplicates) == 1
    assert duplicates[0]["canonical_sha256"] == identical_hash
    assert duplicates[0]["copies_count"] == 2
