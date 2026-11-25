import hashlib


def _ingest_file(client, auth_headers, source_id: str, filename: str, rel_path: str, data: bytes):
    sha = hashlib.sha256(data).hexdigest()
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
                    "size_bytes": len(data),
                    "sha256": sha,
                    "width": 1000,
                    "height": 800
                }
            ]
        }
    )
    assert res.status_code == 200
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 1, "failed_files": 0})


def test_compare_sources_and_backup_copy(client, auth_headers, tmp_path):
    disk_a = tmp_path / "ssd_a"
    disk_b = tmp_path / "hdd_b"
    (disk_a / "2026_08").mkdir(parents=True)
    disk_b.mkdir(parents=True)

    f1_bytes = b"PHOTO_IN_2026_08_UNIQUE_BYTES"
    f1 = disk_a / "2026_08" / "img1.jpg"
    f1.write_bytes(f1_bytes)

    src_a = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "SSD A", "source_type": "external_drive", "root_path": str(disk_a), "role": "primary"
    }).json()["id"]
    src_b = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "HDD B", "source_type": "external_drive", "root_path": str(disk_b), "role": "backup"
    }).json()["id"]

    _ingest_file(client, auth_headers, src_a, "img1.jpg", "2026_08/img1.jpg", f1_bytes)

    # Initially unprotected
    m_list = client.get("/api/v1/media", headers=auth_headers).json()
    assert len(m_list) == 1
    assert m_list[0]["protection_status"] == "unprotected"
    media_id = m_list[0]["id"]

    # Compare A vs B
    comp = client.get(f"/api/v1/sources/compare?primary_id={src_a}&secondary_id={src_b}", headers=auth_headers).json()
    assert comp["missing_count"] == 1
    assert comp["coverage_pct"] == 0.0
    assert comp["by_folder"][0]["folder"] == "2026_08"
    assert comp["by_folder"][0]["count"] == 1

    # Execute backup copy from A to B
    copy_res = client.post("/api/v1/sources/backup-copy", headers=auth_headers, json={
        "media_ids": [media_id],
        "target_source_id": src_b
    }).json()
    assert copy_res["copied_count"] == 1
    assert copy_res["copied_bytes"] == len(f1_bytes)
    assert (disk_b / "2026_08" / "img1.jpg").exists()
    assert (disk_b / "2026_08" / "img1.jpg").read_bytes() == f1_bytes

    # Now media is protected (2 disks) and compare shows 100% coverage
    m_after = client.get("/api/v1/media", headers=auth_headers).json()
    assert m_after[0]["protection_status"] == "protected"
    assert m_after[0]["distinct_sources_count"] == 2

    comp_after = client.get(f"/api/v1/sources/compare?primary_id={src_a}&secondary_id={src_b}", headers=auth_headers).json()
    assert comp_after["missing_count"] == 0
    assert comp_after["coverage_pct"] == 100.0
