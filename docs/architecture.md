# Architettura di Sistema - Personal Media Manager

## 1. Visione e Principi Guida

**Personal Media Manager** è una piattaforma per la catalogazione centralizzata, l'esplorazione e l'individuazione dei duplicati di fotografie e video distribuiti su molteplici dispositivi, dischi fisici esterni, schede SD e cartelle di backup.

### Principi Fondamentali:
1. **Centralizzare i metadati, non i file originali**: I contenuti originali rimangono intatti e al loro posto fisico sui rispettivi supporti (salvo azioni esplicite e reversibili dell'utente come il Cestino sicuro o la Copia Backup verificata con SHA-256).
2. **Sicurezza sui File Originali**: Nessuna modifica o eliminazione automatica non richiesta. Le operazioni sul disco avvengono solo su comando esplicito dell'utente (es. spostamento nel cestino locale con ripristino possibile, o copia backup verso una fonte secondaria con verifica hash).
3. **Distinzione netta tra Contenuto Logico (`Media`) e Copia Fisica (`File`)**: Più file con percorsi, nomi e dischi diversi ma identico contenuto binario (SHA-256) fanno capo a un unico elemento multimediale logico.
4. **Scansione Ibrida (Browser + Server + Agente Headless)**: Supporto per scansione zero-install via browser (File System Access API / `webkitdirectory`), scansione diretta lato server per cartelle locali/mount macOS, e agente headless Python per NAS/cron.
5. **Robustezza per Grandi Archivi**: Elaborazione a streaming/chunk progressivi, consumo di memoria controllato (evitando buffer massivi in RAM), tolleranza agli errori sui singoli file, ripresa idempotente delle scansioni e monitoraggio proattivo in background (USB mount & folder changes).

---

## 2. Architettura dei Componenti

```
+-------------------------------------------------------------------------+
|                                CLIENT                                   |
|                                                                         |
|  +-----------------------------+     +-------------------------------+  |
|  |       React SPA UI          |     |   Browser Scanner Pipeline    |  |
|  |  - Dashboard & Metriche     |     |  - Directory Picker (FSA/WKD) |  |
|  |  - Galleria Virtualizzata   |     |  - Worker Pool / Chunk Hash   |  |
|  |  - Dettaglio & Metadati     |     |  - EXIF / Media Inspector     |  |
|  |  - Riconciliazione Copie    |     |  - Thumbnail Generator        |  |
|  +--------------+--------------+     +---------------+---------------+  |
|                 |                                    |                  |
+-----------------|------------------------------------|------------------+
                  | REST API                           | Batch Ingestion /
                  | (JWT Auth)                         | Multipart Thumbs
                  v                                    v
+-------------------------------------------------------------------------+
|                                BACKEND                                  |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                       FastAPI Application                         |  |
|  |  - /api/v1/auth         - /api/v1/sources      - /api/v1/scans    |  |
|  |  - /api/v1/media        - /api/v1/duplicates   - /api/v1/thumbs   |  |
|  +-------------------------------------------------------------------+  |
|            |                          |                     |           |
|            v                          v                     v           |
|  +-------------------+      +-------------------+     +--------------+  |
|  | Duplicate Service |      | Catalog Ingestion |     |  Thumbnail   |  |
|  | & Reconciliation  |      |   (Idempotente)   |     |   Storage    |  |
|  +-------------------+      +-------------------+     +--------------+  |
|            |                          |                     |           |
|            +--------------------------+                     |           |
|                         |                                   |           |
|                         v                                   v           |
|               +-------------------+              +-------------------+  |
|               |  SQLite Database  |              | File System Local |  |
|               |  (WAL Mode, FKs)  |              | /data/thumbnails  |  |
|               +-------------------+              +-------------------+  |
+-------------------------------------------------------------------------+
```

---

## 3. Descrizione dei Moduli

### 3.1 Scanner Browser (Web-based Ingestion)
- **Selezione Cartella**: Supporta nativamente `window.showDirectoryPicker()` (Chromium: Chrome, Edge, Opera) con fallback ad input file con attributo `webkitdirectory` (Safari, Firefox).
- **Streaming & Memory Safety**: I file non vengono mai letti per intero in memoria. Per il calcolo dell'hash crittografico (SHA-256) viene utilizzato un algoritmo di hashing a chunk in WebAssembly/Web Crypto, consentendo la scansione sicura anche di file video da decine di gigabyte.
- **Estrazione Metadati**: Parsing EXIF, IPTC e date di scatto lato client (`exifr`), lettura dimensioni video/audio.
- **Miniature Leggere**: Ridimensionamento lato client (Canvas / OffscreenCanvas) con orientamento EXIF corretto e compressione WebP/JPEG (max 384px sul lato lungo), caricando sul server solo i pochi kilobyte della miniatura.
- **Batch Processing**: I metadati e le miniature vengono inviati al backend in lotti (es. lotti di 50 elementi) con checkpoint persistenti per garantire ripresa immediata in caso di chiusura tab o disconnessione.

### 3.2 Backend FastAPI
- **Architettura a Strati**:
  - `api/`: Endpoint REST tipizzati con Pydantic e protetti da JWT.
  - `services/`: Logica di business pura (catalogazione, deduplicazione, gestione stato job, validazione metadati).
  - `repositories/` / `models/`: Accesso ai dati con SQLAlchemy 2.0 (async/sync robusto) e migrazioni Alembic.
  - `core/`: Configurazione centralizzata (Pydantic BaseSettings), logging e sicurezza.
- **Idempotenza delle Scansioni**: Ogni batch inviato specifica l'identificativo della scansione, il percorso relativo e l'hash del file. Se una scansione viene riavviata o sovrapposta, i file identici aggiornano solo `last_seen` e lo stato di disponibilità senza duplicare record nel database.
- **Deduplicazione Automatica**: All'inserimento di un file, il backend cerca se esiste già un'entità `Media` con lo stesso `canonical_sha256` per lo stesso utente.
  - Se esiste: associa la nuova copia (`File`) al `Media` esistente.
  - Se non esiste: crea il nuovo `Media`, genera il record `File` e archivia la miniatura.

### 3.3 Gestione Storage e Miniature
- I file originali non transitano sul server e non occupano spazio backend.
- Le miniature vengono salvate su filesystem locale in `/data/thumbnails/{hash[0:2]}/{hash[2:4]}/{hash}.webp` per evitare il sovraccarico di directory con troppi file.
- Il database tiene traccia del puntatore relativo e delle dimensioni della miniatura.

### 3.4 Agente Locale Headless (`agent/scanner_agent.py`)
- Condivide lo stesso contratto di API (`POST /api/v1/scans/{id}/batch`) dello scanner browser.
- Eseguibile da terminale o cron job su NAS, Raspberry Pi o server locali con accesso diretto ai mount point e generazione miniature WebP tramite Pillow.

### 3.5 Servizi Aggiuntivi Post-MVP (Fasi 5–14)
- **SPA Self-Contained (`backend/app/main.py`)**: Quando `frontend/dist` è compilato, FastAPI serve direttamente l'intera applicazione React su porta `8089` (via `start_app.command`), oltre alla modalità dev con Vite su `5173`.
- **Monitoraggio Proattivo (`proactive_monitor_service.py`)**: Thread in background avviato nel `lifespan` di FastAPI che rileva il mount di volumi esterni/USB e modifiche nelle cartelle locali, notificando il frontend via SSE (`/api/v1/sources/events`).
- **Cestino Sicuro & Ciclo di Vita File (`trash_service.py`)**: Spostamento reversibile in cestino dedicato per duplicati esatti/simili (dHash), ripristino, svuotamento definitivo e pulizia orfani.
- **Confronto Drive & Backup Attivo (`source_service.py`)**: Diff tra fonti `primary` e `backup` e copia file mancanti con verifica SHA-256 post-copia.
- **Anteprime HD & RAW (`media_preview_service.py`)**: Estrazione anteprime ad alta risoluzione per file RAW e streaming video/immagini originali quando la fonte è online.
- **AI Advisor & Smart Curation (`ai_provider.py`, `folder_advisor_service.py`, `smart_album_service.py`, `best_shot_service.py`, `curation_heuristics.py`)**: Suggerimenti su album, cartelle e best-shot tramite provider configurabile (`none`, `gemini`, `ollama`) con cache persistente e tetto giornaliero.
- **Geolocalizzazione Offline (`geo_service.py`)**: Reverse geocoding offline tramite `reverse_geocoder` con cache locale per popolare `place_name` e alimentare la vista Mappa GPS.

---

## 4. Sicurezza, Privacy e Isolamento Dati

1. **Multi-Tenancy e Isolamento Rigoroso**:
   - Tutte le tabelle di contenuto (`sources`, `media`, `files`, `scan_jobs`) hanno una chiave esterna diretta o vincolo verso `user_id`.
   - Nessuna query di lettura o scrittura può essere eseguita senza il filtro `WHERE user_id = :current_user_id`.
2. **Protezione Accesso Miniature**:
   - Le miniature sono accessibili solo tramite endpoint protetto (`/api/v1/thumbnails/{media_id}`) che verifica l'appartenenza del media all'utente autenticato prima di effettuare lo streaming del file.
3. **Autenticazione**:
   - Hashing delle password con algoritmo sicuro (`bcrypt` / `argon2id`).
   - Token di sessione JWT con scadenza e rotazione sicura via header `Authorization: Bearer <token>`.
4. **Nessun Percorso Assoluto o Credenziale Hardcoded**:
   - Tutte le configurazioni sono parametrizzate tramite variabili d'ambiente (.env).

---

## 5. Protocollo di Comunicazione Scanner <-> Backend

```
Browser / Scanner                             Backend (FastAPI)
       |                                             |
       | 1. POST /api/v1/sources                     |
       |    { name, source_type, root_path }         |
       |-------------------------------------------->|
       |    <-- { source_id, status: "created" }     |
       |                                             |
       | 2. POST /api/v1/sources/{id}/scans/start    |
       |-------------------------------------------->|
       |    <-- { scan_id, status: "in_progress" }   |
       |                                             |
       | [Loop elaborazione lotti: N file]          |
       | 3. POST /api/v1/scans/{scan_id}/batch       |
       |    Multipart / JSON:                        |
       |    - files: [ { relative_path, sha256,      |
       |                 size, exif, captured_at } ] |
       |    - thumbnails: [ binary blobs ]           |
       |-------------------------------------------->|
       |    <-- { processed: N, duplicates_found: D }|
       |                                             |
       | 4. POST /api/v1/scans/{scan_id}/complete    |
       |    { total_discovered, total_processed }    |
       |-------------------------------------------->|
       |    <-- { status: "completed", summary: {...}}|
```

Se durante il loop il browser viene chiuso, lo stato del `scan_id` rimane registrato con i file già inseriti nel catalogo; al riavvio, lo scanner verifica i percorsi già salvati saltando l'estrazione e garantendo un completamento senza incoerenze.
