import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

# Self-contained SPA serving: serve frontend/dist directly when built
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
_FRONTEND_DIST = os.path.join(_PROJECT_ROOT, "frontend", "dist")
_FRONTEND_ASSETS = os.path.join(_FRONTEND_DIST, "assets")

if os.path.isdir(_FRONTEND_DIST):
    if os.path.isdir(_FRONTEND_ASSETS):
        app.mount("/assets", StaticFiles(directory=_FRONTEND_ASSETS), name="frontend_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith(("api/", "docs", "openapi.json", "redoc", "health")):
            raise HTTPException(status_code=404, detail="Not Found")

        real_dist = os.path.realpath(_FRONTEND_DIST)
        candidate = os.path.realpath(os.path.join(real_dist, full_path)) if full_path else None
        if candidate and os.path.commonpath([real_dist, candidate]) == real_dist and os.path.isfile(candidate):
            return FileResponse(candidate)

        index_file = os.path.join(real_dist, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build non trovato")
