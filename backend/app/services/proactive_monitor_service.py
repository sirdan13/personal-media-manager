import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.entities import Source, generate_uuid
from app.services.source_service import quick_verify_sources

_POLL_INTERVAL_SECONDS = 15
_LOCAL_VERIFY_EVERY_N_CYCLES = 4  # ~60s for always-online local folders

_LOCK = threading.Lock()
_STOP_EVENT = threading.Event()
_MONITOR_THREAD: Optional[threading.Thread] = None
_CYCLE_COUNTER = 0
_USER_EVENTS: Dict[str, deque] = {}


def _record_event(user_id: str, event: Dict[str, Any]) -> None:
    with _LOCK:
        if user_id not in _USER_EVENTS:
            _USER_EVENTS[user_id] = deque(maxlen=30)
        _USER_EVENTS[user_id].append(event)


def get_user_proactive_events(user_id: str, since_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with _LOCK:
        events = list(_USER_EVENTS.get(user_id, []))
    if not since_id:
        return events
    for idx, ev in enumerate(events):
        if ev["id"] == since_id:
            return events[idx + 1:]
    return events


def clear_proactive_events() -> None:
    with _LOCK:
        _USER_EVENTS.clear()


def run_proactive_check_cycle(db: Session, verify_local_folders: bool = False) -> Dict[str, Any]:
    """
    Single proactive check pass across all configured sources with a root_path:
    1. Detects offline -> online mount transitions (e.g. USB drive plugged in) and runs quick_verify_sources.
    2. Detects online -> offline unmount transitions.
    3. Optionally runs quick_verify_sources on always-online local_folder sources.
    """
    sources = db.query(Source).filter(
        Source.root_path.isnot(None),
        Source.source_type.in_(("external_drive", "local_folder", "network_share"))
    ).all()

    mounted_count = 0
    unmounted_count = 0
    verified_local_count = 0

    for s in sources:
        if s.status == "scanning":
            continue

        is_present = bool(s.root_path and os.path.isdir(s.root_path))

        # 1. Disk came online (offline -> online)
        if is_present and s.status == "offline":
            s.status = "online"
            db.commit()
            mounted_count += 1
            try:
                res = quick_verify_sources(db, s.user_id, source_id=s.id)
                _record_event(s.user_id, {
                    "id": generate_uuid(),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "event_type": "disk_connected",
                    "source_id": s.id,
                    "source_name": s.name,
                    "checked_files": res["checked_files"],
                    "newly_missing": res["newly_missing"],
                    "restored_available": res["restored_available"],
                    "orphan_media_count": res["orphan_media_count"],
                    "message": (
                        f"Disco '{s.name}' collegato e verificato: "
                        f"{res['checked_files']} file controllati"
                        + (f", {res['newly_missing']} eliminati rilevati" if res["newly_missing"] else "")
                        + (f", {res['restored_available']} ripristinati" if res["restored_available"] else "")
                        + "."
                    )
                })
            except Exception as e:
                print(f"Proactive verify error on mount for {s.name}: {e}")

        # 2. Disk went offline (online -> offline)
        elif not is_present and s.status == "online":
            s.status = "offline"
            db.commit()
            unmounted_count += 1
            _record_event(s.user_id, {
                "id": generate_uuid(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": "disk_disconnected",
                "source_id": s.id,
                "source_name": s.name,
                "checked_files": 0,
                "newly_missing": 0,
                "restored_available": 0,
                "orphan_media_count": 0,
                "message": f"Disco '{s.name}' scollegato (Offline)."
            })

        # 3. Periodic check on always-online local folders
        elif verify_local_folders and is_present and s.status == "online" and s.source_type == "local_folder":
            verified_local_count += 1
            try:
                res = quick_verify_sources(db, s.user_id, source_id=s.id)
                if res["newly_missing"] > 0 or res["restored_available"] > 0:
                    _record_event(s.user_id, {
                        "id": generate_uuid(),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "event_type": "external_changes_detected",
                        "source_id": s.id,
                        "source_name": s.name,
                        "checked_files": res["checked_files"],
                        "newly_missing": res["newly_missing"],
                        "restored_available": res["restored_available"],
                        "orphan_media_count": res["orphan_media_count"],
                        "message": (
                            f"Modifiche esterne su '{s.name}': "
                            f"{res['newly_missing']} file eliminati, {res['restored_available']} ripristinati."
                        )
                    })
            except Exception as e:
                print(f"Proactive local verify error on {s.name}: {e}")

    return {
        "mounted": mounted_count,
        "unmounted": unmounted_count,
        "verified_local": verified_local_count
    }


def _monitor_loop() -> None:
    global _CYCLE_COUNTER
    while not _STOP_EVENT.is_set():
        _STOP_EVENT.wait(_POLL_INTERVAL_SECONDS)
        if _STOP_EVENT.is_set():
            break
        _CYCLE_COUNTER += 1
        verify_local = (_CYCLE_COUNTER % _LOCAL_VERIFY_EVERY_N_CYCLES) == 0
        db = SessionLocal()
        try:
            run_proactive_check_cycle(db, verify_local_folders=verify_local)
        except Exception as e:
            print(f"Proactive monitor loop error: {e}")
        finally:
            db.close()


def start_proactive_monitor() -> None:
    global _MONITOR_THREAD
    if _MONITOR_THREAD and _MONITOR_THREAD.is_alive():
        return
    _STOP_EVENT.clear()
    _MONITOR_THREAD = threading.Thread(target=_monitor_loop, name="pmm-proactive-monitor", daemon=True)
    _MONITOR_THREAD.start()


def stop_proactive_monitor() -> None:
    _STOP_EVENT.set()
