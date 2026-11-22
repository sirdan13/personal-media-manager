import os
import io
import sys
import shutil
import tempfile
import subprocess
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timezone
from PIL import Image, ImageOps, ExifTags

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

RAW_EXTENSIONS = {
    "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2",
    "raf", "orf", "rw2", "raw", "pef", "srw", "3fr", "fff", "iiq",
    "x3f", "rwl", "erf", "kdc", "dcr", "mos"
}

IMAGE_EXTENSIONS = {
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif",
    "heic", "heif", "avif"
} | RAW_EXTENSIONS

VIDEO_EXTENSIONS = {
    "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "3gp", "ts"
}

IGNORED_EXTENSIONS = {"aae", "xmp", "lrv", "thm", "dat", "ds_store", "db", "ini", "log"}
IGNORED_DIR_NAMES = {".trashes", ".fseventsd", ".spotlight-v100", "__macosx", "$recycle.bin", ".git", ".pmm_trash"}

def extract_largest_embedded_jpeg(filepath: str, max_read_bytes: int = 12 * 1024 * 1024) -> Optional[bytes]:
    """
    Scans a RAW file for embedded JPEG preview streams.
    Returns the largest valid JPEG byte buffer found.
    """
    try:
        with open(filepath, "rb") as f:
            data = f.read(max_read_bytes)
    except Exception:
        return None

    largest_jpeg = None
    max_len = 0
    start = 0

    while True:
        soi = data.find(b"\xff\xd8\xff", start)
        if soi == -1:
            break
        eoi = data.find(b"\xff\xd9", soi + 3)
        if eoi == -1:
            break
        length = (eoi + 2) - soi
        if length > 8192 and length > max_len:
            candidate = data[soi:eoi + 2]
            try:
                with Image.open(io.BytesIO(candidate)) as img:
                    img.verify()
                    largest_jpeg = candidate
                    max_len = length
            except Exception:
                pass
        start = soi + 3

    return largest_jpeg

def _convert_gps_coords(gps_coords, ref) -> Optional[float]:
    if not gps_coords or len(gps_coords) < 3:
        return None
    try:
        def to_float(val):
            if hasattr(val, "numerator") and hasattr(val, "denominator"):
                return float(val.numerator) / float(val.denominator) if val.denominator != 0 else 0.0
            if isinstance(val, tuple) and len(val) == 2:
                return float(val[0]) / float(val[1]) if val[1] != 0 else 0.0
            return float(val)

        d = to_float(gps_coords[0])
        m = to_float(gps_coords[1])
        s = to_float(gps_coords[2])
        dec = d + (m / 60.0) + (s / 3600.0)
        if ref in ("S", "W"):
            dec = -dec
        return round(dec, 6)
    except Exception:
        return None

def extract_exif_dict(img: Image.Image) -> Tuple[Dict[str, Any], Optional[datetime], Optional[float], Optional[float]]:
    metadata: Dict[str, Any] = {}
    captured_at: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    try:
        exif = img.getexif()
        if not exif:
            return metadata, captured_at, latitude, longitude

        for tag_id, value in exif.items():
            tag = ExifTags.TAGS.get(tag_id, str(tag_id))
            if tag in ("Make", "Model", "LensModel", "Software"):
                metadata[tag] = str(value).strip()
            elif tag in ("DateTimeOriginal", "DateTime"):
                if not captured_at and isinstance(value, str):
                    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
                        try:
                            captured_at = datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc)
                            break
                        except ValueError:
                            pass

        # Check Exif sub-IFD
        if hasattr(ExifTags, "IFD") and hasattr(ExifTags.IFD, "Exif"):
            sub_ifd = exif.get_ifd(ExifTags.IFD.Exif)
            if sub_ifd:
                for tag_id, value in sub_ifd.items():
                    tag = ExifTags.TAGS.get(tag_id, str(tag_id))
                    if tag == "DateTimeOriginal" and not captured_at and isinstance(value, str):
                        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
                            try:
                                captured_at = datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc)
                                break
                            except ValueError:
                                pass
                    elif tag in ("FNumber", "ExposureTime", "ISOSpeedRatings", "LensModel"):
                        if hasattr(value, "numerator") and hasattr(value, "denominator"):
                            val_float = float(value.numerator) / float(value.denominator) if value.denominator != 0 else 0.0
                            metadata[tag] = round(val_float, 4)
                        else:
                            metadata[tag] = value

        # Check GPS sub-IFD
        if hasattr(ExifTags, "IFD") and hasattr(ExifTags.IFD, "GPSInfo"):
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            if gps_ifd:
                lat = gps_ifd.get(2)
                lat_ref = gps_ifd.get(1)
                lon = gps_ifd.get(4)
                lon_ref = gps_ifd.get(3)
                if lat and lat_ref and lon and lon_ref:
                    latitude = _convert_gps_coords(lat, lat_ref)
                    longitude = _convert_gps_coords(lon, lon_ref)
                    if latitude is not None and longitude is not None:
                        metadata["latitude"] = latitude
                        metadata["longitude"] = longitude

    except Exception:
        pass

    return metadata, captured_at, latitude, longitude

