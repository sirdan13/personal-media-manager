import hashlib


def _ingest_with_exif(client, auth_headers, source_id: str, filename: str, rel_path: str, ext: str, data: bytes, metadata_json: dict, width: int = 4032, height: int = 3024):
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
                    "extension": ext,
                    "mime_type": "image/jpeg",
                    "size_bytes": len(data),
                    "sha256": sha,
                    "width": width,
                    "height": height,
                    "metadata_json": metadata_json
                }
            ]
        }
    )
    assert res.status_code == 200
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 1, "failed_files": 0})


def test_filter_options_and_rich_columns(client, auth_headers, tmp_path):
    disk = tmp_path / "disk_exif"
    disk.mkdir()
    src_id = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "MacBook", "source_type": "local_folder", "root_path": str(disk), "role": "primary"
    }).json()["id"]

    _ingest_with_exif(
        client, auth_headers, src_id,
        "IMG_1001.HEIC", "2026_10/IMG_1001.HEIC", "heic", b"APPLE_IPHONE_SHOT",
        {
            "make": "Apple",
            "model": "iPhone 15 Pro Max",
            "lensModel": "iPhone 15 Pro Max back triple camera 6.765mm f/1.78",
            "iso": 100,
            "fNumber": 1.78,
            "exposureTime": 0.008,
            "latitude": 41.9028,
            "longitude": 12.4964
        }
    )
    _ingest_with_exif(
        client, auth_headers, src_id,
        "DSC_9001.NEF", "NIKON/DSC_9001.NEF", "nef", b"NIKON_RAW_SHOT",
        {
            "Make": "NIKON CORPORATION",
            "Model": "NIKON D3400",
            "LensModel": "18.0-140.0 mm f/3.5-5.6",
            "ISOSpeedRatings": 800,
            "FNumber": 5.0,
            "ExposureTime": 0.0167
        }
    )

    # 1. Filter options endpoint
    opts = client.get("/api/v1/media/filters/options", headers=auth_headers).json()
    assert "Apple" in opts["makes"]
    assert "NIKON CORPORATION" in opts["makes"]
    assert any(m["make"] == "Apple" and m["model"] == "iPhone 15 Pro Max" for m in opts["models"])
    assert any(m["make"] == "NIKON CORPORATION" and m["model"] == "NIKON D3400" for m in opts["models"])
    assert "heic" in opts["extensions"]
    assert "nef" in opts["extensions"]

    # 2. Filter by camera_make=Apple
    apple_items = client.get("/api/v1/media?camera_make=Apple", headers=auth_headers).json()
    assert len(apple_items) == 1
    item = apple_items[0]
    assert item["primary_filename"] == "IMG_1001.HEIC"
    assert item["primary_relative_path"] == "2026_10/IMG_1001.HEIC"
    assert item["source_names"] == ["MacBook"]
    assert item["camera_make"] == "Apple"
    assert item["camera_model"] == "iPhone 15 Pro Max"
    assert item["iso"] == 100
    assert item["f_number"] == 1.78

    # 3. Filter by camera_model & has_gps=false
    nikon_items = client.get("/api/v1/media?camera_model=NIKON%20D3400&has_gps=false", headers=auth_headers).json()
    assert len(nikon_items) == 1
    assert nikon_items[0]["primary_filename"] == "DSC_9001.NEF"
    assert nikon_items[0]["camera_make"] == "NIKON CORPORATION"
    assert nikon_items[0]["iso"] == 800
