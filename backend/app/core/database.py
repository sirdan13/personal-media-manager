from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

# Enable SQLite WAL mode, foreign keys, and optimize busy timeout
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def run_db_migrations(target_engine):
    """Safely add new columns to existing SQLite tables if not present."""
    from sqlalchemy import text
    with target_engine.connect() as conn:
        # Check users table
        try:
            res = conn.execute(text("PRAGMA table_info(users)"))
            cols = [row[1] for row in res.fetchall()]
            if cols and "thumbnail_profile" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN thumbnail_profile VARCHAR(20) NOT NULL DEFAULT 'balanced'"))
                conn.commit()
        except Exception as e:
            print("Migration warning (users):", e)

        # Check media table
        try:
            res = conn.execute(text("PRAGMA table_info(media)"))
            cols = [row[1] for row in res.fetchall()]
            if cols:
                if "is_live_photo" not in cols:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_live_photo INTEGER NOT NULL DEFAULT 0"))
                if "live_video_media_id" not in cols:
                    conn.execute(text("ALTER TABLE media ADD COLUMN live_video_media_id VARCHAR(36)"))
                if "dhash" not in cols:
                    conn.execute(text("ALTER TABLE media ADD COLUMN dhash VARCHAR(16)"))
                if "latitude" not in cols:
                    conn.execute(text("ALTER TABLE media ADD COLUMN latitude FLOAT"))
                if "longitude" not in cols:
                    conn.execute(text("ALTER TABLE media ADD COLUMN longitude FLOAT"))
                conn.commit()
        except Exception as e:
            print("Migration warning (media):", e)

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
