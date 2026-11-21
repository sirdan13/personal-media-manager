import os
import json
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageFilter
import pytest

from app.core.config import settings
from app.services.curation_heuristics import score_path_quality
from app.services.ai_provider import (
    set_provider_override,
    FakeProvider,
    AIProviderError
)
from app.models.entities import Media, File, Thumbnail, Source

@pytest.fixture(autouse=True)
def reset_provider_override():
    set_provider_override(None)
    yield
    set_provider_override(None)

def create_test_webp_thumbnail(media_id: str, is_blurry: bool = False) -> str:
    img = Image.new("RGB", (320, 240), color=(120, 150, 180))
    # Draw some high contrast pattern
    for x in range(0, 320, 20):
        for y in range(0, 240, 20):
            if (x + y) % 40 == 0:
                img.putpixel((x, y), (255, 255, 255))
                img.putpixel((x+1, y), (0, 0, 0))

    if is_blurry:
        img = img.filter(ImageFilter.GaussianBlur(8))

    thumb_filename = f"thumb_{media_id}.webp"
    thumb_path = os.path.join(settings.THUMBNAILS_DIR, thumb_filename)
    img.save(thumb_path, "WEBP", quality=80)
    return thumb_filename


def test_path_quality_scoring():
    score_a, reasons_a = score_path_quality("2024/Estate_Puglia/IMG_1.jpg")
    score_b, reasons_b = score_path_quality("Downloads/IMG_1 (1).jpg")
    assert score_a > score_b
    assert any("2024" in r or "anno" in r for r in reasons_a)
    assert any("(n)" in r for r in reasons_b)

    score_c, reasons_c = score_path_quality("WhatsApp Images/x.jpg")
    score_d, reasons_d = score_path_quality("Famiglia/Natale-2023/x.jpg")
    assert score_c < score_d
    assert len(reasons_c) > 0
    assert len(reasons_d) > 0


