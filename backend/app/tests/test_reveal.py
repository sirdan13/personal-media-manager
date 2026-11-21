import os
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.models.entities import Media, File, Source, User


def test_reveal_file_success(client: TestClient, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    assert user is not None

    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        test_source = Source(
            user_id=user.id,
            name="Test Local Disk",
            root_path=tmpdir,
            status="online"
        )
        db.add(test_source)
        db.flush()

        test_media = Media(
            user_id=user.id,
            canonical_sha256="testsha256reveal1",
            media_type="image"
        )
        db.add(test_media)
        db.flush()

        # Create physical test file
        rel_path = "sub/photo.jpg"
        abs_path = os.path.join(tmpdir, rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as f:
            f.write(b"dummy image data")

        test_file = File(
            media_id=test_media.id,
            source_id=test_source.id,
            filename="photo.jpg",
            relative_path=rel_path,
            extension="jpg",
            mime_type="image/jpeg",
            size_bytes=16,
            sha256="testsha256reveal1"
        )
        db.add(test_file)
        db.commit()

        with patch("app.api.v1.media.reveal_path_in_file_manager") as mock_reveal:
            res = client.post(f"/api/v1/media/files/{test_file.id}/reveal", headers=auth_headers)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["file_id"] == test_file.id
            assert data["filename"] == "photo.jpg"
            mock_reveal.assert_called_once()


def test_reveal_file_disk_offline(client: TestClient, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    assert user is not None

    test_source = Source(
        user_id=user.id,
        name="Offline Disk",
        root_path="/Volumes/NonExistentDisk_12345",
        status="offline"
    )
    db.add(test_source)
    db.flush()

    test_media = Media(
        user_id=user.id,
        canonical_sha256="testsha256offline",
        media_type="image"
    )
    db.add(test_media)
    db.flush()

    test_file = File(
        media_id=test_media.id,
        source_id=test_source.id,
        filename="offline_photo.jpg",
        relative_path="offline_photo.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        size_bytes=100,
        sha256="testsha256offline"
    )
    db.add(test_file)
    db.commit()

    res = client.post(f"/api/v1/media/files/{test_file.id}/reveal", headers=auth_headers)
    assert res.status_code == 400
    assert "non è raggiungibile o è scollegato" in res.json()["detail"]


def test_reveal_media_endpoint(client: TestClient, auth_headers, db):
    user = db.query(User).filter(User.email == "test@example.com").first()
    assert user is not None

    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        test_source = Source(
            user_id=user.id,
            name="Test Online Disk",
            root_path=tmpdir,
            status="online"
        )
        db.add(test_source)
        db.flush()

        test_media = Media(
            user_id=user.id,
            canonical_sha256="testsha256mediareveal",
            media_type="image"
        )
        db.add(test_media)
        db.flush()

        rel_path = "media_photo.jpg"
        abs_path = os.path.join(tmpdir, rel_path)
        with open(abs_path, "wb") as f:
            f.write(b"dummy")

        test_file = File(
            media_id=test_media.id,
            source_id=test_source.id,
            filename="media_photo.jpg",
            relative_path=rel_path,
            extension="jpg",
            mime_type="image/jpeg",
            size_bytes=5,
            sha256="testsha256mediareveal"
        )
        db.add(test_file)
        db.commit()

        with patch("app.api.v1.media.reveal_path_in_file_manager") as mock_reveal:
            res = client.post(f"/api/v1/media/{test_media.id}/reveal", headers=auth_headers)
            assert res.status_code == 200
            assert res.json()["status"] == "success"
            mock_reveal.assert_called_once()
