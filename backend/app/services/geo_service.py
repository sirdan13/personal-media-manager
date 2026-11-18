from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.entities import Media

try:
    import reverse_geocoder as rg
    HAS_RG = True
except ImportError:
    HAS_RG = False

def init_geo_places_cache(engine):
    """Creates cache table for reverse-geocoded coordinates."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS geo_places (
                coord_key VARCHAR(50) PRIMARY KEY,
                place_name VARCHAR(255) NOT NULL,
                city VARCHAR(100),
                country VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

def coord_to_key(lat: float, lon: float) -> str:
    """Rounds coordinates to ~1km precision (2 decimals) for cache pooling."""
    return f"{lat:.2f},{lon:.2f}"

def resolve_and_cache_place(db: Session, lat: float, lon: float) -> Optional[str]:
    """Resolves coordinates offline with reverse_geocoder (instant and 100% private)."""
    if not HAS_RG:
        return None

    key = coord_to_key(lat, lon)
    cached = db.execute(text("SELECT place_name FROM geo_places WHERE coord_key = :k"), {"k": key}).fetchone()
    if cached:
        return cached[0]

    try:
        results = rg.search([(lat, lon)], verbose=False)
        if results and len(results) > 0:
            res = results[0]
            city = res.get('name')
            admin2 = res.get('admin2')
            admin1 = res.get('admin1')
            cc = res.get('cc')
            
            parts = []
            if city: parts.append(city)
            if admin2 and admin2 != city: parts.append(admin2)
            elif admin1 and admin1 != city: parts.append(admin1)
            if cc: parts.append(cc)
            
            place_name = ", ".join(parts) if parts else city
            if place_name:
                db.execute(text("INSERT OR REPLACE INTO geo_places (coord_key, place_name, city, country) VALUES (:k, :p, :c, :cc)"),
                           {"k": key, "p": place_name, "c": city, "cc": cc})
                db.commit()
                return place_name
    except Exception as e:
        print(f"Offline geocode error for {lat},{lon}: {e}")
    return None

def backfill_all_media_places(db: Session) -> int:
    """Instantly resolves and sets place_name for all GPS photos in batch."""
    if not HAS_RG:
        return 0

    items = db.query(Media).filter(
        Media.latitude.isnot(None),
        Media.longitude.isnot(None),
        Media.place_name.is_(None)
    ).all()

    if not items:
        return 0

    coords: List[Tuple[float, float]] = [(m.latitude, m.longitude) for m in items]
    try:
        results = rg.search(coords, verbose=False)
        updated = 0
        for m, res in zip(items, results):
            city = res.get('name')
            admin2 = res.get('admin2')
            admin1 = res.get('admin1')
            cc = res.get('cc')

            parts = []
            if city: parts.append(city)
            if admin2 and admin2 != city: parts.append(admin2)
            elif admin1 and admin1 != city: parts.append(admin1)
            if cc: parts.append(cc)

            place_name = ", ".join(parts) if parts else city
            if place_name:
                m.place_name = place_name
                updated += 1

        db.commit()
        return updated
    except Exception as e:
        print(f"Batch geocode error: {e}")
        return 0
