def test_create_and_list_source(client, auth_headers):
    # Add source
    res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "Hard Disk WD 4TB",
        "source_type": "external_drive",
        "root_path": "/Volumes/WD_4TB/Foto"
    })
    assert res.status_code == 201
    source_id = res.json()["id"]
    assert res.json()["name"] == "Hard Disk WD 4TB"
    assert res.json()["status"] == "online"

    # List sources
    list_res = client.get("/api/v1/sources", headers=auth_headers)
    assert list_res.status_code == 200
    sources = list_res.json()
    assert len(sources) == 1
    assert sources[0]["id"] == source_id
    assert sources[0]["file_count"] == 0

def test_source_multiuser_isolation(client, auth_headers, other_user_headers):
    # User 1 creates source
    res = client.post("/api/v1/sources", headers=auth_headers, json={
        "name": "User 1 Private Drive",
        "source_type": "browser_folder"
    })
    u1_source_id = res.json()["id"]

    # User 2 lists sources -> must not see User 1's source
    u2_list = client.get("/api/v1/sources", headers=other_user_headers)
    assert u2_list.status_code == 200
    assert len(u2_list.json()) == 0

    # User 2 tries to access User 1's source directly -> 404
    u2_direct = client.get(f"/api/v1/sources/{u1_source_id}", headers=other_user_headers)
    assert u2_direct.status_code == 404
