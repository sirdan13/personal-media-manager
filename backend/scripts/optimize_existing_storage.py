#!/usr/bin/env python3
"""
Personal Media Manager - Phase 0 Storage Optimizer & DB Cleaner
Converts in-place existing false-WebP (PNG) thumbnails to real WebP (320px, q=65, method=4),
updates dimensions and size_bytes in DB, and purges sidecar/system files (.aae, .dat, etc.).
"""

import os
import shutil
import sqlite3
import io
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "personal_media_manager.db")
DB_BAK_PATH = os.path.join(BASE_DIR, "data", "personal_media_manager.db.bak")
THUMBNAILS_DIR = os.path.join(BASE_DIR, "data", "thumbnails")


def run_optimization():
    print(f"--> Target DB: {DB_PATH}")
    print(f"--> Target Thumbnails Dir: {THUMBNAILS_DIR}")

    if not os.path.isfile(DB_PATH):
        print(f"Error: Database {DB_PATH} not found!")
        return

    # 1. Database backup
    if not os.path.isfile(DB_BAK_PATH):
        print(f"Creating database backup at {DB_BAK_PATH}...")
        shutil.copy2(DB_PATH, DB_BAK_PATH)
        print("✓ Backup completed.")
    else:
        print(f"✓ Backup already exists at {DB_BAK_PATH}.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 2. Recompress thumbnails in-place
    cursor.execute("SELECT id, storage_path FROM thumbnails")
    thumbs = cursor.fetchall()
    print(f"\n[1/3] Processing {len(thumbs)} thumbnails to real WebP (320px, q=65)...")

    processed = 0
    errors = 0
    total_bytes_saved = 0

    for thumb_id, rel_storage_path in thumbs:
        full_path = os.path.join(THUMBNAILS_DIR, rel_storage_path)
        if not os.path.isfile(full_path):
            errors += 1
            continue

        try:
            initial_size = os.path.getsize(full_path)
            with Image.open(full_path) as img:
                # Handle orientation and convert to RGB
                img = ImageOps.exif_transpose(img)
                if img.mode != "RGB":
                    img = img.convert("RGB")

                # Thumbnail resize 320x320
                img.thumbnail((320, 320), Image.Resampling.LANCZOS)
                new_w, new_h = img.size

                buf = io.BytesIO()
                img.save(buf, format="WEBP", quality=65, method=4)
                webp_bytes = buf.getvalue()

            # Overwrite file on disk
            with open(full_path, "wb") as f:
                f.write(webp_bytes)

            new_size = len(webp_bytes)
            total_bytes_saved += (initial_size - new_size)

            # Update DB record
            cursor.execute(
                """
                UPDATE thumbnails
                SET width = ?, height = ?, size_bytes = ?, format = 'webp'
                WHERE id = ?
                """,
                (new_w, new_h, new_size, thumb_id),
            )
            processed += 1

            if processed % 200 == 0 or processed == len(thumbs):
                print(f"  Processed {processed}/{len(thumbs)} thumbnails...")

        except Exception as e:
            errors += 1
            print(f"  Error on {full_path}: {e}")

    conn.commit()
    print(f"✓ Thumbnails optimized: {processed} successful, {errors} errors.")
    print(f"✓ Total disk space saved on thumbnails: {total_bytes_saved / (1024*1024):.2f} MB")

    # 3. Clean up sidecars (.aae, .dat, .ds_store, .db)
    print("\n[2/3] Cleaning up sidecar and non-media files...")
    cursor.execute(
        "SELECT id, media_id, extension FROM files WHERE LOWER(extension) IN ('aae', 'dat', 'ds_store', 'db')"
    )
    sidecar_files = cursor.fetchall()
    print(f"  Found {len(sidecar_files)} sidecar files to remove.")

    cursor.execute(
        "DELETE FROM files WHERE LOWER(extension) IN ('aae', 'dat', 'ds_store', 'db')"
    )

    # 4. Clean up orphaned media with 0 files
    print("\n[3/3] Cleaning up orphaned media records...")
    cursor.execute(
        """
        DELETE FROM media
        WHERE id NOT IN (SELECT DISTINCT media_id FROM files)
        """
    )
    orphaned_count = cursor.rowcount
    print(f"  Removed {orphaned_count} orphaned media records.")

    conn.commit()

    print("\nRunning VACUUM on SQLite database...")
    cursor.execute("VACUUM")
    conn.commit()
    conn.close()

    print("\n✓ Phase 0 storage optimization completed successfully!")


if __name__ == "__main__":
    run_optimization()
