from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.sources import router as sources_router
from app.api.v1.scans import router as scans_router
from app.api.v1.media import router as media_router
from app.api.v1.duplicates import router as duplicates_router
from app.api.v1.settings import router as settings_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(sources_router)
api_router.include_router(scans_router)
api_router.include_router(media_router)
api_router.include_router(duplicates_router)
api_router.include_router(settings_router)
