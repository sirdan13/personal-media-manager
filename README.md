# Personal Media Manager

Applicazione web per la catalogazione, esplorazione e gestione di archivi personali di fotografie e video distribuiti su molteplici dispositivi, hard disk esterni e memorie di massa, con individuazione automatica dei duplicati binari esatti e scansione diretta dal browser senza installare software locale.

---

## 1. Stato di Avanzamento e Risultati

### Milestone 0 – Analisi e Progettazione Architetturale ✅
- [x] Studio dei requisiti e principio di non distruttività (read-only su file originali).
- [x] Analisi delle API browser per accesso a filesystem (`showDirectoryPicker` vs `webkitdirectory`).
- [x] Matrice comparativa browser: Chrome, Edge, Safari macOS, Firefox.
- [x] Specifiche del modello dati relazionale e schema ER (`docs/database.md`).
- [x] Architettura di streaming SHA-256 e salvaguardia della memoria RAM (`docs/scanning.md`).
- [x] Documentazione di sistema completa (`docs/architecture.md`, `docs/database.md`, `docs/scanning.md`, `docs/roadmap.md`).

### Milestone 1 – Prototipo Scanner Browser & Stress Test ✅
- [x] Pipeline di scansione con supporto ibrido (`FileSystemDirectoryHandle` + input fallback).
- [x] Calcolo SHA-256 a chunk incrementali (WebAssembly SIMD via `hash-wasm`): consumo RAM costante < 5 MB anche con video da decine di GB.
- [x] Estrazione metadati client-side (EXIF, IPTC, date di scatto, dimensioni) con `exifr`.
- [x] Generazione anteprime leggere WebP 384px con correzione automatica dell'orientamento EXIF.
- [x] Identificazione duplicati esatti in tempo reale durante la scansione.
- [x] Suite di benchmark e stress test automatizzati eseguiti in headless Chrome su dataset reali:
  - **100 Immagini con duplicati**: 0.5s di scansione (**199.3 file/s**, 19 duplicati identificati, 0 errori).
  - **1.000 Immagini con video MP4**: 4.7s di scansione (**211.6 file/s**, 14.08 MB/s, 222 duplicati, 0 errori).
  - **5.000 Immagini (Stress Test)**: 25.6s di scansione (**195.7 file/s**, 1.161 duplicati, 0 errori, heap GC stabile).
  - *Report dettagliato archiviato in [docs/milestone_1_report.md](docs/milestone_1_report.md)*.

### Milestone 2 – Backend FastAPI, Database SQLite e Ingestion API ✅
- [x] Backend modulare con FastAPI, SQLAlchemy 2.0 e Pydantic v2.
- [x] Database SQLite in modalità WAL con PRAGMA di concorrenza, chiavi esterne e indici ad alte prestazioni.
- [x] Autenticazione multi-utente con hashing sicuro delle password (bcrypt) e token JWT.
- [x] Gestione Fonti (`/api/v1/sources`), Sessioni di scansione (`/api/v1/scans`), Libreria Media (`/api/v1/media`) e Duplicati (`/api/v1/duplicates`).
- [x] Endpoint di ingestione a batch (`POST /api/v1/scans/{id}/batch`) con checkpointing e idempotenza verificata (re-scansione senza record duplicati).
- [x] Storage delle miniature partizionato su disco locale (`data/thumbnails/{hash[0:2]}/{hash[2:4]}/{hash}.webp`).
- [x] **10 test automatici end-to-end e di unità superati con successo (100% pass rate)**.

---

## 2. Architettura del Progetto

```
personal-media-manager/
├── frontend/                     # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── features/scanner/     # Modulo di scansione browser ad alte prestazioni
│   │   │   ├── chunkHasher.ts    # Hashing incrementale SHA-256 WebAssembly
│   │   │   ├── directoryTraverser.ts # Supporto showDirectoryPicker + webkitdirectory
│   │   │   ├── metadataExtractor.ts  # Parsing EXIF e dimensioni video
│   │   │   ├── thumbnailGenerator.ts # Anteprime WebP 384px con orientamento
│   │   │   ├── scannerEngine.ts  # Motore di orchestrazione con concorrenza
│   │   │   └── benchmarkRunner.ts # Generatore di dataset per stress test
│   │   ├── services/api.ts       # Client API tipizzato per il backend
│   │   ├── App.tsx               # Interfaccia grafica del prototipo scanner
│   │   └── main.tsx
├── backend/                      # Python FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── api/v1/               # Endpoint REST (auth, sources, scans, media, duplicates)
│   │   ├── core/                 # Configurazione, database SQLite WAL, sicurezza JWT
│   │   ├── models/               # Entità relazionali (User, Source, Media, File, Thumbnail, ScanJob)
│   │   ├── schemas/              # Validatori Pydantic v2
│   │   ├── services/             # Logica di business (ingestione batch, deduplicazione)
│   │   └── tests/                # Test suite pytest (10 test passati)
│   └── requirements.txt
├── docs/                         # Documentazione architetturale
│   ├── architecture.md           # Architettura di sistema e sicurezza
│   ├── database.md               # Modello dati ed ER diagram
│   ├── scanning.md               # Fattibilità e limiti delle API browser
│   ├── roadmap.md                # Roadmap operativa e criteri di accettazione
│   └── milestone_1_report.md     # Report empirico dei benchmark
├── scripts/
│   └── run_benchmarks.cjs        # Script di esecuzione benchmark in headless Chrome
├── .env.example
└── README.md
```

---

## 3. Come Avviare ed Eseguire

### 3.1 Avvio Frontend (Scanner Browser)
```bash
cd frontend
npm install
npm run dev
```
L'applicazione sarà attiva su `http://localhost:5173`. È possibile:
- Selezionare una qualsiasi cartella reale del computer (tramite File System Access API su Chrome/Edge o tramite fallback su Safari/Firefox).
- Eseguire i benchmark automatici (100, 1.000 o 5.000 immagini) direttamente cliccando sui pulsanti nell'interfaccia.

### 3.2 Avvio Backend (FastAPI)
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
La documentazione interattiva Swagger UI sarà consultabile su `http://localhost:8000/docs`.

### 3.3 Esecuzione Test Automatici Backend
```bash
PYTHONPATH=backend backend/venv/bin/pytest backend/app/tests -v
```

### 3.4 Esecuzione Benchmark Headless Chrome
```bash
node scripts/run_benchmarks.cjs
```
