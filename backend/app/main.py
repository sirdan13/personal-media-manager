import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, run_db_migrations
from app.api.v1.router import api_router
from app.models import entities  # Ensure models are imported for metadata creation

# Create tables and run non-destructive schema migrations
Base.metadata.create_all(bind=engine)
run_db_migrations(engine)

from app.services.geo_service import init_geo_places_cache
init_geo_places_cache(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safe startup recovery for uncompleted/crashed scans
    try:
        if not os.environ.get("PYTEST_CURRENT_TEST"):
            from app.core.database import SessionLocal
            from app.services.scan_service import recover_stale_scans
            with SessionLocal() as db_session:
                recover_stale_scans(db_session)
    except Exception:
        pass
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend centralizzato per Personal Media Manager",
    lifespan=lifespan
)

# CORS Middleware (supports localhost, LAN 192.168.x.x/10.x.x.x, and Tailscale 100.x.x.x)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# Mount API routers
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health", tags=["Health"])
def healthcheck():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION
    }
