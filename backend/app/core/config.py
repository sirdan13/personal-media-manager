import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
_DEFAULT_DB_PATH = os.path.join(_DEFAULT_DATA_DIR, "personal_media_manager.db")
_DEFAULT_THUMBS_DIR = os.path.join(_DEFAULT_DATA_DIR, "thumbnails")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Personal Media Manager API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production-1234567890"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Database
    DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    
    # Storage
    STORAGE_DIR: str = _DEFAULT_DATA_DIR
    THUMBNAILS_DIR: str = _DEFAULT_THUMBS_DIR
    
    # Thumbnail Profiles
    THUMBNAIL_PROFILES: dict = {
        "compact": {"max_edge": 240, "quality": 55},
        "balanced": {"max_edge": 320, "quality": 65},
        "high": {"max_edge": 384, "quality": 75},
    }
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8089"
    ]

    model_config = SettingsConfigDict(env_file=".env", extra="allow")

settings = Settings()

# Ensure directories exist
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(settings.THUMBNAILS_DIR, exist_ok=True)
