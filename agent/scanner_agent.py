#!/usr/bin/env python3
"""
Personal Media Manager - Headless Local Scanner Agent (Milestone 5)

A standalone, non-blocking CLI agent to scan local folders, external hard drives,
and NAS mount points, extracting metadata and uploading batches to the central server.
"""

import os
import sys
import time
import argparse
import hashlib
import mimetypes
import base64
import io
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple

try:
    import requests
except ImportError:
    print("Error: 'requests' is required. Run: pip install -r agent/requirements.txt")
    sys.exit(1)

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

try:
    from PIL import Image, ImageOps, ExifTags
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

CHUNK_SIZE = 64 * 1024  # 64 KB streaming blocks
THUMBNAIL_PROFILES = {
    "compact": (240, 55),
    "balanced": (320, 65),
    "high": (384, 75)
}
SUPPORTED_RAW_EXTS = {
    ".dng", ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2",
    ".raf", ".orf", ".rw2", ".raw", ".pef", ".srw", ".3fr", ".fff", ".iiq",
    ".x3f", ".rwl"
}
SUPPORTED_IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif",
    ".heic", ".heif", ".avif", ".jxl"
} | SUPPORTED_RAW_EXTS
SUPPORTED_VIDEO_EXTS = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v",
    ".mts", ".m2ts", ".mpg", ".mpeg", ".3gp", ".insv"
}
SUPPORTED_EXTS = SUPPORTED_IMAGE_EXTS | SUPPORTED_VIDEO_EXTS
IGNORED_DIR_NAMES = {".git", ".svn", "__pycache__", "node_modules", "venv", ".DS_Store", "@eaDir", ".Spotlight-V100", ".Trashes"}