def test_suggest_keep_keeps_one_per_disk_and_never_all(client, auth_headers, tmp_path):
    disk_a = tmp_path / "disk_a"
    disk_b = tmp_path / "disk_b"
    disk_a.mkdir(parents=True)
    disk_b.mkdir(parents=True)

    (disk_a / "DCIM" / "100APPLE").mkdir(parents=True)
    (disk_a / "2024" / "Viaggio_Roma").mkdir(parents=True)
    (disk_b / "Backup").mkdir(parents=True)

    content = b"EXACT_SAME_DUPLICATE_BYTES_9999"
    (disk_a / "DCIM" / "100APPLE" / "a.jpg").write_bytes(content)
    (disk_a / "2024" / "Viaggio_Roma" / "a.jpg").write_bytes(content)
    (disk_b / "Backup" / "a.jpg").write_bytes(content)

    src_a = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk A", "source_type": "external_drive", "root_path": str(disk_a)
    }).json()["id"]

    src_b = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk B", "source_type": "external_drive", "root_path": str(disk_b)
    }).json()["id"]

    sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    # Ingest disk A
    scan_a = client.post(f"/api/v1/scans/{src_a}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan_a['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "a.jpg", "relative_path": "DCIM/100APPLE/a.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha},
            {"filename": "a.jpg", "relative_path": "2024/Viaggio_Roma/a.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha}
        ]
    })

    # Ingest disk B
    scan_b = client.post(f"/api/v1/scans/{src_b}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
    client.post(f"/api/v1/scans/{scan_b['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "a.jpg", "relative_path": "Backup/a.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha}
        ]
    })

    media = client.get("/api/v1/media", headers=auth_headers).json()[0]
    media_id = media["id"]

    # Call endpoint
    res = client.post("/api/v1/ai/duplicates/suggest-keep", headers=auth_headers, json={
        "media_ids": [media_id]
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    item = data[0]

    # One copy kept per disk: Disk A should keep 2024/Viaggio_Roma, Disk B should keep Backup
    detail = client.get(f"/api/v1/media/{media_id}", headers=auth_headers).json()
    files_by_path = {f["relative_path"]: f["id"] for f in detail["files"]}

    assert files_by_path["2024/Viaggio_Roma/a.jpg"] in item["keep_file_ids"]
    assert files_by_path["Backup/a.jpg"] in item["keep_file_ids"]
    assert files_by_path["DCIM/100APPLE/a.jpg"] in item["trash_file_ids"]
    assert len(item["keep_file_ids"]) == 2
    assert len(item["trash_file_ids"]) == 1


def test_ai_settings_never_expose_api_key(client, auth_headers):
    put_res = client.put("/api/v1/ai/settings", headers=auth_headers, json={
        "provider": "gemini",
        "api_key": "AIzaTEST12345678",
        "daily_request_cap": 250
    })
    assert put_res.status_code == 200

    get_res = client.get("/api/v1/ai/settings", headers=auth_headers)
    assert get_res.status_code == 200
    data = get_res.json()

    assert data["has_api_key"] is True
    assert data["api_key_hint"] == "...5678"
    assert data["daily_request_cap"] == 250
    assert "AIzaTEST12345678" not in get_res.text

def test_ai_test_endpoint_with_unsaved_payload(client, auth_headers, monkeypatch):
    from app.services.ai_provider import GeminiProvider, AIResult
    def fake_generate(self, system_prompt, user_prompt, schema, images=None, model_override=None):
        return AIResult(data={"ok": True}, provider="gemini", model=self.model)

    monkeypatch.setattr(GeminiProvider, "generate_json", fake_generate)

    # Test with payload containing key
    res = client.post("/api/v1/ai/test", headers=auth_headers, json={
        "provider": "gemini",
        "api_key": "AIzaLiveTestKey"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["provider"] == "gemini"

    # Test without key when no key configured
    res_err = client.post("/api/v1/ai/test", headers=auth_headers, json={
        "provider": "gemini",
        "api_key": ""
    })
    assert res_err.status_code == 200

def test_gemini_candidate_resolution_and_fallback():
    from app.services.ai_provider import GeminiProvider
    p = GeminiProvider(api_key="fake-test-key", model="auto")
    candidates = p._resolve_candidate_models("auto")
    assert len(candidates) > 0
    assert "gemini-1.5-flash" in candidates

    candidates_specific = p._resolve_candidate_models("gemini-special-custom")
    assert candidates_specific[0] == "gemini-special-custom"
    assert "gemini-1.5-flash" in candidates_specific




def test_ai_quota_and_cache(client, auth_headers, tmp_path):
    # Set cap = 1
    client.put("/api/v1/ai/settings", headers=auth_headers, json={
        "provider": "gemini",
        "api_key": "fake-key",
        "daily_request_cap": 1
    })

    # Setup disk with duplicated files
    disk = tmp_path / "disk_qc"
    disk.mkdir()
    (disk / "FolderA").mkdir()
    (disk / "FolderB").mkdir()

    content = b"TEST_BYTES_QC"
    (disk / "FolderA" / "p.jpg").write_bytes(content)
    (disk / "FolderB" / "p.jpg").write_bytes(content)

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk QC", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "p.jpg", "relative_path": "FolderA/p.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": "1111111111111111111111111111111111111111111111111111111111111111"},
            {"filename": "p.jpg", "relative_path": "FolderB/p.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": "1111111111111111111111111111111111111111111111111111111111111111"}
        ]
    })

    # Compute pair
    analysis_init = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": False}).json()
    pair = analysis_init["pairs"][0]
    pid = pair["pair_id"]

    fake_p = FakeProvider(responses=[
        {
            "rules": [
                {
                    "pair_id": pid,
                    "keep_folder": "FolderA",
                    "trash_folder": "FolderB",
                    "rationale": "FolderA is better",
                    "confidence": 0.8
                }
            ]
        }
    ])
    set_provider_override(fake_p)

    # First call: OK (usage = 1)
    res1 = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": True}).json()
    assert res1["engine_used"] == "fake"
    assert fake_p.call_count == 1
    settings_state = client.get("/api/v1/ai/settings", headers=auth_headers).json()
    assert settings_state["usage_today"]["requests"] == 1

    # Second call (identical input): served from cache, usage stays 1, call_count stays 1
    res2 = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": True}).json()
    assert res2["engine_used"] == "fake"
    assert fake_p.call_count == 1
    settings_state = client.get("/api/v1/ai/settings", headers=auth_headers).json()
    assert settings_state["usage_today"]["requests"] == 1

    # Third call: add a new folder to change input and trigger quota check
    (disk / "FolderC").mkdir()
    (disk / "FolderC" / "p2.jpg").write_bytes(b"ANOTHER_MEDIA")
    (disk / "FolderA" / "p2.jpg").write_bytes(b"ANOTHER_MEDIA")
    scan2 = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan2['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "p2.jpg", "relative_path": "FolderA/p2.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": 13, "sha256": "2222222222222222222222222222222222222222222222222222222222222222"},
            {"filename": "p2.jpg", "relative_path": "FolderC/p2.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": 13, "sha256": "2222222222222222222222222222222222222222222222222222222222222222"}
        ]
    })

    res3 = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": True}).json()
    # Daily quota cap exceeded -> falls back to heuristic with clear error message
    assert res3["engine_used"] == "heuristic"
    assert res3["ai_error"] is not None
    assert "giornaliero" in res3["ai_error"].lower()


