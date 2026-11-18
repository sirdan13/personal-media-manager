import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    Float,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=True)
    thumbnail_profile = Column(String(20), nullable=False, default="balanced")
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    sources = relationship("Source", back_populates="user", cascade="all, delete-orphan")
    media = relationship("Media", back_populates="user", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    device_type = Column(String(50), nullable=False, default="browser_client")
    created_at = Column(DateTime, default=utc_now, nullable=False)
    last_seen_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="devices")
    sources = relationship("Source", back_populates="device")

class Source(Base):
    __tablename__ = "sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    source_type = Column(String(50), nullable=False, default="browser_folder")
    root_path = Column(Text, nullable=True)
    persistent_identifier = Column(String(255), nullable=True)
    status = Column(String(30), nullable=False, default="online")
    created_at = Column(DateTime, default=utc_now, nullable=False)
    last_scanned_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sources")
    device = relationship("Device", back_populates="sources")
    scan_jobs = relationship("ScanJob", back_populates="source", cascade="all, delete-orphan")
    files = relationship("File", back_populates="source", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_sources_user_status", "user_id", "status"),
    )

class Media(Base):
    __tablename__ = "media"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    media_type = Column(String(20), nullable=False, default="image")
    canonical_sha256 = Column(String(64), nullable=False, index=True)
    captured_at = Column(DateTime, nullable=True, index=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    is_live_photo = Column(Integer, nullable=False, default=0)
    live_video_media_id = Column(String(36), ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    dhash = Column(String(16), nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    place_name = Column(String(255), nullable=True, index=True)
    is_favorite = Column(Integer, nullable=False, default=0, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="media")
    files = relationship("File", back_populates="media", cascade="all, delete-orphan")
    thumbnail = relationship("Thumbnail", back_populates="media", uselist=False, cascade="all, delete-orphan")
    album_items = relationship("AlbumMedia", back_populates="media", cascade="all, delete-orphan")
    media_tags = relationship("MediaTag", back_populates="media", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "canonical_sha256", name="uq_user_canonical_sha256"),
        Index("idx_media_user_captured", "user_id", "captured_at"),
    )

class File(Base):
    __tablename__ = "files"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    media_id = Column(String(36), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String(36), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False, index=True)
    relative_path = Column(Text, nullable=False)
    extension = Column(String(20), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    filesystem_modified_at = Column(DateTime, nullable=True)
    filesystem_created_at = Column(DateTime, nullable=True)
    captured_at = Column(DateTime, nullable=True, index=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    metadata_json = Column(Text, nullable=True)
    sha256 = Column(String(64), nullable=False, index=True)
    availability_status = Column(String(30), nullable=False, default="available")
    first_indexed_at = Column(DateTime, default=utc_now, nullable=False)
    last_seen_at = Column(DateTime, default=utc_now, nullable=False)

    media = relationship("Media", back_populates="files")
    source = relationship("Source", back_populates="files")

    __table_args__ = (
        UniqueConstraint("source_id", "relative_path", name="uq_source_relative_path"),
        Index("idx_files_source_sha", "source_id", "sha256"),
    )

class Thumbnail(Base):
    __tablename__ = "thumbnails"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    media_id = Column(String(36), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    storage_path = Column(String(500), nullable=False)
    format = Column(String(10), nullable=False, default="webp")
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    media = relationship("Media", back_populates="thumbnail")

class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_id = Column(String(36), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="pending")
    total_files_discovered = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    last_checkpoint_path = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    source = relationship("Source", back_populates="scan_jobs")
    history = relationship("ScanHistory", back_populates="scan_job", cascade="all, delete-orphan")

class ScanHistory(Base):
    __tablename__ = "scan_history"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scan_job_id = Column(String(36), ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    scan_job = relationship("ScanJob", back_populates="history")

class Album(Base):
    __tablename__ = "albums"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User")
    media_items = relationship("AlbumMedia", back_populates="album", cascade="all, delete-orphan")

class AlbumMedia(Base):
    __tablename__ = "album_media"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    album_id = Column(String(36), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False, index=True)
    media_id = Column(String(36), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime, default=utc_now, nullable=False)

    album = relationship("Album", back_populates="media_items")
    media = relationship("Media", back_populates="album_items")

    __table_args__ = (
        UniqueConstraint("album_id", "media_id", name="uq_album_media"),
    )

class Tag(Base):
    __tablename__ = "tags"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(20), nullable=False, default="#38bdf8")
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User")
    media_tags = relationship("MediaTag", back_populates="tag", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_tag_name"),
    )

class MediaTag(Base):
    __tablename__ = "media_tags"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    media_id = Column(String(36), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(String(36), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)

    media = relationship("Media", back_populates="media_tags")
    tag = relationship("Tag", back_populates="media_tags")

    __table_args__ = (
        UniqueConstraint("media_id", "tag_id", name="uq_media_tag"),
    )
