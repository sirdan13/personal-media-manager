# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Personal Media Manager (Milestone 6: Ottimizzazione & Evoluzione)

> **ISTRUZIONI PER L'AGENTE ESECUTORE**:
> Sei incaricato di implementare in modo completo, incrementale e verificato tramite test questo piano operativo sul repository `/Users/daniele/projects/personal-media-manager`.
> - **Rispetta tassativamente la Politica 100% Read-Only sui file originali dell'utente**: non modificare, spostare o cancellare mai i file multimediali sorgente dell'utente. Tutte le operazioni avvengono esclusivamente sul database SQLite (`backend/data/personal_media_manager.db`) e sulla cartella interna delle miniature (`backend/data/thumbnails/`).
> - Procedi **una Fase alla volta (Fase 0 -> Fase 1 -> Fase 2 -> Fase 3 -> Fase 4)**. Al termine di ogni fase, esegui i test backend (`backend/venv/bin/pytest`) e il build frontend (`npm run build` in `frontend/`) prima di passare alla fase successiva.

---

## 1. CONTESTO E DIAGNOSI TECNICA GIÀ ACCERTATA (NON RIPETERE L'INDAGINE)

Dal primo test reale su un archivio iPhone (2.397 file fisici, 2.372 media logici, 1.894 miniature generate pari a 405 MB su disco) sono state già individuate le cause radice esatte:

1. **Bug "Falso WebP" (405 MB per 1.894 miniature, ~216,8 KB/file)**:
   - Il 100% dei 1.894 file salvati in `backend/data/thumbnails/*/*/*.webp` è in realtà codificato in **PNG lossless a 32-bit** (`\x89PNG\r\n\x1a\n`).
   - **Causa Frontend** (`frontend/src/features/scanner/thumbnailGenerator.ts`): su Safari/macOS WebKit, `canvas.toDataURL('image/webp', 0.75)` non è supportato e fa fallback silente a `data:image/png;base64,...`. Inoltre chiama inutilmente sia `canvas.toBlob` sia `canvas.toDataURL`.
   - **Causa Backend** (`backend/app/services/ingestion_service.py` -> `save_thumbnail`): rimuove il prefisso `data:...;base64,` e scrive i byte PNG grezzi direttamente in `{sha256}.webp` senza verificarli né convertirli con Pillow, salvando inoltre dimensioni fisse `width=384, height=256` nel DB.
   - **Soluzione Testata**: convertendo in vero WebP (`RGB`, `method=4`, `320px @ quality=65`), il peso medio scende da **216,8 KB a ~10,7 KB** (~20 MB totali invece di 405 MB, **-95% di spazio**).

2. **Inquinamento da file Sidecar iOS (`.aae`, `.dat`) e File di Sistema**:
   - Nel DB attuale sono presenti **337 file `.aae`** e **7 file `.dat`** catalogati erroneamente come `media_type = 'image'` perché `ingestion_service.py` riga 36 esegue `media_type = "video" if item.mime_type.startswith("video") else "image"`. Questo genera 344 card vuote in galleria.

3. **Assenza Miniature Video (`.mov` / `.mp4`) e Coppie Apple Live Photos**:
   - I **92 video** (`85 .mov`, `7 .mp4`) hanno `0` miniature.
   - **17 file `.mov`** condividono lo stesso prefisso di un file `.HEIC`/`.JPG` nella stessa cartella: sono **Apple Live Photos** che vanno collegate al media fotografico principale.

---

## 2. FASE 0 — MIGRAZIONE IMMEDIATA STORAGE & PULIZIA DB ESISTENTE (PRIORITÀ P0)

### Obiettivo
Ridurre immediatamente la cartella `backend/data/thumbnails/` da **405 MB a ~20 MB** convertendo in-place le 1.894 miniature in vero WebP (`320px`, `quality=65`), correggere `width`, `height`, `size_bytes` nella tabella `thumbnails` ed eliminare dal DB i 344 record sidecar `.aae` e `.dat`.

