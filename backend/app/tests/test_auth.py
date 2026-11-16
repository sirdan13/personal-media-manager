def test_register_success(client):
    res = client.post("/api/v1/auth/register", json={
        "email": "mario.rossi@example.com",
        "password": "PasswordSicura123!",
        "display_name": "Mario Rossi"
    })
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "mario.rossi@example.com"
    assert data["user"]["display_name"] == "Mario Rossi"

def test_register_duplicate_email_fails(client):
    client.post("/api/v1/auth/register", json={
        "email": "luigi@example.com",
        "password": "Password123!"
    })
    res = client.post("/api/v1/auth/register", json={
        "email": "luigi@example.com",
        "password": "OtherPassword456!"
    })
    assert res.status_code == 400
    assert "già registrato" in res.json()["detail"]

def test_login_success(client):
    client.post("/api/v1/auth/register", json={
        "email": "anna@example.com",
        "password": "PasswordAnna123!"
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com",
        "password": "PasswordAnna123!"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()

def test_login_invalid_password(client):
    client.post("/api/v1/auth/register", json={
        "email": "paolo@example.com",
        "password": "CorrectPassword123!"
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "paolo@example.com",
        "password": "WrongPassword999!"
    })
    assert res.status_code == 401

def test_get_me(client, auth_headers):
    res = client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "test@example.com"
