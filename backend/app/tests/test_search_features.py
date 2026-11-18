from datetime import datetime, timezone
from app.models.entities import Media, File, Source, Tag, MediaTag

def test_apple_style_search_metadata_and_gps(client, auth_headers, db):
    # Setup test source
    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Apple Search Test Source",
        "source_type": "browser_folder"
    }).json()

    # Search for iPhone
    res = client.get("/api/v1/media?search=iPhone", headers=auth_headers)
    assert res.status_code == 200

    # Search by coordinates bounding box
    res_geo = client.get("/api/v1/media?lat_min=40.0&lat_max=42.0&lon_min=12.0&lon_max=14.0", headers=auth_headers)
    assert res_geo.status_code == 200