### Passi Operativi da Eseguire
1. Crea uno script riutilizzabile `backend/scripts/optimize_existing_storage.py` ed eseguilo con `backend/venv/bin/python backend/scripts/optimize_existing_storage.py`.
2. Lo script deve:
   - Fare una copia di backup `backend/data/personal_media_manager.db.bak` se non esiste già.
   - Iterare su tutti i record della tabella `thumbnails`:
     - Aprire il file in `backend/data/thumbnails/{storage_path}` con `PIL.Image.open()`.
     - Convertire in `"RGB"`, ridimensionare con `img.thumbnail((320, 320), Image.Resampling.LANCZOS)`.
     - Salvare in-place con `format="WEBP", quality=65, method=4`.
     - Aggiornare `width`, `height`, `size_bytes` e `format='webp'` nella tabella `thumbnails`.
   - Rimuovere dalla tabella `files` i record con `LOWER(extension) IN ('aae', 'dat', 'ds_store', 'db')` e cancellare dalla tabella `media` le entità rimaste con `0` file associati.
   - Eseguire `COMMIT` e `VACUUM` sul database SQLite.

### Criteri di Verifica (Fase 0)
- `du -sh backend/data/thumbnails` deve riportare **~18–25 MB** (contro i 401 MB iniziali).
- Tutti i 1.894 file `.webp` devono iniziare con i magic bytes `RIFF` e contenere `WEBP`.
- Nella tabella `files` devono risultare `0` file con estensione `aae` o `dat`.

---

## 3. FASE 1 — PIPELINE MINIATURE WEBP GARANTITA & PROFILI UTENTE (PRIORITÀ P0)

### Obiettivo
Impedire per sempre il salvataggio di PNG non compressi come `.webp`, introdurre i 3 profili di compressione configurabili (`compact`, `balanced`, `high`) e fornire un endpoint API + pulsante UI per ricomprimere le miniature on-demand.

### 3.1 Modifiche Backend
1. **Configurazione & Profili (`backend/app/core/config.py`)**:
   - Definisci i 3 profili:
     - `compact`: `max_edge = 240`, `quality = 55` (~6 KB/foto)
     - `balanced` (default): `max_edge = 320`, `quality = 65` (~11 KB/foto)
     - `high`: `max_edge = 384`, `quality = 75` (~18 KB/foto)
2. **Modello Database (`backend/app/models/entities.py`)**:
   - In `User`: aggiungi `thumbnail_profile = Column(String(20), nullable=False, default="balanced")`.
   - Assicurati che all'avvio (`backend/app/main.py` o migration helper) venga eseguito un check `ALTER TABLE users ADD COLUMN thumbnail_profile VARCHAR(20) NOT NULL DEFAULT 'balanced'` se la colonna non esiste già su SQLite.
3. **Validazione e Ricodifica WebP Lato Server (`backend/app/services/ingestion_service.py`)**:
   - Modifica `save_thumbnail(db, media_id, sha256, thumbnail_base64, profile="balanced")`:
     - Decodifica il base64, aprilo con `PIL.Image.open(io.BytesIO(raw_bytes))`.
     - Applica `ImageOps.exif_transpose(img)` e converti sempre in `"RGB"`.
     - Ridimensiona a `(max_edge, max_edge)` con `Image.Resampling.LANCZOS` in base al `thumbnail_profile` dell'utente.
     - Codifica in buffer `io.BytesIO()` con `format="WEBP", quality=quality, method=4`.
     - Salva su disco e registra nella tabella `Thumbnail` i valori **reali** di `width = img.width`, `height = img.height` e `size_bytes = len(webp_bytes)`.
4. **Nuovi Endpoint Storage & Compattazione (`backend/app/api/v1/`)**:
   - `GET /api/v1/settings/storage`: restituisce `{ "thumbnail_profile": user.thumbnail_profile, "thumbnails_count": ..., "total_Bytes": ..., "avg_kb": ... }`.
   - `PUT /api/v1/settings/storage`: aggiorna `user.thumbnail_profile` (`compact` | `balanced` | `high`).
   - `POST /api/v1/settings/storage/compact`: ricomprime le miniature esistenti dell'utente secondo il profilo attivo e restituisce `{ "compacted_count": ..., "before_bytes": ..., "after_bytes": ... }`.