def test_folder_advisor_rules_validation_and_expansion(client, auth_headers, tmp_path):
    disk = tmp_path / "disk_advisor"
    disk.mkdir()
    (disk / "DCIM" / "100APPLE").mkdir(parents=True)
    (disk / "2024" / "Estate").mkdir(parents=True)

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk Adv", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    # Ingest 3 duplicate media + 1 unique in DCIM
    items = []
    for i in range(1, 4):
        sha = f"dup_{i:060d}"
        content = f"CONTENT_{i}".encode("utf-8")
        (disk / "DCIM" / "100APPLE" / f"photo_{i}.jpg").write_bytes(content)
        (disk / "2024" / "Estate" / f"photo_{i}.jpg").write_bytes(content)
        items.append({"filename": f"photo_{i}.jpg", "relative_path": f"DCIM/100APPLE/photo_{i}.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha})
        items.append({"filename": f"photo_{i}.jpg", "relative_path": f"2024/Estate/photo_{i}.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha})

    # Unique media only in DCIM
    unique_content = b"UNIQUE_DCIM_ONLY"
    (disk / "DCIM" / "100APPLE" / "unique.jpg").write_bytes(unique_content)
    items.append({"filename": "unique.jpg", "relative_path": "DCIM/100APPLE/unique.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(unique_content), "sha256": "unique_99999999999999999999999999999999999999999999999999999999999"})

    scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": len(items)}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={"items": items})

    # Run analyze without AI first to get valid pair_id
    base_res = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": False}).json()
    assert len(base_res["pairs"]) == 1
    pair = base_res["pairs"][0]
    pid = pair["pair_id"]

    # Provide 1 valid rule and 1 rule with invented pair_id
    fake_p = FakeProvider(responses=[
        {
            "rules": [
                {
                    "pair_id": pid,
                    "keep_folder": "2024/Estate",
                    "trash_folder": "DCIM/100APPLE",
                    "rationale": "Mantieni cartella ordinata per anno",
                    "confidence": 0.85
                },
                {
                    "pair_id": "invented_pair_xyz",
                    "keep_folder": "GhostFolderA",
                    "trash_folder": "GhostFolderB",
                    "rationale": "Invented",
                    "confidence": 0.9
                }
            ]
        }
    ])
    set_provider_override(fake_p)

    ai_analysis = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": True}).json()
    # Invented rule discarded
    assert len(ai_analysis["rules"]) == 1
    rule = ai_analysis["rules"][0]
    assert rule["pair_id"] == pid
    assert rule["keep_folder"] == "2024/Estate"
    assert rule["trash_folder"] == "DCIM/100APPLE"

    # Preview expansion
    preview_res = client.post("/api/v1/ai/folder-advisor/preview", headers=auth_headers, json={
        "source_id": src,
        "keep_folder": "2024/Estate",
        "trash_folder": "DCIM/100APPLE"
    })
    assert preview_res.status_code == 200
    preview = preview_res.json()
    assert preview["count"] == 3
    for s in preview["sample"]:
        assert s["relative_path"].startswith("DCIM/100APPLE/")
        assert "unique.jpg" not in s["filename"]

    # Apply trash
    trash_res = client.post("/api/v1/duplicates/trash", headers=auth_headers, json={
        "file_ids": preview["file_ids"],
        "keep_file_ids": preview["keep_file_ids"]
    })
    assert trash_res.status_code == 200
    assert trash_res.json()["trashed_count"] == 3

    # Check disk state
    trash_dir = disk / ".pmm_trash" / "files" / "DCIM" / "100APPLE"
    assert (trash_dir / "photo_1.jpg").exists()
    assert (disk / "2024" / "Estate" / "photo_1.jpg").exists()
    assert (disk / "DCIM" / "100APPLE" / "unique.jpg").exists()


def test_folder_advisor_falls_back_to_heuristic_on_provider_error(client, auth_headers, tmp_path):
    disk = tmp_path / "disk_err"
    disk.mkdir()
    (disk / "A").mkdir()
    (disk / "B").mkdir()

    content = b"DUPLICATE_ERROR_TEST"
    (disk / "A" / "x.jpg").write_bytes(content)
    (disk / "B" / "x.jpg").write_bytes(content)

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk Err", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "x.jpg", "relative_path": "A/x.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": "4444444444444444444444444444444444444444444444444444444444444444"},
            {"filename": "x.jpg", "relative_path": "B/x.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": "4444444444444444444444444444444444444444444444444444444444444444"}
        ]
    })

    fake_p = FakeProvider(error=AIProviderError("Simulated LLM Timeout"))
    set_provider_override(fake_p)

    res = client.post("/api/v1/ai/folder-advisor/analyze", headers=auth_headers, json={"use_ai": True})
    assert res.status_code == 200
    data = res.json()
    assert data["engine_used"] == "heuristic"
    assert data["ai_error"] is not None
    assert "Simulated LLM Timeout" in data["ai_error"]
    assert len(data["rules"]) > 0


def test_best_shot_validation_and_favorite_protection(client, auth_headers, tmp_path, db):
    disk = tmp_path / "disk_best_shot"
    disk.mkdir()
    (disk / "photos").mkdir()

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk Best", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    # Create 3 similar media with real thumbnails
    media_ids = []
    for i in range(1, 4):
        content = f"MEDIA_{i}".encode("utf-8")
        (disk / "photos" / f"shot_{i}.jpg").write_bytes(content)
        sha = f"shot_{i:060d}"
        scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": 1}).json()
        client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
            "items": [
                {"filename": f"shot_{i}.jpg", "relative_path": f"photos/shot_{i}.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content), "sha256": sha}
            ]
        })
        m = client.get("/api/v1/media", headers=auth_headers).json()[0]
        # Ingested newest first or find by sha
        found_m = [x for x in client.get("/api/v1/media", headers=auth_headers).json() if x["canonical_sha256"] == sha][0]
        mid = found_m["id"]
        media_ids.append(mid)

        # Create thumbnail on disk and DB (shot 1 is sharp, shot 2 and 3 are blurry)
        is_blurry = (i >= 2)
        thumb_name = create_test_webp_thumbnail(mid, is_blurry=is_blurry)
        t_row = Thumbnail(
            media_id=mid,
            storage_path=thumb_name,
            format="webp",
            width=320,
            height=240,
            size_bytes=1000
        )
        db.add(t_row)

    # Mark media_ids[2] as favorite
    fav_media = db.query(Media).filter(Media.id == media_ids[2]).first()
    fav_media.is_favorite = True
    db.commit()

    # Heuristic check: media_ids[0] (sharp) is best, media_ids[1] (blurry) is in trash
    heur_res = client.post("/api/v1/ai/similar/best-shot", headers=auth_headers, json={
        "media_ids": media_ids,
        "use_ai": False
    }).json()
    assert heur_res["engine"] == "heuristic"
    assert heur_res["best_media_id"] == media_ids[0]
    assert media_ids[1] in heur_res["trash_media_ids"]
    assert media_ids[2] in heur_res["keep_media_ids"]  # favorite is protected

    # AI check with favorite protection: FakeProvider proposes to trash the favorite
    fake_p = FakeProvider(responses=[
        {
            "best_media_id": media_ids[1],
            "keep_media_ids": [media_ids[1]],
            "trash_media_ids": [media_ids[0], media_ids[2]],  # Media 2 is favorite!
            "reasons": [
                {"media_id": media_ids[1], "reason": "Posa migliore"},
                {"media_id": media_ids[0], "reason": "Scarto"},
                {"media_id": media_ids[2], "reason": "Scarto ma e preferito"}
            ],
            "summary": "Analisi AI"
        }
    ])
    set_provider_override(fake_p)

    ai_res = client.post("/api/v1/ai/similar/best-shot", headers=auth_headers, json={
        "media_ids": media_ids,
        "use_ai": True
    }).json()

    assert ai_res["engine"] == "fake"
    # Even though AI suggested trashing media_ids[2], favorite protection moved it to keep!
    assert media_ids[2] in ai_res["keep_media_ids"]
    assert media_ids[2] not in ai_res["trash_media_ids"]


def test_trash_similar_guardrails(client, auth_headers, tmp_path, db):
    disk = tmp_path / "disk_sim"
    disk.mkdir()
    (disk / "shots").mkdir()

    content1 = b"SHOT_1_BYTES"
    content2 = b"SHOT_2_BYTES"
    (disk / "shots" / "s1.jpg").write_bytes(content1)
    (disk / "shots" / "s2.jpg").write_bytes(content2)

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk Sim", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": 2}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={
        "items": [
            {"filename": "s1.jpg", "relative_path": "shots/s1.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content1), "sha256": "5555555555555555555555555555555555555555555555555555555555555551"},
            {"filename": "s2.jpg", "relative_path": "shots/s2.jpg", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": len(content2), "sha256": "5555555555555555555555555555555555555555555555555555555555555552"}
        ]
    })

    all_m = client.get("/api/v1/media", headers=auth_headers).json()
    m1 = next(x for x in all_m if "s1.jpg" in (x.get("primary_filename") or ""))
    m2 = next(x for x in all_m if "s2.jpg" in (x.get("primary_filename") or ""))
    m1_id, m2_id = m1["id"], m2["id"]

    # Set close dhash values
    db_m1 = db.query(Media).filter(Media.id == m1_id).first()
    db_m2 = db.query(Media).filter(Media.id == m2_id).first()
    db_m1.dhash = "0000000000000000"
    db_m2.dhash = "0000000000000001"  # distance = 1
    db.commit()

    # Guardrail 1: keep_media_id in trash_media_ids -> 400
    res_err1 = client.post("/api/v1/duplicates/trash-similar", headers=auth_headers, json={
        "keep_media_id": m1_id,
        "trash_media_ids": [m1_id]
    })
    assert res_err1.status_code == 400

    # Guardrail 2: media to trash is favorite -> 400
    db_m2.is_favorite = True
    db.commit()
    res_err2 = client.post("/api/v1/duplicates/trash-similar", headers=auth_headers, json={
        "keep_media_id": m1_id,
        "trash_media_ids": [m2_id]
    })
    assert res_err2.status_code == 400
    db_m2.is_favorite = False
    db.commit()

    # Guardrail 3: dhash too distant -> 400
    db_m2.dhash = "ffffffffffffffff"  # distance = 64
    db.commit()
    res_err3 = client.post("/api/v1/duplicates/trash-similar", headers=auth_headers, json={
        "keep_media_id": m1_id,
        "trash_media_ids": [m2_id],
        "max_distance": 10
    })
    assert res_err3.status_code == 400
    db_m2.dhash = "0000000000000001"
    db.commit()

    # Guardrail 4: one copy on offline source -> 400
    src_obj = db.query(Source).filter(Source.id == src).first()
    src_obj.status = "offline"
    db.commit()
    res_err4 = client.post("/api/v1/duplicates/trash-similar", headers=auth_headers, json={
        "keep_media_id": m1_id,
        "trash_media_ids": [m2_id]
    })
    assert res_err4.status_code == 400
    src_obj.status = "online"
    db.commit()

    # Valid execution
    res_valid = client.post("/api/v1/duplicates/trash-similar", headers=auth_headers, json={
        "keep_media_id": m1_id,
        "trash_media_ids": [m2_id]
    })
    assert res_valid.status_code == 200
    assert res_valid.json()["trashed_media_count"] == 1

    # Check physical move
    trash_path = disk / ".pmm_trash" / "files" / "shots" / "s2.jpg"
    assert trash_path.exists()
    assert (disk / "shots" / "s1.jpg").exists()

    # Restore via existing restore endpoint
    trashed_file_id = res_valid.json()["items"][0]["file_id"]
    restore_res = client.post("/api/v1/duplicates/trash/restore", headers=auth_headers, json={
        "file_ids": [trashed_file_id]
    })
    assert restore_res.status_code == 200
    assert (disk / "shots" / "s2.jpg").exists()


def test_smart_album_detection_and_creation(client, auth_headers, tmp_path, db):
    disk = tmp_path / "disk_albums"
    disk.mkdir()
    (disk / "photos").mkdir()

    src = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Disk Alb", "source_type": "external_drive", "root_path": str(disk)
    }).json()["id"]

    # Ingest 20 photos in "Siracusa" over 3 days (captured_at 2024-08-01..)
    # and 20 photos in "Milano" 30 days later (captured_at 2024-09-01..)
    items = []
    base_date1 = datetime(2024, 8, 1, 10, 0, 0, tzinfo=timezone.utc)
    base_date2 = datetime(2024, 9, 1, 10, 0, 0, tzinfo=timezone.utc)

    for i in range(20):
        t = base_date1 + timedelta(hours=i * 2)
        fn = f"siracusa_{i}.jpg"
        sha = f"sira_{i:060d}"
        (disk / "photos" / fn).write_bytes(b"SIRA_BYTES")
        items.append({"filename": fn, "relative_path": f"photos/{fn}", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": 10, "sha256": sha, "captured_at": t.isoformat()})

    for i in range(20):
        t = base_date2 + timedelta(hours=i * 2)
        fn = f"milano_{i}.jpg"
        sha = f"mila_{i:060d}"
        (disk / "photos" / fn).write_bytes(b"MILA_BYTES")
        items.append({"filename": fn, "relative_path": f"photos/{fn}", "extension": "jpg", "mime_type": "image/jpeg", "size_bytes": 10, "sha256": sha, "captured_at": t.isoformat()})

    scan = client.post(f"/api/v1/scans/{src}/start", headers=auth_headers, json={"total_files_discovered": len(items)}).json()
    client.post(f"/api/v1/scans/{scan['id']}/batch", headers=auth_headers, json={"items": items})

    # Set place_name on media rows
    for m in db.query(Media).all():
        first_f = db.query(File).filter(File.media_id == m.id).first()
        if "siracusa" in first_f.filename:
            m.place_name = "Siracusa"
        elif "milano" in first_f.filename:
            m.place_name = "Milano"
    db.commit()

    # Discover events
    res_suggest = client.post("/api/v1/ai/smart-albums/suggest", headers=auth_headers, json={
        "use_ai": False,
        "min_media": 15
    })
    assert res_suggest.status_code == 200
    events = res_suggest.json()["events"]
    assert len(events) == 2

    # Check top places
    siracusa_ev = next(e for e in events if any(p["place_name"] == "Siracusa" for p in e["top_places"]))
    milano_ev = next(e for e in events if any(p["place_name"] == "Milano" for p in e["top_places"]))
    assert siracusa_ev["media_count"] == 20
    assert milano_ev["media_count"] == 20

    # Create album for Siracusa
    res_create = client.post("/api/v1/ai/smart-albums/create", headers=auth_headers, json={
        "event_id": siracusa_ev["event_id"],
        "name": "Estate a Siracusa",
        "description": "Vacanze 2024",
        "tags": ["siracusa", "vacanze"]
    })
    assert res_create.status_code == 200
    assert res_create.json()["added_count"] == 20
    assert res_create.json()["tags_applied"] == 2

    # A subsequent call to suggest should exclude the Siracusa event because it is now covered
    res_suggest_2 = client.post("/api/v1/ai/smart-albums/suggest", headers=auth_headers, json={
        "use_ai": False,
        "min_media": 15
    })
    assert res_suggest_2.status_code == 200
    events_2 = res_suggest_2.json()["events"]
    assert len(events_2) == 1
    assert any(p["place_name"] == "Milano" for p in events_2[0]["top_places"])
