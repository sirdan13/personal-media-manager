import pytest
from datetime import datetime, timezone
from app.models.entities import User, Media, File, Source, Album, Tag

def test_phase_4_timeline_and_map_endpoints(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    user_id = user.id

    # Create dummy source
    source = Source(user_id=user_id, name="Test Phone", source_type="local_folder")
    db.add(source)
    db.flush()

    # Create media with captured_at and GPS
    m1 = Media(
        user_id=user_id,
        media_type="image",
        canonical_sha256="p4_sha1",
        captured_at=datetime(2025, 7, 15, 12, 0, 0, tzinfo=timezone.utc),
        latitude=41.9028,
        longitude=12.4964
    )
    m2 = Media(
        user_id=user_id,
        media_type="image",
        canonical_sha256="p4_sha2",
        captured_at=datetime(2025, 7, 20, 14, 0, 0, tzinfo=timezone.utc),
        latitude=45.4642,
        longitude=9.1900
    )
    m3 = Media(
        user_id=user_id,
        media_type="image",
        canonical_sha256="p4_sha3",
        captured_at=datetime(2025, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
        latitude=None,
        longitude=None
    )
    db.add_all([m1, m2, m3])
    db.flush()

    # Add file records
    f1 = File(
        media_id=m1.id, source_id=source.id, filename="rome.jpg",
        relative_path="rome.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=1000, sha256="p4_sha1"
    )
    f2 = File(
        media_id=m2.id, source_id=source.id, filename="milan.jpg",
        relative_path="milan.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=2000, sha256="p4_sha2"
    )
    f3 = File(
        media_id=m3.id, source_id=source.id, filename="nogps.jpg",
        relative_path="nogps.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=3000, sha256="p4_sha3"
    )
    db.add_all([f1, f2, f3])
    db.commit()
    m1_id, m2_id = m1.id, m2.id

    # Test Timeline
    resp = client.get("/api/v1/media/timeline", headers=auth_headers)
    assert resp.status_code == 200
    timeline = resp.json()
    assert len(timeline) >= 2
    keys = [b["month_key"] for b in timeline]
    assert "2025-08" in keys
    assert "2025-07" in keys
    jul_bucket = next(b for b in timeline if b["month_key"] == "2025-07")
    assert jul_bucket["count"] == 2
    assert jul_bucket["year"] == 2025
    assert jul_bucket["month"] == 7

    # Test Map
    resp = client.get("/api/v1/media/map", headers=auth_headers)
    assert resp.status_code == 200
    map_items = resp.json()
    assert len(map_items) == 2  # Only m1 and m2 have GPS
    ids = [item["id"] for item in map_items]
    assert m1_id in ids
    assert m2_id in ids
    rome_item = next(item for item in map_items if item["id"] == m1_id)
    assert pytest.approx(rome_item["latitude"], 0.001) == 41.9028
    assert pytest.approx(rome_item["longitude"], 0.001) == 12.4964


def test_phase_4_albums_and_tags_crud(client, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    user_id = user.id

    source = Source(user_id=user_id, name="Test Drive", source_type="local_folder")
    db.add(source)
    db.flush()

    m1 = Media(
        user_id=user_id,
        media_type="image",
        canonical_sha256="album_test_sha1",
        captured_at=datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    )
    m2 = Media(
        user_id=user_id,
        media_type="image",
        canonical_sha256="album_test_sha2",
        captured_at=datetime(2025, 6, 2, 10, 0, 0, tzinfo=timezone.utc)
    )
    db.add_all([m1, m2])
    db.flush()

    f1 = File(
        media_id=m1.id, source_id=source.id, filename="pic1.jpg",
        relative_path="pic1.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=1000, sha256="album_test_sha1"
    )
    f2 = File(
        media_id=m2.id, source_id=source.id, filename="pic2.jpg",
        relative_path="pic2.jpg", extension="jpg", mime_type="image/jpeg",
        size_bytes=2000, sha256="album_test_sha2"
    )
    db.add_all([f1, f2])
    db.commit()
    m1_id = m1.id
    m2_id = m2.id

    # 1. Create Album
    resp = client.post("/api/v1/albums", headers=auth_headers, json={"name": "Vacanze 2025", "description": "Estate"})
    assert resp.status_code == 201
    album_id = resp.json()["id"]
    assert resp.json()["name"] == "Vacanze 2025"

    # 2. Add Media to Album
    resp = client.post(f"/api/v1/albums/{album_id}/media", headers=auth_headers, json={"media_ids": [m1_id]})
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 1

    # Verify Album list shows media_count = 1
    resp = client.get("/api/v1/albums", headers=auth_headers)
    assert resp.status_code == 200
    albums = resp.json()
    target_album = next(a for a in albums if a["id"] == album_id)
    assert target_album["media_count"] == 1

    # 3. Filter Media by Album
    resp = client.get(f"/api/v1/media?album_id={album_id}", headers=auth_headers)
    assert resp.status_code == 200
    album_media = resp.json()
    assert len(album_media) == 1
    assert album_media[0]["id"] == m1_id

    # 4. Create Tag
    resp = client.post("/api/v1/tags", headers=auth_headers, json={"name": "Preferiti", "color": "#f43f5e"})
    assert resp.status_code == 201
    tag_id = resp.json()["id"]

    # 5. Add Media to Tag
    resp = client.post(f"/api/v1/tags/{tag_id}/media", headers=auth_headers, json={"media_ids": [m1_id, m2_id]})
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 2

    # Filter Media by Tag
    resp = client.get(f"/api/v1/media?tag_id={tag_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    # 6. Check MediaDetail includes albums and tags
    resp = client.get(f"/api/v1/media/{m1_id}", headers=auth_headers)
    assert resp.status_code == 200
    detail = resp.json()
    assert any(a["id"] == album_id for a in detail["albums"])
    assert any(t["id"] == tag_id for t in detail["tags"])

    # 7. Remove media from tag and album
    resp = client.delete(f"/api/v1/tags/{tag_id}/media/{m1_id}", headers=auth_headers)
    assert resp.status_code == 200
    resp = client.delete(f"/api/v1/albums/{album_id}/media/{m1_id}", headers=auth_headers)
    assert resp.status_code == 200

    # 8. Delete Tag and Album
    resp = client.delete(f"/api/v1/tags/{tag_id}", headers=auth_headers)
    assert resp.status_code == 204
    resp = client.delete(f"/api/v1/albums/{album_id}", headers=auth_headers)
    assert resp.status_code == 204
