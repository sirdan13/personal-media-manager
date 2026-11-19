import pytest

HASH_1 = "1111111111111111111111111111111111111111111111111111111111111111"
HASH_2 = "2222222222222222222222222222222222222222222222222222222222222222"
HASH_3 = "3333333333333333333333333333333333333333333333333333333333333333"

def setup_phase_7_dataset(client, auth_headers):
    """
    Creates:
    - Source A: role="primary"
    - Source B: role="backup"

    Media 1: 1 file on Source A (is_favorite = True) -> Unprotected
    Media 2: 1 file on Source A + 1 file on Source B (same sha256) -> Protected Multi-Disk
    Media 3: 2 files on Source A (same sha256, paths dir1 and dir2) -> Intra-Source Duplicate
    """
    # 1. Register sources
    s_a = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "SSD Lavoro Primario",
        "source_type": "external_drive",
        "role": "primary"
    }).json()
    source_a_id = s_a["id"]

    s_b = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "HDD Backup Esterno",
        "source_type": "external_drive",
        "role": "backup"
    }).json()
    source_b_id = s_b["id"]

    # 2. Ingest files on Source A
    scan_a = client.post(f"/api/v1/scans/{source_a_id}/start", headers=auth_headers, json={"total_files_discovered": 4}).json()
    client.post(f"/api/v1/scans/{scan_a['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "m1.jpg",
                "relative_path": "Vacanze/m1.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 2000000,
                "sha256": HASH_1
            },
            {
                "filename": "m2.jpg",
                "relative_path": "Lavoro/m2.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 4000000,
                "sha256": HASH_2
            },
            {
                "filename": "m3.jpg",
                "relative_path": "dir1/m3.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5000000,
                "sha256": HASH_3
            },
            {
                "filename": "m3_copy.jpg",
                "relative_path": "dir2/m3_copy.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5000000,
                "sha256": HASH_3
            }
        ]
    })

    # 3. Ingest replica of Media 2 on Source B
    scan_b = client.post(f"/api/v1/scans/{source_b_id}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
    client.post(f"/api/v1/scans/{scan_b['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "m2_backup.jpg",
                "relative_path": "Backup_Lavoro/m2_backup.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 4000000,
                "sha256": HASH_2
            }
        ]
    })

    # 4. Mark Media 1 as favorite
    all_media = client.get("/api/v1/media", headers=auth_headers).json()
    m1 = next(m for m in all_media if m["canonical_sha256"] == HASH_1)
    client.post(f"/api/v1/media/{m1['id']}/favorite", headers=auth_headers)

    return {
        "source_a_id": source_a_id,
        "source_b_id": source_b_id,
        "media_1_id": m1["id"]
    }


def test_protection_status_classification_and_filtering(client, auth_headers):
    setup_phase_7_dataset(client, auth_headers)

    # 1. List all media and verify classification
    res = client.get("/api/v1/media", headers=auth_headers)
    assert res.status_code == 200
    media_list = res.json()
    assert len(media_list) == 3

    by_hash = {m["canonical_sha256"]: m for m in media_list}

    # Media 1: 1 file on 1 source -> unprotected
    m1 = by_hash[HASH_1]
    assert m1["distinct_sources_count"] == 1
    assert m1["copies_count"] == 1
    assert m1["protection_status"] == "unprotected"
    assert m1["is_favorite"] is True

    # Media 2: 2 files on 2 sources -> protected
    m2 = by_hash[HASH_2]
    assert m2["distinct_sources_count"] == 2
    assert m2["copies_count"] == 2
    assert m2["protection_status"] == "protected"

    # Media 3: 2 files on 1 source -> intra_source_duplicate
    m3 = by_hash[HASH_3]
    assert m3["distinct_sources_count"] == 1
    assert m3["copies_count"] == 2
    assert m3["protection_status"] == "intra_source_duplicate"

    # 2. Test filtering by protection_status
    res_unprotected = client.get("/api/v1/media?protection_status=unprotected", headers=auth_headers)
    assert res_unprotected.status_code == 200
    items_unprotected = res_unprotected.json()
    assert len(items_unprotected) == 1
    assert items_unprotected[0]["canonical_sha256"] == HASH_1

    res_protected = client.get("/api/v1/media?protection_status=protected", headers=auth_headers)
    assert res_protected.status_code == 200
    items_protected = res_protected.json()
    assert len(items_protected) == 1
    assert items_protected[0]["canonical_sha256"] == HASH_2

    res_intra = client.get("/api/v1/media?protection_status=intra_source_duplicate", headers=auth_headers)
    assert res_intra.status_code == 200
    items_intra = res_intra.json()
    assert len(items_intra) == 1
    assert items_intra[0]["canonical_sha256"] == HASH_3


