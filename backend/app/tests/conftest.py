import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.core.database import Base, get_db
from app.main import app

# In-memory SQLite database for test suite
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = TestingSessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def auth_headers(client):
    # Register and login a default test user
    email = "test@example.com"
    password = "SuperSecretPassword123!"
    res = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "display_name": "Test User"
    })
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def other_user_headers(client):
    # Register and login a second user for multi-tenancy tests
    email = "other@example.com"
    password = "OtherSecretPassword456!"
    res = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "display_name": "Other User"
    })
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
