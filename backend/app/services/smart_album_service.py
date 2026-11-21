import os
import hashlib
import json
import re
from typing import List, Dict, Any, Optional, Tuple
from collections import Counter
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from app.models.entities import Media, File, Thumbnail, Album, AlbumMedia, Tag, MediaTag
from app.services.ai_provider import run_ai_json, AIProviderError, AIQuotaExceeded

ITALIAN_MONTHS = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
]

def _clean_tag(text: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[\s_]+", "-", cleaned)[:30]

def detect_events(
    db: Session,
    user_id: str,
    min_media: int = 15,
    gap_hours: int = 36
) -> List[Dict[str, Any]]:
    """
    Groups user media into temporal/spatial clusters (events) separated by > gap_hours.
    Excludes Live Photo secondary videos and already-covered events.
    """
    # 1. Live photo secondary videos
    secondary_video_ids = [
        r[0] for r in db.query(Media.live_video_media_id).filter(
            Media.user_id == user_id,
            Media.live_video_media_id.isnot(None)
        ).all() if r[0]
    ]

    # 2. Query media with captured_at not null, having at least one active file
    active_media_ids = [
        r[0] for r in db.query(File.media_id).filter(
            File.availability_status.notin_(("missing", "trashed"))
        ).distinct().all()
    ]

    query = db.query(Media).filter(
        Media.user_id == user_id,
        Media.captured_at.isnot(None),
        Media.id.in_(active_media_ids)
    )
    if secondary_video_ids:
        query = query.filter(Media.id.notin_(secondary_video_ids))

    medias = query.order_by(Media.captured_at.asc()).all()

    if not medias:
        return []

    # 3. Cluster media by time gap
    clusters: List[List[Media]] = []
    current_cluster: List[Media] = []

    for m in medias:
        if not current_cluster:
            current_cluster.append(m)
        else:
            prev = current_cluster[-1]
            diff_hours = (m.captured_at - prev.captured_at).total_seconds() / 3600.0
            if diff_hours > gap_hours:
                if len(current_cluster) >= min_media:
                    clusters.append(current_cluster)
                current_cluster = [m]
            else:
                current_cluster.append(m)

    if len(current_cluster) >= min_media:
        clusters.append(current_cluster)

    if not clusters:
        return []

    # Gather thumbnails for covers
    all_cluster_media_ids = [m.id for c in clusters for m in c]
    thumbs = db.query(Thumbnail.media_id).filter(
        Thumbnail.media_id.in_(all_cluster_media_ids)
    ).all()
    thumb_media_set = {t[0] for t in thumbs}

    # Fetch relative paths for top folders
    files = db.query(File.media_id, File.relative_path).filter(
        File.media_id.in_(all_cluster_media_ids),
        File.availability_status.notin_(("missing", "trashed"))
    ).all()
    folders_by_media: Dict[str, str] = {}
    for mid, rel_p in files:
        if rel_p and mid not in folders_by_media:
            clean_p = rel_p.replace("\\", "/").strip("/")
            parent_dir = os.path.basename(os.path.dirname(clean_p))
            if parent_dir and parent_dir != ".":
                folders_by_media[mid] = parent_dir

    events = []
    for c in clusters:
        first_m = c[0]
        last_m = c[-1]
        c_media_ids = [m.id for m in c]
        total_count = len(c_media_ids)

        # Coverage check: check if >= 80% already in an existing Album
        album_overlap = db.query(
            AlbumMedia.album_id,
            func.count(AlbumMedia.media_id)
        ).join(Album, AlbumMedia.album_id == Album.id).filter(
            Album.user_id == user_id,
            AlbumMedia.media_id.in_(c_media_ids)
        ).group_by(AlbumMedia.album_id).all()

        is_covered = any(cnt >= 0.8 * total_count for _, cnt in album_overlap)
        if is_covered:
            continue

        event_id = hashlib.sha1(f"{first_m.id}|{last_m.id}".encode("utf-8")).hexdigest()[:12]

        # Top places
        places = [m.place_name for m in c if m.place_name and m.place_name.strip()]
        place_counts = Counter(places).most_common(3)
        top_places = [{"place_name": name, "count": cnt} for name, cnt in place_counts]

        # Top folders
        folders = [folders_by_media[m.id] for m in c if m.id in folders_by_media]
        folder_counts = Counter(folders).most_common(3)
        top_folders = [{"folder": name, "count": cnt} for name, cnt in folder_counts]

        # Cover media
        cover_id = next((m.id for m in c if m.id in thumb_media_set), first_m.id)

        events.append({
            "event_id": event_id,
            "start": first_m.captured_at.isoformat(),
            "end": last_m.captured_at.isoformat(),
            "media_count": total_count,
            "top_places": top_places,
            "top_folders": top_folders,
            "cover_media_id": cover_id,
            "media_ids": c_media_ids
        })

    return events

def generate_heuristic_album_info(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates sensible fallback name, description, and tags based on dates and places.
    """
    start_dt = datetime.fromisoformat(event["start"])
    end_dt = datetime.fromisoformat(event["end"])
    month_name = ITALIAN_MONTHS[start_dt.month - 1]
    year = start_dt.year

    top_places = event.get("top_places", [])
    primary_place = top_places[0]["place_name"] if top_places else None

    if primary_place:
        suggested_name = f"{primary_place} — {month_name} {year}"
        tags = [_clean_tag(primary_place)]
    else:
        suggested_name = f"Evento del {start_dt.day} {month_name} {year}"
        tags = []

    suggested_description = (
        f"Raccolta di {event['media_count']} foto scattate tra il "
        f"{start_dt.strftime('%d/%m/%Y')} e il {end_dt.strftime('%d/%m/%Y')}."
    )

    return {
        "suggested_name": suggested_name,
        "suggested_description": suggested_description,
        "suggested_tags": tags
    }

def suggest_smart_albums(
    db: Session,
    user_id: str,
    use_ai: bool = True,
    min_media: int = 15
) -> Dict[str, Any]:
    """
    Discovers candidate events and suggests names/descriptions/tags.
    Never sends images to AI (text-only metadata).
    """
    events = detect_events(db, user_id, min_media=min_media, gap_hours=36)
    if not events:
        return {"engine": "heuristic", "ai_error": None, "events": []}

    # Add heuristic defaults
    heuristic_map = {}
    for ev in events:
        heuristic_map[ev["event_id"]] = generate_heuristic_album_info(ev)

    if not use_ai:
        res_events = []
        for ev in events:
            h_info = heuristic_map[ev["event_id"]]
            ev_copy = dict(ev)
            ev_copy.pop("media_ids", None)
            ev_copy.update(h_info)
            res_events.append(ev_copy)
        return {"engine": "heuristic", "ai_error": None, "events": res_events}

    # AI flow (max 40 events in 1 call, text only)
    events_to_query = events[:40]
    compact_events = []
    for ev in events_to_query:
        compact_events.append({
            "event_id": ev["event_id"],
            "start": ev["start"],
            "end": ev["end"],
            "media_count": ev["media_count"],
            "top_places": [p["place_name"] for p in ev.get("top_places", [])],
            "top_folders": [f["folder"] for f in ev.get("top_folders", [])]
        })

    system_prompt = (
        "Sei un assistente per la gestione di gallerie fotografiche personali. "
        "Dato un elenco di eventi (con date, luoghi, cartelle e numero di scatti), proponi per ciascuno "
        "un titolo accattivante e naturale in italiano ('name', tra 3 e 80 caratteri), una breve descrizione "
        "('description') e da 1 a 4 tag brevi pertinenti ('tags', ciascuno tra 2 e 30 caratteri in minuscolo). "
        "Rispetta rigorosamente gli event_id forniti."
    )
    user_prompt = f"Proponi titoli e tag per questi eventi fotografici:\n{json.dumps(compact_events, ensure_ascii=False)}"

    schema = {
        "type": "object",
        "properties": {
            "albums": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "event_id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "tags": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["event_id", "name", "description", "tags"]
                }
            }
        },
        "required": ["albums"]
    }

    ai_error_msg = None
    ai_res = None
    try:
        ai_res = run_ai_json(
            db=db,
            user_id=user_id,
            feature="smart_albums",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema
        )
    except Exception as e:
        ai_error_msg = str(e)

    ai_albums_map = {}
    if ai_res and isinstance(ai_res.data, dict):
        raw_albums = ai_res.data.get("albums", [])
        for alb in raw_albums:
            eid = alb.get("event_id")
            name = alb.get("name", "").strip()
            desc = alb.get("description", "").strip()
            tags = alb.get("tags", [])
            if eid and 3 <= len(name) <= 80:
                valid_tags = [_clean_tag(t) for t in tags if isinstance(t, str) and 2 <= len(t) <= 30][:5]
                ai_albums_map[eid] = {
                    "suggested_name": name,
                    "suggested_description": desc,
                    "suggested_tags": valid_tags
                }

    res_events = []
    valid_ai_count = 0
    for ev in events:
        eid = ev["event_id"]
        ev_copy = dict(ev)
        ev_copy.pop("media_ids", None)
        if eid in ai_albums_map:
            ev_copy.update(ai_albums_map[eid])
            valid_ai_count += 1
        else:
            ev_copy.update(heuristic_map[eid])
        res_events.append(ev_copy)

    engine_used = (ai_res.provider or "ai") if valid_ai_count > 0 else "heuristic"
    return {
        "engine": engine_used,
        "ai_error": ai_error_msg,
        "events": res_events
    }

def create_smart_album(
    db: Session,
    user_id: str,
    event_id: str,
    name: str,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    min_media: int = 15
) -> Dict[str, Any]:
    """
    Finds the event by event_id, creates Album, associates AlbumMedia, and creates/assigns Tags.
    """
    events = detect_events(db, user_id, min_media=min_media, gap_hours=36)
    target_event = next((ev for ev in events if ev["event_id"] == event_id), None)
    if not target_event:
        raise HTTPException(status_code=404, detail="Evento non più valido o scaduto")

    media_ids = target_event["media_ids"]

    # Create Album
    album = Album(
        user_id=user_id,
        name=name.strip(),
        description=description.strip() if description else None
    )
    db.add(album)
    db.flush()

    # Add AlbumMedia
    for mid in media_ids:
        db.add(AlbumMedia(album_id=album.id, media_id=mid))

    # Add Tags
    tags_applied_count = 0
    if tags:
        for tag_str in tags:
            tag_name = tag_str.strip().lower()
            if not tag_name:
                continue
            # Find or create Tag
            tag = db.query(Tag).filter(Tag.user_id == user_id, Tag.name == tag_name).first()
            if not tag:
                tag = Tag(user_id=user_id, name=tag_name)
                db.add(tag)
                db.flush()

            for mid in media_ids:
                existing_mt = db.query(MediaTag).filter(
                    MediaTag.media_id == mid,
                    MediaTag.tag_id == tag.id
                ).first()
                if not existing_mt:
                    db.add(MediaTag(media_id=mid, tag_id=tag.id))
            tags_applied_count += 1

    db.commit()

    return {
        "album_id": album.id,
        "added_count": len(media_ids),
        "tags_applied": tags_applied_count
    }
