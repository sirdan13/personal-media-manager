import hashlib
import os
from app.services.proactive_monitor_service import run_proactive_check_cycle, clear_proactive_events


def _ingest_dummy(client, auth_headers, source_id: str, filename: str, rel_path: str, data: bytes):
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
                    "width": 640,
                    "height": 480
                }
            ]
        }
    )
    assert res.status_code == 200
    client.post(f"/api/v1/scans/{scan['id']}/complete", headers=auth_headers, json={"total_processed": 1, "failed_files": 0})


def test_proactive_usb_mount_unmount_and_local_verify(client, auth_headers, db, tmp_path):
    clear_proactive_events()

    usb_dir = tmp_path / "usb_toshiba"
    local_dir = tmp_path / "local_pictures"
    usb_dir.mkdir()
    local_dir.mkdir()

    usb_photo = usb_dir / "holiday.jpg"
    local_photo = local_dir / "shot.jpg"
    usb_photo.write_bytes(b"USB_PHOTO_BYTES_123")
    local_photo.write_bytes(b"LOCAL_PHOTO_BYTES_456")

    usb_src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Toshiba", "source_type": "external_drive", "root_path": str(usb_dir), "role": "backup"
    }).json()["id"]
    local_src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "MacBook", "source_type": "local_folder", "root_path": str(local_dir), "role": "primary"
    }).json()["id"]

    _ingest_dummy(client, auth_headers, usb_src, "holiday.jpg", "holiday.jpg", b"USB_PHOTO_BYTES_123")
    _ingest_dummy(client, auth_headers, local_src, "shot.jpg", "shot.jpg", b"LOCAL_PHOTO_BYTES_456")

    # Mark USB source as offline (simulating drive unplugged), and delete usb_photo while offline
    client.patch(f"/api/v1/sources/{usb_src}", headers=auth_headers, json={"status": "offline"})
    os.remove(usb_photo)

    # 1. Proactive cycle detects USB drive came back online -> auto-verifies & finds missing file
    cycle1 = run_proactive_check_cycle(db, verify_local_folders=False)
    assert cycle1["mounted"] == 1

    ev_res1 = client.get("/api/v1/sources/events", headers=auth_headers).json()
    assert ev_res1["monitor_active"] is True
    assert len(ev_res1["events"]) == 1
    ev1 = ev_res1["events"][0]
    assert ev1["event_type"] == "disk_connected"
    assert ev1["source_name"] == "Toshiba"
    assert ev1["newly_missing"] == 1

    # 2. Delete local_photo externally and run cycle with verify_local_folders=True
    os.remove(local_photo)
    cycle2 = run_proactive_check_cycle(db, verify_local_folders=True)
    assert cycle2["verified_local"] == 1

    ev_res2 = client.get(f"/api/v1/sources/events?since_id={ev1['id']}", headers=auth_headers).json()
    assert len(ev_res2["events"]) == 1
    ev2 = ev_res2["events"][0]
    assert ev2["event_type"] == "external_changes_detected"
    assert ev2["source_name"] == "MacBook"
    assert ev2["newly_missing"] == 1

    # 3. Simulate unplugging USB drive (remove directory) -> detects offline
    usb_dir.rmdir()
    cycle3 = run_proactive_check_cycle(db, verify_local_folders=False)
    assert cycle3["unmounted"] == 1

    ev_res3 = client.get(f"/api/v1/sources/events?since_id={ev2['id']}", headers=auth_headers).json()
    assert len(ev_res3["events"]) == 1
    assert ev_res3["events"][0]["event_type"] == "disk_disconnected"
