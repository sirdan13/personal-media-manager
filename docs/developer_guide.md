# Guida per Sviluppatori — Personal Media Manager

Questo documento serve come mappa tecnica rapida per modificare, estendere e testare il software senza dover riscansionare l'intera codebase.

---

## 1. Stack Tecnologico

| Layer | Tecnologie | Entry Point |
| :--- | :--- | :--- |
| **Backend** | Python 3, FastAPI, SQLAlchemy 2, Pydantic v2, SQLite (WAL) | `backend/app/main.py` |
| **Frontend** | React 19, TypeScript 5.7, Vite 6, Lucide Icons, Leaflet, `exifr`, `hash-wasm` | `frontend/src/App.tsx` |
| **Agente CLI** | Python 3, Pillow, Requests | `agent/scanner_agent.py` |
| **Packaging** | Docker multi-stage + Nginx, script macOS `.command` / `.app` | `docker-compose.yml`, `start_app.command` |

---

## 2. Mappa della Codebase

### Backend (`backend/app/`)
- **`core/config.py`**: impostazioni Pydantic (`Settings`), percorsi default (`STORAGE_DIR`, `DATABASE_URL`, `THUMBNAILS_DIR`), profili miniature, CORS, parametri AI (`GEMINI_API_KEY`, `AI_CACHE_TTL_DAYS`).
- **`core/database.py`**: engine SQLite con `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `SessionLocal`, `get_db()`, e **`run_db_migrations(engine)`** per migrazioni non distruttive `ALTER TABLE` all'avvio.
- **`core/security.py`**: hashing password (`bcrypt`) e JWT (`pyjwt`).
- **`models/entities.py`**: modelli ORM SQLAlchemy (`User`, `Device`, `Source`, `Media`, `File`, `Thumbnail`, `ScanJob`, `ScanHistory`, `Album`, `AlbumMedia`, `Tag`, `MediaTag`, `AISettings`, `AIUsage`, `AICache`).
- **`schemas/`**: contratti Pydantic per request/response (`user.py`, `source.py`, `scan.py`, `media.py`, `album_tag.py`).
- **`api/v1/`**: router REST montati sotto `/api/v1` via `router.py`:
  - `auth.py`, `sources.py`, `scans.py`, `media.py`, `duplicates.py`, `albums.py`, `tags.py`, `ai.py`, `settings.py`.
- **`services/`**: logica di business separata dai router:
  - `auth_service.py`: registrazione, login, token.
  - `source_service.py`: CRUD fonti, verifica rapida, riconciliazione, confronto drive e copia backup verificata SHA-256.
  - `scan_service.py` & `ingestion_service.py`: ciclo di vita `ScanJob`, recovery scansioni interrotte (`recover_stale_scans`), ingestione batch idempotente e deduplicazione su `canonical_sha256`.
  - `local_scanner_service.py`: scansione lato server su filesystem locale.
  - `media_service.py` & `media_preview_service.py`: query galleria/timeline/mappa, estrazione preview RAW/HD, streaming.
  - `trash_service.py`: cestino reversibile su disco, ripristino, svuotamento, pulizia orfani.
  - `dhash_service.py`: calcolo e confronto similarità percettiva (dHash).
  - `geo_service.py`: reverse geocoding offline (`reverse_geocoder`) con cache.
  - `proactive_monitor_service.py`: thread background per mount USB e modifiche cartelle locali (emette eventi SSE).
  - `ai_provider.py`, `folder_advisor_service.py`, `smart_album_service.py`, `best_shot_service.py`, `curation_heuristics.py`: integrazione AI (`none` / `gemini` / `ollama`) con cache e tetto giornaliero.

### Frontend (`frontend/src/`)
- **`services/api.ts`**: client REST centralizzato con gestione token JWT e tipi TypeScript.
- **`context/ToastContext.tsx`**: notifiche toast globali.
- **`components/`**: `Sidebar.tsx`, `Topbar.tsx`, `TutorialModal.tsx`.
- **`features/`**:
  - `auth/AuthModal.tsx`
  - `dashboard/DashboardView.tsx`
  - `library/LibraryView.tsx` & `MediaDetailModal.tsx` (griglia zoomabile, lista file 200/pagina, marquee drag, context menu)
  - `albums/AlbumsView.tsx`
  - `map/MapView.tsx`
  - `duplicates/DuplicatesView.tsx`
  - `sources/SourcesView.tsx`
  - `scans/ScansView.tsx`
  - `scanner/` (`scannerEngine.ts`, `directoryTraverser.ts`, `chunkHasher.ts`, `metadataExtractor.ts`, `thumbnailGenerator.ts`, `formatDetector.ts`, `benchmarkRunner.ts`)
  - `settings/SettingsView.tsx`

---

## 3. Come Aggiungere una Nuova Funzionalità (Checklist Standard)

Per estendere il software mantenendo coerenza architetturale:

1. **Database (`models/entities.py` + `core/database.py`)**:
   - Aggiungi la tabella o colonna nel modello ORM.
   - Se aggiungi una colonna a una tabella esistente, aggiungi il relativo controllo `PRAGMA table_info(...)` + `ALTER TABLE` dentro `run_db_migrations(engine)` in `backend/app/core/database.py`.
2. **Contratti (`schemas/`)**:
   - Definisci o aggiorna gli schemi Pydantic in `backend/app/schemas/`.
3. **Logica (`services/`)**:
   - Implementa la logica di business nel servizio dedicato filtrando **sempre** per `user_id` (isolamento multi-tenant).
4. **API (`api/v1/`)**:
   - Esponi l'endpoint nel router appropriato usando `Depends(get_current_user)` e `Depends(get_db)`. Se crei un nuovo file router, registralo in `backend/app/api/v1/router.py`.
5. **Frontend (`services/api.ts` + `features/`)**:
   - Aggiungi i metodi e i tipi in `frontend/src/services/api.ts`.
   - Aggiorna la feature esistente o aggiungine una nuova collegandola in `App.tsx` e `Sidebar.tsx`.
6. **Build Self-Contained**:
   - Se usi `start_app.command` (porta `8089`), ricordati di ricompilare `frontend/dist` con `npm --prefix frontend run build` dopo modifiche al frontend.
7. **Test**:
   - Aggiungi un test in `backend/app/tests/` e verifica sia backend che build frontend.

---

## 4. Comandi Utili di Sviluppo e Test

### Test Backend (Pytest)
```bash
PYTHONPATH=backend:. backend/venv/bin/pytest backend/app/tests -v
```
La suite comprende 22 file di test in `backend/app/tests/` (autenticazione, ingestione, duplicati, agente CLI, fasi 1–14).
Nota: durante i test pytest, `PYTEST_CURRENT_TEST` è impostato e `backend/app/main.py` disattiva automaticamente `recover_stale_scans` e `proactive_monitor_service` nel `lifespan`.

### Verifica Tipi & Build Frontend
```bash
cd frontend
npm run build
```

### Esecuzione Agente Headless CLI
```bash
./agent/scanner_agent.py \
  --server http://localhost:8000 \
  --email demo@example.com \
  --password demo123456 \
  --source-name "NAS Archivio" \
  --path /Volumes/PhotoArchive
```