### 3.2 Modifiche Frontend & Agente CLI
1. **Fix Safari/WebKit in `frontend/src/features/scanner/thumbnailGenerator.ts`**:
   - Imposta di default `MAX_THUMBNAIL_EDGE = 320` e `THUMBNAIL_QUALITY = 0.65` (o leggi dal profilo salvato).
   - In `canvasToThumbnail()`: rimuovi la doppia chiamata `toBlob` + `toDataURL`. Chiama `let dataUrl = canvas.toDataURL('image/webp', quality)`. Se `dataUrl.startsWith('data:image/png')` (fallback Safari/WebKit), chiama immediatamente `dataUrl = canvas.toDataURL('image/jpeg', quality)` così il payload inviato al backend è leggero (~15 KB invece di 220 KB) e il backend lo convertirà in WebP reale.
2. **UI Impostazioni (`frontend/src/features/settings/SettingsView.tsx`)**:
   - Aggiungi una sezione **"Ottimizzazione Miniature & Storage"** con:
     - Selettore profilo: *Compressione Massima (240px)*, *Bilanciata (320px - Consigliato)*, *Alta Risoluzione (384px)*.
     - Statistiche reali dello spazio occupato dalle miniature (MB totali, media KB per foto).
     - Pulsante **"Ricompatta Miniature Esistenti"** che chiama `POST /api/v1/settings/storage/compact` e mostra il risparmio ottenuto.
3. **Agente CLI (`agent/scanner_agent.py`)**:
   - Aggiorna `THUMBNAIL_MAX_DIMENSION = 320` e `quality=65` (con flag CLI `--thumb-profile {compact,balanced,high}`).

### Criteri di Verifica (Fase 1)
- Test automatico in `backend/app/tests/` che invia a `process_scan_batch` una miniatura codificata come `data:image/png;base64,...` e verifica che il file salvato su disco sia un **vero WebP** (`RIFF....WEBP`) con dimensioni reali e peso ridotto.

---

## 4. FASE 2 — ECOSISTEMA APPLE: SIDECAR `.AAE`, LIVE PHOTOS & MINIATURE VIDEO (PRIORITÀ P1)

### Obiettivo
Gestire nativamente gli archivi iPhone/iOS ignorando o associando i file `.AAE`, unificando le coppie **Live Photo (`HEIC/JPG` + `MOV`)** e garantendo l'estrazione delle miniature video.

### 4.1 Modifiche Backend, Scanner Browser & Agente CLI
1. **Filtro Sidecar e File di Sistema**:
   - In `frontend/src/features/scanner/formatDetector.ts` e `directoryTraverser.ts`: assicurati che file che iniziano con `.` (`._*`, `.DS_Store`) e cartelle `@eaDir`, `.Spotlight-V100`, `.Trashes` siano sempre ignorati.
   - Riconosci `.aae` come sidecar: durante la traversata della directory, se esiste `IMG_XXXX.AAE` accanto a `IMG_XXXX.HEIC`/`.JPG`, aggiungi `has_apple_edits: true` nei metadati della foto principale e **non** inviare il file `.aae` come media autonomo.
   - In `backend/app/services/ingestion_service.py`: aggiungi una guardia iniziale che scarta qualsiasi item con estensione in `{"aae", "dat", "ds_store", "db", "ini", "thm"}` evitando che finisca mai nella tabella `media`.
