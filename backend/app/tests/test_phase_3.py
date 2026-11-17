import io
import base64
from PIL import Image
from app.services.dhash_service import compute_dhash, hamming_distance
from app.models.entities import Media


def test_dhash_computation_and_hamming_distance():
    # Identical images should have distance 0
    img1 = Image.new("RGB", (100, 100), color=(120, 50, 200))
    img2 = Image.new("RGB", (100, 100), color=(120, 50, 200))

    h1 = compute_dhash(img1)
    h2 = compute_dhash(img2)
    assert len(h1) == 16
    assert len(h2) == 16
    assert h1 == h2
    assert hamming_distance(h1, h2) == 0

    # Slight modification
    img3 = Image.new("RGB", (100, 100), color=(120, 50, 200))
    pixels = img3.load()
    for x in range(10):
        for y in range(10):
            pixels[x, y] = (125, 55, 205)

    h3 = compute_dhash(img3)
    assert hamming_distance(h1, h3) <= 4


def test_duplicate_export_endpoints(client, auth_headers):
    # Register source and ingest duplicates
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Phase 3 Export Source",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()

    sha = "9999888877776666555544443333222211110000aaaabbbbccccddddeeeefff1"
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "original.jpg",
                "relative_path": "photos/original.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 50000,
                "sha256": sha
            },
            {
                "filename": "copy.jpg",
                "relative_path": "backup/copy.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 50000,
                "sha256": sha
            }
        ]
    })
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 2})

    # Test CSV export
    res_csv = client.get("/api/v1/duplicates/export?format=csv", headers=auth_headers)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    assert "group_sha256" in csv_text
    assert "recommended_action" in csv_text
    assert "KEEP" in csv_text
    assert "REDUNDANT_COPY" in csv_text

    # Test JSON export
    res_json = client.get("/api/v1/duplicates/export?format=json", headers=auth_headers)
    assert res_json.status_code == 200
    items = res_json.json()
    assert len(items) == 2
    actions = [i["recommended_action"] for i in items]
    assert "KEEP" in actions
    assert "REDUNDANT_COPY" in actions


def test_similar_photos_endpoint(client, auth_headers, db):
    # Ingest two images with close dhash but different SHA-256
    img_a = Image.new("RGB", (300, 300), color=(100, 150, 200))
    buf_a = io.BytesIO()
    img_a.save(buf_a, format="JPEG")

    img_b = Image.new("RGB", (300, 300), color=(102, 152, 202))
    buf_b = io.BytesIO()
    img_b.save(buf_b, format="JPEG")

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Phase 3 Similar Source",
        "source_type": "browser_folder"
    }).json()

    scan = client.post(f"/api/v1/scans/{src['id']}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()

    sha_a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
    sha_b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"

    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {
                "filename": "burst_1.jpg",
                "relative_path": "burst/burst_1.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": len(buf_a.getvalue()),
                "sha256": sha_a,
                "thumbnail_base64": f"data:image/jpeg;base64,{base64.b64encode(buf_a.getvalue()).decode('ascii')}"
            },
            {
                "filename": "burst_2.jpg",
                "relative_path": "burst/burst_2.jpg",
                "extension": "jpg",
                "mime_type": "image/jpeg",
                "size_bytes": len(buf_b.getvalue()),
                "sha256": sha_b,
                "thumbnail_base64": f"data:image/jpeg;base64,{base64.b64encode(buf_b.getvalue()).decode('ascii')}"
            }
        ]
    })
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 2})

    # Test /similar endpoint
    res_sim = client.get("/api/v1/duplicates/similar?max_distance=6", headers=auth_headers)
    assert res_sim.status_code == 200
    clusters = res_sim.json()
    assert len(clusters) >= 1
    assert clusters[0]["similar_count"] >= 2
    assert "matches" in clusters[0]