def generate_image_preview_bytes(
    filepath: str,
    max_edge: int = 1920,
    quality: int = 85,
    fmt: str = "JPEG"
) -> Tuple[Optional[bytes], Optional[int], Optional[int], Dict[str, Any], Optional[datetime]]:
    """
    Generates preview image bytes (JPEG or WEBP) and extracts metadata.
    100% read-only on the input file.
    """
    ext = os.path.splitext(filepath)[1].lower().lstrip(".")
    img: Optional[Image.Image] = None
    metadata: Dict[str, Any] = {}
    captured_at: Optional[datetime] = None

    # Check sidecar files presence (.AAE, .XMP)
    base_no_ext = os.path.splitext(filepath)[0]
    dir_name = os.path.dirname(filepath)
    filename_no_ext = os.path.basename(base_no_ext)
    for s_ext in (".aae", ".AAE"):
        if os.path.isfile(base_no_ext + s_ext) or os.path.isfile(os.path.join(dir_name, filename_no_ext + s_ext)):
            metadata["has_apple_edits"] = True
            break
    for s_ext in (".xmp", ".XMP"):
        if os.path.isfile(base_no_ext + s_ext) or os.path.isfile(os.path.join(dir_name, filename_no_ext + s_ext)):
            metadata["has_xmp_sidecar"] = True
            break

    # 1. Read EXIF metadata from direct image open if possible (TIFF/EXIF headers)
    direct = None
    try:
        direct = Image.open(filepath)
        metadata_exif, cap_exif, lat_exif, lon_exif = extract_exif_dict(direct)
        metadata.update(metadata_exif)
        if cap_exif:
            captured_at = cap_exif
        if lat_exif is not None and lon_exif is not None:
            metadata["latitude"] = lat_exif
            metadata["longitude"] = lon_exif
    except Exception:
        direct = None

    # 2. Extract image pixel buffer
    if ext in RAW_EXTENSIONS:
        # For RAW files, prefer high-res embedded preview JPEG or sips over Pillow's IFD0 thumbnail
        raw_jpeg = extract_largest_embedded_jpeg(filepath)
        if raw_jpeg:
            try:
                emb = Image.open(io.BytesIO(raw_jpeg))
                emb.load()
                meta_emb, cap_emb, lat_emb, lon_emb = extract_exif_dict(emb)
                for k, v in meta_emb.items():
                    if k not in metadata:
                        metadata[k] = v
                if not captured_at and cap_emb:
                    captured_at = cap_emb
                if "latitude" not in metadata and lat_emb is not None:
                    metadata["latitude"] = lat_emb
                    metadata["longitude"] = lon_emb
                img = emb
            except Exception:
                img = None

        if img is None and sys.platform == "darwin" and shutil.which("sips"):
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_f:
                tmp_jpg = tmp_f.name
            try:
                cmd = ["sips", "-s", "format", "jpeg", "-Z", str(max_edge), filepath, "--out", tmp_jpg]
                res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                if res.returncode == 0 and os.path.isfile(tmp_jpg) and os.path.getsize(tmp_jpg) > 0:
                    sips_img = Image.open(tmp_jpg)
                    sips_img.load()
                    img = sips_img
            except Exception:
                pass
            finally:
                if os.path.isfile(tmp_jpg):
                    try:
                        os.remove(tmp_jpg)
                    except OSError:
                        pass

        # Fallback to direct Pillow open if neither embedded preview nor sips succeeded
        if img is None:
            img = direct
    else:
        # Standard images (JPEG, PNG, HEIC, etc.)
        img = direct

    if img is None:
        return None, None, None, metadata, captured_at

    try:
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        orig_w, orig_h = img.size
        if max(orig_w, orig_h) > max_edge:
            img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        w, h = img.size

        buf = io.BytesIO()
        out_fmt = fmt.upper()
        if out_fmt == "WEBP":
            img.save(buf, format="WEBP", quality=quality, method=4)
        else:
            img.save(buf, format="JPEG", quality=quality, optimize=True)

        return buf.getvalue(), w, h, metadata, captured_at
    except Exception:
        return None, None, None, metadata, captured_at

def generate_video_thumbnail_bytes(
    filepath: str,
    max_edge: int = 384,
    quality: int = 70
) -> Tuple[Optional[bytes], Optional[int], Optional[int], Optional[float]]:
    """
    Extracts a frame from video using ffmpeg or macOS qlmanage.
    Returns (webp_bytes, width, height, duration_seconds).
    100% read-only on the input file.
    """
    # 1. Try ffmpeg
    if shutil.which("ffmpeg"):
        for seek in ("0.5", "0.0"):
            try:
                cmd = [
                    "ffmpeg", "-ss", seek, "-i", filepath,
                    "-vframes", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"
                ]
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
                if proc.returncode == 0 and len(proc.stdout) > 100:
                    with Image.open(io.BytesIO(proc.stdout)) as img:
                        img = ImageOps.exif_transpose(img)
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                        w, h = img.size
                        buf = io.BytesIO()
                        img.save(buf, format="WEBP", quality=quality, method=4)

                        duration = None
                        if shutil.which("ffprobe"):
                            try:
                                probe_cmd = [
                                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", filepath
                                ]
                                probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
                                if probe_res.returncode == 0:
                                    duration = float(probe_res.stdout.decode().strip())
                            except Exception:
                                pass

                        return buf.getvalue(), w, h, duration
            except Exception:
                pass

    # 2. Try macOS qlmanage
    if sys.platform == "darwin" and shutil.which("qlmanage"):
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                subprocess.run(
                    ["qlmanage", "-t", "-s", str(max(max_edge, 512)), "-o", tmpdir, filepath],
                    capture_output=True,
                    timeout=15
                )
                for f in os.listdir(tmpdir):
                    if f.endswith(".png"):
                        png_path = os.path.join(tmpdir, f)
                        with Image.open(png_path) as img:
                            img = ImageOps.exif_transpose(img)
                            if img.mode != "RGB":
                                img = img.convert("RGB")
                            img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                            w, h = img.size
                            buf = io.BytesIO()
                            img.save(buf, format="WEBP", quality=quality, method=4)
                            return buf.getvalue(), w, h, None
            except Exception:
                pass

    return None, None, None, None
