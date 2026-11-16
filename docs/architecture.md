# Architettura di Sistema - Personal Media Manager

## 1. Visione e Principi Guida

**Personal Media Manager** è una piattaforma per la catalogazione centralizzata, l'esplorazione e l'individuazione dei duplicati di fotografie e video distribuiti su molteplici dispositivi, dischi fisici esterni, schede SD e cartelle di backup.

### Principi Fondamentali:
1. **Centralizzare i metadati, non i file originali**: I contenuti originali rimangono intatti e al loro posto fisico sui rispettivi supporti.
2. **Natura strettamente read-only dell'MVP**: Nessuna modifica, spostamento, compressione o eliminazione automatica dei file originali.
3. **Distinzione netta tra Contenuto Logico (`Media`) e Copia Fisica (`File`)**: Più file con percorsi, nomi e dischi diversi ma identico contenuto binario (SHA-256) fanno capo a un unico elemento multimediale logico.
4. **Scansione Zero-Install via Browser**: Capacità di analizzare e indicizzare cartelle locali direttamente dall'interfaccia web mediante le moderne API del browser (File System Access API), con architettura predisposta per accogliere in futuro un agente locale headless.
5. **Robustezza per Grandi Archivi**: Elaborazione a streaming/chunk progressivi, consumo di memoria controllato (evitando buffer massivi in RAM), tolleranza agli errori sui singoli file e ripresa idempotente delle scansioni.

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

### 3.4 Agente Locale (Milestone Futura)
- Progettato per condividere lo stesso contratto di API (`POST /api/v1/scans/{id}/batches`) dello scanner browser.
- Potrà essere eseguito come demone Python/Go/Rust su NAS o server headless con accesso diretto ai mount point locali e supporto completo a ExifTool.

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