class ScannerAgent:
    def __init__(self, server_url: str, email: str, password: str, thumb_profile: str = "balanced"):
        self.server_url = server_url.rstrip("/")
        self.email = email
        self.password = password
        self.thumb_profile = thumb_profile
        self.token: Optional[str] = None
        self.session = requests.Session()

    def login(self) -> bool:
        """Authenticate with the Personal Media Manager backend."""
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True

        login_url = f"{self.server_url}/api/v1/auth/login"
        payload = {"email": self.email, "password": self.password}
        try:
            resp = self.session.post(login_url, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                return True
            else:
                print(f"[ERROR] Authentication failed (HTTP {resp.status_code}): {resp.text}")
                return False
        except Exception as e:
            print(f"[ERROR] Failed to connect to server: {e}")
            return False

    def get_or_create_source(self, source_name: str, root_path: str) -> Optional[Dict[str, Any]]:
        """Find an existing source by name or create a new local_folder source."""
        url = f"{self.server_url}/api/v1/sources"
        try:
            resp = self.session.get(url, timeout=10)
            if resp.status_code == 200:
                sources = resp.json()
                for s in sources:
                    if s.get("name") == source_name:
                        return s

            # Source does not exist, create it
            create_payload = {
                "name": source_name,
                "source_type": "local_folder",
                "root_path": os.path.abspath(root_path)
            }
            resp = self.session.post(url, json=create_payload, timeout=10)
            if resp.status_code == 201:
                return resp.json()
            else:
                print(f"[ERROR] Failed to create source: {resp.text}")
                return None
        except Exception as e:
            print(f"[ERROR] Source operation failed: {e}")
            return None

    def get_fingerprints(self, source_id: str) -> Dict[str, Any]:
        """Fetch indexed fingerprints for fast incremental change detection."""
        url = f"{self.server_url}/api/v1/sources/{source_id}/fingerprints"
        try:
            resp = self.session.get(url, timeout=15)
            if resp.status_code == 200:
                return resp.json()
            return {}
        except Exception as e:
            print(f"[WARN] Failed to fetch fingerprints: {e}")
            return {}

    def compute_sha256(self, filepath: str) -> str:
        """Stream file in chunks to compute exact SHA-256 without memory spikes."""
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(CHUNK_SIZE):
                hasher.update(chunk)
        return hasher.hexdigest()

    def extract_largest_embedded_jpeg(self, filepath: str, max_read_bytes: int = 12 * 1024 * 1024) -> Optional[bytes]:
        """Locate and extract the largest valid embedded JPEG thumbnail/preview in a RAW file."""
        try:
            with open(filepath, "rb") as f:
                data = f.read(max_read_bytes)

            best_block = None
            max_len = 0
            idx = 0
            data_len = len(data)

            while idx < data_len - 3:
                soi = data.find(b"\xff\xd8\xff", idx)
                if soi == -1:
                    break
                eoi = data.find(b"\xff\xd9", soi + 3)
                if eoi == -1:
                    idx = soi + 3
                    continue

                block_len = (eoi + 2) - soi
                if block_len > 8192 and block_len > max_len:
                    candidate = data[soi : eoi + 2]
                    try:
                        with Image.open(io.BytesIO(candidate)) as test_img:
                            test_img.verify()
                        max_len = block_len
                        best_block = candidate
                    except Exception:
                        pass
                idx = eoi + 2

            return best_block
        except Exception:
            return None

    def extract_image_metadata_and_thumb(
        self, filepath: str
    ) -> Tuple[Optional[str], Optional[int], Optional[int], Dict[str, Any], Optional[str]]:
        """Extract EXIF data, dimensions, and generate WebP thumbnail using Pillow."""
        if not HAS_PILLOW:
            return None, None, None, {}, None

        captured_at = None
        width = None
        height = None
        meta: Dict[str, Any] = {}
        thumb_base64 = None
        ext = os.path.splitext(filepath)[1].lower()

        try:
            thumb_img = None

            # 1. Try standard Pillow Image.open for metadata and initial image
            try:
                with Image.open(filepath) as img:
                    width, height = img.size

                    # Extract EXIF if available
                    exif_data = img.getexif()
                    if exif_data:
                        for tag_id, value in exif_data.items():
                            tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                            if tag_name in ("Make", "Model", "Software", "LensModel"):
                                meta[tag_name] = str(value)
                            elif tag_name in ("DateTimeOriginal", "DateTime"):
                                try:
                                    dt = datetime.strptime(str(value), "%Y:%m:%d %H:%M:%S")
                                    captured_at = dt.isoformat()
                                except Exception:
                                    pass

                        # Extract GPS Info
                        try:
                            gps_info = exif_data.get_ifd(0x8825)
                            if gps_info:
                                lat_val = gps_info.get(2)
                                lat_ref = gps_info.get(1)
                                lon_val = gps_info.get(4)
                                lon_ref = gps_info.get(3)
                                if lat_val and lat_ref and lon_val and lon_ref:
                                    def _to_deg(val, ref):
                                        d = float(val[0])
                                        m = float(val[1])
                                        s = float(val[2])
                                        res = d + (m / 60.0) + (s / 3600.0)
                                        return -res if ref in ("S", "W") else res
                                    meta["latitude"] = _to_deg(lat_val, lat_ref)
                                    meta["longitude"] = _to_deg(lon_val, lon_ref)
                        except Exception:
                            pass

                    # If this is not a RAW file and image is adequately sized, use it for thumbnail
                    if ext not in SUPPORTED_RAW_EXTS and width >= 256 and height >= 256:
                        try:
                            thumb_img = ImageOps.exif_transpose(img)
                        except Exception:
                            thumb_img = img.copy()
            except Exception as e:
                meta["exif_read_error"] = str(e)

            # 2. If RAW or thumb_img not yet acquired, try embedded JPEG
            if thumb_img is None:
                raw_jpeg = self.extract_largest_embedded_jpeg(filepath)
                if raw_jpeg:
                    try:
                        raw_io = io.BytesIO(raw_jpeg)
                        with Image.open(raw_io) as r_img:
                            thumb_img = ImageOps.exif_transpose(r_img)
                            if not width or not height or width < 256:
                                width, height = r_img.size
                    except Exception:
                        thumb_img = None

            # 3. macOS native fallback via `sips` for RAW/HEIC if still needed
            if thumb_img is None and sys.platform == "darwin":
                try:
                    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_f:
                        tmp_path = tmp_f.name
                    res = subprocess.run(
                        ["sips", "-s", "format", "jpeg", "-Z", "512", filepath, "--out", tmp_path],
                        capture_output=True,
                        timeout=10
                    )
                    if res.returncode == 0 and os.path.exists(tmp_path):
                        with Image.open(tmp_path) as sips_img:
                            thumb_img = ImageOps.exif_transpose(sips_img)
                            if not width or not height:
                                width, height = sips_img.size
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except Exception:
                    pass

            # 4. Generate WebP thumbnail from thumb_img
            if thumb_img is not None:
                if thumb_img.mode in ("RGBA", "LA", "P"):
                    thumb_img = thumb_img.convert("RGBA")
                elif thumb_img.mode != "RGB":
                    thumb_img = thumb_img.convert("RGB")

                max_edge, quality = THUMBNAIL_PROFILES.get(self.thumb_profile, (320, 65))
                thumb_img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

                buf = io.BytesIO()
                thumb_img.save(buf, format="WEBP", quality=quality, method=4)
                thumb_base64 = f"data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"

        except Exception as e:
            meta["read_error"] = str(e)

        return captured_at, width, height, meta, thumb_base64

    def start_scan(self, source_id: str, total_files: int) -> Optional[str]:
        """Signal start of scan job to backend."""
        url = f"{self.server_url}/api/v1/scans/{source_id}/start"
        try:
            resp = self.session.post(url, json={"total_files_discovered": total_files}, timeout=10)
            if resp.status_code == 201:
                return resp.json().get("id")
            return None
        except Exception:
            return None

    def send_batch(self, scan_id: str, items: List[Dict[str, Any]], checkpoint: Optional[str] = None) -> bool:
        """Send a batch of indexed items to the backend ingestion endpoint."""
        url = f"{self.server_url}/api/v1/scans/{scan_id}/batch"
        try:
            resp = self.session.post(url, json={"items": items, "checkpoint_path": checkpoint}, timeout=60)
            return resp.status_code == 200
        except Exception as e:
            print(f"[ERROR] Batch upload error: {e}")
            return False

    def reconcile_source(self, source_id: str, seen_paths: List[str]) -> Dict[str, Any]:
        """Reconcile active files against current filesystem snapshot."""
        url = f"{self.server_url}/api/v1/sources/{source_id}/reconcile"
        try:
            resp = self.session.post(url, json={"seen_paths": seen_paths}, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            return {}
        except Exception as e:
            print(f"[WARN] Reconciliation failed: {e}")
            return {}

    def complete_scan(self, scan_id: str, total_processed: int, failed_files: int) -> bool:
        """Notify backend that scan completed successfully."""
        url = f"{self.server_url}/api/v1/scans/{scan_id}/complete"
        try:
            resp = self.session.post(
                url,
                json={"total_processed": total_processed, "failed_files": failed_files},
                timeout=10
            )
            return resp.status_code == 200
        except Exception:
            return False

    def run(
        self,
        folder_path: str,
        source_name: str,
        batch_size: int = 50,
        incremental: bool = True,
        reconcile: bool = True
    ):
        """Execute full local scanning workflow."""
        start_time = time.time()
        abs_folder = os.path.abspath(folder_path)
        if not os.path.isdir(abs_folder):
            print(f"[ERROR] Target path '{abs_folder}' is not a valid directory.")
            sys.exit(1)

        print(f"\n=======================================================")
        print(f"  Personal Media Manager - Headless Scanner Agent")
        print(f"=======================================================")
        print(f" Target Folder:  {abs_folder}")
        print(f" Server URL:     {self.server_url}")
        print(f" Source Name:    {source_name}")
        print(f" Batch Size:     {batch_size}")
        print(f" Incremental:    {incremental}")
        print(f" Reconcile:      {reconcile}")
        print(f" Pillow Enabled: {HAS_PILLOW}")
        print(f"-------------------------------------------------------\n")

        # 1. Login
        print("[1/5] Authenticating with server...")
        if not self.login():
            print("[ERROR] Login failed. Please verify email and password.")
            sys.exit(1)
        print("  ✓ Authenticated successfully.")

        # 2. Get or create source
        print("[2/5] Initializing source...")
        source = self.get_or_create_source(source_name, abs_folder)
        if not source:
            print("[ERROR] Could not initialize source.")
            sys.exit(1)
        source_id = source["id"]
        print(f"  ✓ Source registered (ID: {source_id})")

        # 3. Fetch fingerprints
        fingerprints = {}
        if incremental:
            print("  Fetching existing fingerprints for fast skip...")
            fingerprints = self.get_fingerprints(source_id)
            print(f"  ✓ Loaded {len(fingerprints)} existing file fingerprints.")

        # 4. Discover files
        print("\n[3/5] Traversing directory structure...")
        media_files = []
        for root, dirs, files in os.walk(abs_folder):
            # Prune ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORED_DIR_NAMES and not d.startswith(".")]
            for file in files:
                if file.startswith("."):
                    continue
                ext = os.path.splitext(file)[1].lower()
                if ext in SUPPORTED_EXTS:
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, abs_folder).replace("\\", "/")
                    media_files.append((full_p, rel_p, file, ext))

        total_discovered = len(media_files)
        print(f"  ✓ Discovered {total_discovered} supported media files.")

        if total_discovered == 0:
            print("No media files found to scan. Exiting.")
            return

        # Start scan job
        scan_id = self.start_scan(source_id, total_discovered)
        if not scan_id:
            print("[ERROR] Failed to start scan job on backend.")
            sys.exit(1)
        print(f"  ✓ Scan job created (ID: {scan_id})")

        # 5. Process files in batches
        print(f"\n[4/5] Hashing and indexing files...")
        batch: List[Dict[str, Any]] = []
        seen_paths: List[str] = []
        skipped_count = 0
        new_or_modified_count = 0
        error_count = 0
        total_bytes_hashed = 0

        for i, (full_path, rel_path, filename, ext) in enumerate(media_files, 1):
            seen_paths.append(rel_path)
            try:
                stat = os.stat(full_path)
                size_bytes = stat.st_size
                mtime = stat.st_mtime
                mtime_iso = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
            except Exception as e:
                error_count += 1
                print(f"\n[ERROR] Stat failed on {rel_path}: {e}")
                continue

            # Check fingerprint
            fp = fingerprints.get(rel_path)
            if fp and fp.get("size_bytes") == size_bytes and fp.get("availability_status") == "available":
                # Check modification time tolerance
                fp_mtime = fp.get("filesystem_modified_at")
                if fp_mtime:
                    try:
                        fp_dt = datetime.fromisoformat(fp_mtime.replace("Z", "+00:00"))
                        if abs(fp_dt.timestamp() - mtime) < 2.0:
                            needs_thumb = fp.get("has_thumbnail") is False
                            if not needs_thumb:
                                # Skip heavy work!
                                skipped_count += 1
                                item = {
                                    "filename": filename,
                                    "relative_path": rel_path,
                                    "extension": ext,
                                    "mime_type": mimetypes.guess_type(filename)[0] or "application/octet-stream",
                                    "size_bytes": size_bytes,
                                    "sha256": fp["sha256"],
                                    "modified_at": mtime_iso,
                                    "captured_at": None,
                                    "thumbnail_base64": None
                                }
                                batch.append(item)
                                if len(batch) >= batch_size:
                                    self.send_batch(scan_id, batch, rel_path)
                                    batch.clear()
                                continue
                            else:
                                # Re-use known hash without rehashing, but extract thumbnail and metadata
                                skipped_count += 1
                                sha256 = fp["sha256"]
                                mime = mimetypes.guess_type(filename)[0] or ("image/jpeg" if ext in SUPPORTED_IMAGE_EXTS else "video/mp4")
                                captured_at, width, height, duration_sec, meta, thumb = None, None, None, None, {}, None
                                if ext in SUPPORTED_IMAGE_EXTS:
                                    captured_at, width, height, meta, thumb = self.extract_image_metadata_and_thumb(full_path)
                                elif ext in SUPPORTED_VIDEO_EXTS:
                                    captured_at, width, height, duration_sec, meta, thumb = self.extract_video_metadata_and_thumb(full_path)
                                item = {
                                    "filename": filename,
                                    "relative_path": rel_path,
                                    "extension": ext,
                                    "mime_type": mime,
                                    "size_bytes": size_bytes,
                                    "sha256": sha256,
                                    "modified_at": mtime_iso,
                                    "captured_at": captured_at,
                                    "width": width,
                                    "height": height,
                                    "duration_seconds": duration_sec,
                                    "metadata_json": meta,
                                    "thumbnail_base64": thumb
                                }
                                batch.append(item)
                                if len(batch) >= batch_size:
                                    self.send_batch(scan_id, batch, rel_path)
                                    batch.clear()
                                continue
                    except Exception:
                        pass

            # New or modified file: perform hashing and metadata extraction
            new_or_modified_count += 1
            total_bytes_hashed += size_bytes
            try:
                sha256 = self.compute_sha256(full_path)
                mime = mimetypes.guess_type(filename)[0] or ("image/jpeg" if ext in SUPPORTED_IMAGE_EXTS else "video/mp4")
                
                captured_at, width, height, meta, thumb = None, None, None, {}, None
                if ext in SUPPORTED_IMAGE_EXTS:
                    captured_at, width, height, meta, thumb = self.extract_image_metadata_and_thumb(full_path)

                item = {
                    "filename": filename,
                    "relative_path": rel_path,
                    "extension": ext,
                    "mime_type": mime,
                    "size_bytes": size_bytes,
                    "sha256": sha256,
                    "modified_at": mtime_iso,
                    "captured_at": captured_at,
                    "width": width,
                    "height": height,
                    "metadata_json": meta,
                    "thumbnail_base64": thumb
                }
                batch.append(item)
            except Exception as e:
                error_count += 1
                print(f"\n[ERROR] Processing failed on {rel_path}: {e}")

            if len(batch) >= batch_size:
                self.send_batch(scan_id, batch, rel_path)
                batch.clear()

            # Progress line
            pct = (i / total_discovered) * 100
            sys.stdout.write(f"\r  Progress: [{i}/{total_discovered}] {pct:5.1f}% | New: {new_or_modified_count} | Skipped: {skipped_count} | Errors: {error_count}")
            sys.stdout.flush()

        # Flush final batch
        if batch:
            self.send_batch(scan_id, batch)
            batch.clear()

        print("\n  ✓ Ingestion complete.")

        # 6. Reconcile missing files
        reconcile_stats = {}
        if reconcile:
            print("\n[5/5] Reconciling filesystem changes...")
            reconcile_stats = self.reconcile_source(source_id, seen_paths)
            print(f"  ✓ Missing files marked:    {reconcile_stats.get('marked_missing', 0)}")
            print(f"  ✓ Restored files active:   {reconcile_stats.get('restored_available', 0)}")
            print(f"  ✓ Total active copies:     {reconcile_stats.get('total_active', 0)}")

        # Complete job
        self.complete_scan(scan_id, len(seen_paths), error_count)

        duration = time.time() - start_time
        mb_hashed = total_bytes_hashed / (1024 * 1024)
        throughput_files = total_discovered / max(duration, 0.001)

        print(f"\n=======================================================")
        print(f"  SCAN SUMMARY")
        print(f"=======================================================")
        print(f" Total files discovered:   {total_discovered}")
        print(f" New / modified ingested: {new_or_modified_count}")
        print(f" Unchanged skipped:       {skipped_count}")
        print(f" Errors encountered:      {error_count}")
        print(f" Bytes hashed (SHA-256):  {mb_hashed:.2f} MB")
        print(f" Total duration:          {duration:.2f} seconds")
        print(f" Throughput:              {throughput_files:.1f} files/sec")
        print(f"=======================================================\n")


def main():
    parser = argparse.ArgumentParser(
        description="Personal Media Manager - Headless Local Scanner Agent (Milestone 5)"
    )
    parser.add_argument("--server", default="http://localhost:8000", help="Backend URL (default: http://localhost:8000)")
    parser.add_argument("--email", default="demo@example.com", help="User account email")
    parser.add_argument("--password", default="demo123456", help="User account password")
    parser.add_argument("--source-name", required=True, help="Friendly name for this source / drive")
    parser.add_argument("--path", required=True, help="Path to local folder or mount point to scan")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for HTTP uploads (default: 50)")
    parser.add_argument("--thumb-profile", choices=["compact", "balanced", "high"], default="balanced", help="Thumbnail compression profile (default: balanced)")
    parser.add_argument("--no-incremental", action="store_true", help="Force recalculation of all hashes (disable fast skip)")
    parser.add_argument("--no-reconcile", action="store_true", help="Skip reconciliation of missing/removed files")

    args = parser.parse_args()

    agent = ScannerAgent(
        server_url=args.server,
        email=args.email,
        password=args.password,
        thumb_profile=args.thumb_profile
    )
    agent.run(
        folder_path=args.path,
        source_name=args.source_name,
        batch_size=args.batch_size,
        incremental=not args.no_incremental,
        reconcile=not args.no_reconcile
    )


if __name__ == "__main__":
    main()
