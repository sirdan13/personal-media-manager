def test_full_pipeline_end_to_end(client, auth_headers):
    # 1. Create Source 1: "Main Hard Disk"
    src1 = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Main Hard Disk",
        "source_type": "external_drive",
        "root_path": "/Volumes/MainHDD/Media"
    }).json()

    # 2. Create Source 2: "Secondary SSD"
    src2 = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Secondary SSD",
        "source_type": "browser_folder",
        "root_path": "Backup_Photos"
    }).json()

    # 3. Start scan on Source 1
    scan1 = client.post(f"/api/v1/scans/{src1['id']}/start", headers=auth_headers, json={
        "total_files_discovered": 3
    }).json()

    # 4. Stream Batch 1 to Source 1: 3 files (2 photos, 1 video)
    batch1 = client.post(f"/api/v1/scans/{scan1['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "sunset.jpg",
                "relative_path": "2023/Vacanze/sunset.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 2500000,
                "sha256": "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
                "captured_at": "2023-08-15T19:30:00Z",
                "width": 4032,
                "height": 3024,
                "thumbnail_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            },
            {
                "filename": "beach.png",
                "relative_path": "2023/Vacanze/beach.png",
                "extension": "png",
                "mime_type": "image/png",
                "size_bytes": 4100000,
                "sha256": "222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111",
                "captured_at": "2023-08-16T11:00:00Z",
                "width": 1920,
                "height": 1080
            },
            {
                "filename": "clip.mp4",
                "relative_path": "2023/Video/clip.mp4",
                "extension": "mp4",
                "mime_type": "video/mp4",
                "size_bytes": 15000000,
                "sha256": "33334444555566667777888899990000aaaabbbbccccddddeeeeffff11112222",
                "duration_seconds": 12.5,
                "width": 1920,
                "height": 1080
            }
        ]
    })
    assert batch1.status_code == 200
    assert batch1.json()["processed"] == 3
    assert batch1.json()["new_media_created"] == 3

    # Finish scan 1
    client.post(f"/api/v1/scans/{scan1['id']}/complete", headers=auth_headers, json={
        "total_processed": 3,
        "failed_files": 0
    })

    # 5. Start scan on Source 2 and ingest duplicate of sunset.jpg under different name and folder
    scan2 = client.post(f"/api/v1/scans/{src2['id']}/start", headers=auth_headers, json={
        "total_files_discovered": 1
    }).json()

    batch2 = client.post(f"/api/v1/scans/{scan2['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "DSC_9942.JPG",
                "relative_path": "Unsorted_Backup/DSC_9942.JPG",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 2500000,
                "sha256": "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff" # Identical hash!
            }
        ]
    })
    assert batch2.status_code == 200
    assert batch2.json()["new_media_created"] == 0 # Reused existing logical media
    assert batch2.json()["duplicate_instances_associated"] == 1

    client.post(f"/api/v1/scans/{scan2['id']}/complete", headers=auth_headers, json={
        "total_processed": 1
    })

    # 6. Verify Dashboard Stats
    stats_res = client.get("/api/v1/media/dashboard/stats", headers=auth_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_photos"] == 2 # 2 unique logical photos
    assert stats["total_videos"] == 1 # 1 unique logical video
    assert stats["total_sources"] == 2
    assert stats["total_physical_copies"] == 4 # 3 on source 1 + 1 on source 2
    assert stats["duplicate_copies"] == 1 # 1 redundant duplicate copy

    # 7. Verify Duplicate Endpoint
    dup_res = client.get("/api/v1/duplicates", headers=auth_headers)
    assert dup_res.status_code == 200
    dups = dup_res.json()
    assert len(dups) == 1
    assert dups[0]["canonical_sha256"] == "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"
    assert dups[0]["copies_count"] == 2
    assert len(dups[0]["files"]) == 2

    # 8. Verify Media Detail with both physical sources
    detail_res = client.get(f"/api/v1/media/{dups[0]['media_id']}", headers=auth_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["copies_count"] == 2
    source_names = {f["source_name"] for f in detail["files"]}
    assert "Main Hard Disk" in source_names
    assert "Secondary SSD" in source_names

    # 9. Verify Thumbnail endpoint serves file correctly
    thumb_res = client.get(f"/api/v1/media/{dups[0]['media_id']}/thumbnail", headers=auth_headers)
    assert thumb_res.status_code == 200
    assert thumb_res.headers["content-type"] == "image/webp"