2. **Accoppiamento Automatico Apple Live Photos**:
   - Schema DB (`backend/app/models/entities.py` + `ALTER TABLE` automatico all'avvio):
     - Aggiungi a `Media`:
       - `is_live_photo = Column(Integer, nullable=False, default=0)`
       - `live_video_media_id = Column(String(36), ForeignKey("media.id", ondelete="SET NULL"), nullable=True)`
   - Logica di accoppiamento (`link_live_photos` in `ingestion_service.py` + eseguita retroattivamente sul DB esistente):
     - Quando in una stessa `source_id` e stessa cartella (`os.path.dirname(relative_path)`) esistono un'immagine (`.heic`, `.jpg`, `.jpeg`) e un video `.mov` con lo stesso nome base (`os.path.splitext(filename)[0].upper()`), imposta sull'entità `Media` dell'immagine `is_live_photo = 1` e `live_video_media_id = video_media.id`.
   - Aggiorna `MediaOut` e `MediaDetailOut` (`backend/app/schemas/media.py` e `media_service.py`) per esporre `is_live_photo: bool` e `live_video_id: Optional[str]`.
   - Nella UI (`LibraryView.tsx` e `MediaDetailModal.tsx`), mostra un badge **`LIVE`** sulle foto con `is_live_photo = true`.
3. **Generazione Miniature Video (`.MOV` / `.MP4`)**:
   - **Frontend (`thumbnailGenerator.ts` -> `generateVideoThumbnail`)**:
     - Usa `video.onloadedmetadata` per fare seek a `Math.min(0.5, (video.duration || 1) * 0.1)`, aumenta il timeout da `3000ms` a `6000ms` e gestisci correttamente il caso in cui `video.duration` sia `Infinity` o `0`.
   - **Agente CLI (`agent/scanner_agent.py`)**:
     - Aggiungi `extract_video_metadata_and_thumb(filepath)` usando `ffmpeg` (se presente nel `PATH` di sistema tramite `subprocess.run`) per estrarre 1 frame a `0.5s` in pipe verso Pillow e convertirlo in WebP `320px @ q=65`.

### Criteri di Verifica (Fase 2)
- Eseguendo il pairing retroattivo sul DB attuale, le **17 coppie `HEIC/JPG + MOV`** dell'archivio iPhone risultano marcate con `is_live_photo = 1`.
- L'ingestione di un batch contenente un file `.aae` non crea alcun record `Media` per il `.aae`.

---

## 5. FASE 3 — DEDUPLICAZIONE AVANZATA: EXPORT CSV/JSON & PERCEPTUAL HASHING `dHash` (PRIORITÀ P2)

### Obiettivo
Fornire report esportabili (CSV/JSON) per la pulizia manuale sicura dei duplicati esatti e introdurre il rilevamento di **foto simili / scatti a raffica** tramite `dHash` a 64-bit.

### 5.1 Modifiche Schema & Backend
1. **Colonna `dhash` su `Media` (`backend/app/models/entities.py`)**:
   - Aggiungi `dhash = Column(String(16), nullable=True, index=True)` alla tabella `media` (con migrazione automatica `ALTER TABLE media ADD COLUMN dhash VARCHAR(16)`).
2. **Calcolo Automatico `dHash` (64-bit Difference Hash)**:
   - Implementa una funzione pura Python con Pillow `compute_dhash(img: Image.Image) -> str`:
     - Ridimensiona l'immagine (o la miniatura) a `(9, 8)` in scala di grigi (`img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)`).
     - Confronta ogni pixel `(x, y)` con `(x+1, y)` per `x in range(8)` e `y in range(8)`, componendo un intero a 64 bit formattato come stringa esadecimale a 16 caratteri (`f"{val:016x}"`).
   - Calcola `dhash` automaticamente dentro `save_thumbnail()` durante ogni nuova scansione **e** popola retroattivamente il `dhash` per tutte le 1.894 miniature già presenti su disco!
3. **Nuovi Endpoint API (`backend/app/api/v1/`)**:
   - `GET /api/v1/media/duplicates/export?format=csv|json&preferred_source_id=...`:
     - Restituisce il report scaricabile di tutti i gruppi di duplicati esatti con colonne: `group_sha256, media_id, file_id, source_name, source_status, relative_path, filename, size_bytes, recommended_action` (`KEEP` per la prima copia/fonte preferita, `REDUNDANT_COPY` per le altre).
   - `GET /api/v1/media/similar?max_distance=6`:
     - Confronta i `Media` dell'utente aventi `dhash IS NOT NULL` e `canonical_sha256` differente, raggruppando quelli con distanza di Hamming `bin(int(h1, 16) ^ int(h2, 16)).count("1") <= max_distance`. Restituisce i gruppi di foto simili con percentuale di similarità `round((64 - dist) / 64 * 100, 1)`.

### 5.2 Modifiche Frontend (`frontend/src/features/duplicates/DuplicatesView.tsx`)
- Aggiungi in alto la barra azioni con:
  - Riepilogo **Spazio Totale Recuperabile** (in MB/GB).
  - Pulsanti **"Esporta Report CSV"** e **"Esporta Report JSON"**.
  - Switch / Tab tra **"Duplicati Esatti (SHA-256)"** e **"Foto Simili / Raffiche (dHash)"** con visualizzazione affiancata delle foto simili e badge di percentuale somiglianza.

### Criteri di Verifica (Fase 3)
- Tutte le 1.894 foto con miniatura nel DB possiedono un valore `dhash` valido a 16 caratteri hex.
- Gli endpoint `/api/v1/media/duplicates/export?format=csv` e `/api/v1/media/similar` rispondono con HTTP 200 e sono coperti da test `pytest`.

---

## 6. FASE 4 — ESPLORAZIONE AVANZATA: TIMELINE, MAPPA GPS & ALBUM/TAG (PRIORITÀ P3)

### Obiettivo
Arricchire l'esplorazione del catalogo con raggruppamento temporale (Anno/Mese), Mappa GPS interattiva (dai metadati EXIF già estratti) e Album/Tag virtuali multi-disco senza spostare i file fisici.

### 6.1 Modifiche Schema & Backend
1. **Coordinate GPS su `Media` e Backfill dai Metadati Esistenti**:
   - Aggiungi `latitude = Column(Float, nullable=True)` e `longitude = Column(Float, nullable=True)` al modello `Media` (con `ALTER TABLE`).
   - Esegui uno script/funzione di backfill che legge `metadata_json` dalla tabella `files` (dove sono già presenti 193 foto con `latitude` e `longitude` dell'archivio iPhone!) e popola `media.latitude` e `media.longitude`.
   - Aggiorna `process_scan_batch` in `ingestion_service.py` e `scanner_agent.py` (parsing `GPSInfo` EXIF) affinché `latitude` e `longitude` vengano sempre copiati su `Media`.
2. **Modelli `Album`, `AlbumMedia`, `Tag`, `MediaTag` (`backend/app/models/entities.py`)**:
   - Crea le tabelle su SQLite tramite `Base.metadata.create_all(bind=engine)`:
     - `albums` (`id`, `user_id`, `name`, `description`, `created_at`)
     - `album_media` (`id`, `album_id`, `media_id`, `added_at`)
     - `tags` (`id`, `user_id`, `name`, `color`)
     - `media_tags` (`id`, `media_id`, `tag_id`)
3. **Nuovi Endpoint API**:
   - `GET /api/v1/media/timeline`: restituisce i bucket `{ "month_key": "YYYY-MM", "year": YYYY, "month": MM, "count": N }` ordinati cronologicamente.
   - `GET /api/v1/media/map`: restituisce tutti i media dell'utente con `latitude IS NOT NULL AND longitude IS NOT NULL` (`id`, `latitude`, `longitude`, `primary_filename`, `captured_at`, `has_thumbnail`, `media_type`).
   - CRUD completo per `/api/v1/albums` (creazione album, aggiunta/rimozione media, filtro `album_id` in `GET /api/v1/media`) e `/api/v1/tags` (creazione tag, assegnazione tag a un media, filtro `tag_id` in `GET /api/v1/media`).

### 6.2 Modifiche Frontend
1. **Vista Timeline & Filtri Album/Tag in `LibraryView.tsx`**:
   - Aggiungi il toggle di visualizzazione **"Griglia" | "Timeline (Anno/Mese)"** che raggruppa le foto sotto intestazioni per mese/anno (es. *Agosto 2025 — 310 media*).
   - Aggiungi barra filtro per **Album** e **Tag** e possibilità di creare un nuovo Album o aggiungere un Tag dentro `MediaDetailModal.tsx`.
2. **Vista Mappa GPS (`frontend/src/features/map/MapView.tsx` o tab dedicato)**:
   - Aggiungi una vista Mappa Interattiva (utilizzando `leaflet` via CDN CSS/JS leggero o componente React dedicato con tile OpenStreetMap/CartoDB Dark) che mostra i pin geolocalizzati delle foto dell'utente, raggruppati per vicinanza, con miniatura cliccabile nel popup che apre `MediaDetailModal`.

### Criteri di Verifica Finale (End-to-End)
- [ ] Tutti i test esistenti e i nuovi test in `backend/app/tests/` passano al 100% (`pytest`).
- [ ] Il build TypeScript e Vite (`cd frontend && npm run build`) compila con zero errori.
- [ ] Lo spazio su disco di `backend/data/thumbnails/` è inferiore a **25 MB** (risparmio > 94% rispetto ai 405 MB iniziali).
- [ ] Le 193 foto geolocalizzate dell'archivio iPhone compaiono correttamente nell'endpoint `/api/v1/media/map`.