def test_duplicates_modes_and_smart_summary_metrics(client, auth_headers):
    setup_phase_7_dataset(client, auth_headers)

    # 1. Summary metrics
    summary_res = client.get("/api/v1/duplicates/summary", headers=auth_headers)
    assert summary_res.status_code == 200
    summary = summary_res.json()

    assert summary["total_groups"] == 2
    assert summary["intra_source_groups"] == 1
    assert summary["healthy_multi_source_groups"] == 1
    assert summary["unprotected_media_count"] == 1
    assert summary["unprotected_favorites_count"] == 1
    assert summary["protected_media_count"] == 1
    assert summary["intra_source_wasted_bytes"] == 5000000  # Size of 1 redundant copy of Media 3
    assert summary["multi_source_backup_bytes"] == 4000000  # Size of 1 backup copy of Media 2

    # 2. Filter mode=intra_source
    res_intra = client.get("/api/v1/duplicates?mode=intra_source", headers=auth_headers)
    assert res_intra.status_code == 200
    intra_groups = res_intra.json()
    assert len(intra_groups) == 1
    assert intra_groups[0]["canonical_sha256"] == HASH_3
    assert intra_groups[0]["redundancy_type"] == "intra_source_duplicate"

    # 3. Filter mode=multi_source
    res_multi = client.get("/api/v1/duplicates?mode=multi_source", headers=auth_headers)
    assert res_multi.status_code == 200
    multi_groups = res_multi.json()
    assert len(multi_groups) == 1
    assert multi_groups[0]["canonical_sha256"] == HASH_2
    assert multi_groups[0]["redundancy_type"] == "healthy_multi_source"

    # 4. Export JSON with smart redundancy_role
    export_res = client.get("/api/v1/duplicates/export?format=json", headers=auth_headers)
    assert export_res.status_code == 200
    export_data = export_res.json()

    # Find rows for Media 2 and Media 3
    m2_rows = [r for r in export_data if r["group_sha256"] == HASH_2]
    assert len(m2_rows) == 2
    assert m2_rows[0]["redundancy_role"] == "PRIMARY_KEEP"
    assert m2_rows[1]["redundancy_role"] == "BACKUP_REPLICA_KEEP"

    m3_rows = [r for r in export_data if r["group_sha256"] == HASH_3]
    assert len(m3_rows) == 2
    assert m3_rows[0]["redundancy_role"] == "PRIMARY_KEEP"
    assert m3_rows[1]["redundancy_role"] == "REDUNDANT_SAME_DISK"


def test_backup_gap_analysis_and_rsync_export(client, auth_headers):
    ctx = setup_phase_7_dataset(client, auth_headers)
    src_a = ctx["source_a_id"]
    src_b = ctx["source_b_id"]

    # 1. Total gap between Source A (Primary) and Source B (Backup)
    gap_res = client.get(f"/api/v1/duplicates/backup-gap?primary_source_id={src_a}&backup_source_id={src_b}", headers=auth_headers)
    assert gap_res.status_code == 200
    gap = gap_res.json()

    assert gap["total_primary_media"] == 3
    assert gap["backed_up_media"] == 1  # Only Media 2
    assert gap["missing_on_backup_count"] == 2  # Media 1 and Media 3
    assert gap["missing_on_backup_bytes"] == 2000000 + 5000000
    assert gap["coverage_pct"] == round(1 / 3 * 100, 1)  # 33.3%

    missing_paths = {item["relative_path"] for item in gap["missing_items"]}
    assert "Vacanze/m1.jpg" in missing_paths
    assert ("dir1/m3.jpg" in missing_paths or "dir2/m3_copy.jpg" in missing_paths)

    # 2. Gap filtered for only_favorites=true
    fav_gap_res = client.get(
        f"/api/v1/duplicates/backup-gap?primary_source_id={src_a}&backup_source_id={src_b}&only_favorites=true",
        headers=auth_headers
    )
    assert fav_gap_res.status_code == 200
    fav_gap = fav_gap_res.json()

    assert fav_gap["total_primary_media"] == 1  # Only Media 1 is favorite
    assert fav_gap["backed_up_media"] == 0
    assert fav_gap["missing_on_backup_count"] == 1
    assert fav_gap["missing_items"][0]["relative_path"] == "Vacanze/m1.jpg"

    # 3. Export format: rsync_txt
    rsync_res = client.get(
        f"/api/v1/duplicates/backup-gap?primary_source_id={src_a}&backup_source_id={src_b}&export_format=rsync_txt",
        headers=auth_headers
    )
    assert rsync_res.status_code == 200
    assert "text/plain" in rsync_res.headers["content-type"]
    rsync_lines = [line.strip() for line in rsync_res.text.strip().split("\n") if line.strip()]
    assert len(rsync_lines) == 2
    assert "Vacanze/m1.jpg" in rsync_lines

    # 4. Export format: csv
    csv_res = client.get(
        f"/api/v1/duplicates/backup-gap?primary_source_id={src_a}&backup_source_id={src_b}&export_format=csv",
        headers=auth_headers
    )
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "media_id" in csv_res.text
    assert "relative_path" in csv_res.text
    assert "Vacanze/m1.jpg" in csv_res.text
