# Personal Media Manager

Applicazione web moderna e modulare per la catalogazione, esplorazione e deduplicazione di archivi personali di fotografie e video distribuiti su molteplici dispositivi fisici, hard disk esterni, NAS e memorie di massa.

Il sistema garantisce:
- **Integrità assoluta (Read-Only)**: Nessuna modifica, ridenominazione o cancellazione sui file originali.
- **Scansione Browser ad alte prestazioni**: Accesso a cartelle locali tramite File System Access API nativa (con fallback universale `webkitdirectory`).
- **Streaming SHA-256 WebAssembly**: Calcolo hash a blocchi a consumo di RAM costante (< 5 MB) per evitare OOM anche su file video di decine di gigabyte.
- **Deduplicazione Logica vs Fisica**: I file con identico hash binario fanno capo a un unico record logico `media` conservando il tracciamento di tutte le copie fisiche sui rispettivi dischi.
- **Gestione Dischi Offline**: Le miniature e i metadati restano sempre consultabili e ricercabili anche quando un hard disk o pennetta USB è fisicamente scollegato dal computer.
- **Scansione Incrementale & Riconciliazione**: Rilevamento istantaneo delle modifiche (tramite impronte digitali mtime + size) e riconciliazione automatica di file spostati o rimossi.
- **Agente Headless CLI per NAS**: Esecuzione da terminale o tramite cron job su server locali, NAS Synology o Raspberry Pi senza necessità di aprire il browser.
- **Distribuzione Docker con un solo comando**: Packaging multi-stage per Nginx e FastAPI con volumi persistenti.

---

## 1. Stato di Completamento delle Milestone

Tutte le milestone pianificate sono state completate con successo e verificate con test automatizzati:

| Milestone | Descrizione | Stato | Risultati Chiave |
| :--- | :--- | :---: | :--- |
| **Milestone 0** | Analisi & Progettazione Architetturale | ✅ | Modello dati relazionale, schema ER, PRAGMA WAL SQLite, contratti batch ingestion |
| **Milestone 1** | Prototipo Scanner Browser & Benchmarking | ✅ | 195–211 file/sec, zero leak di memoria testato su 5.000 file in Chrome Headless |
| **Milestone 2** | Backend FastAPI & Ingestion API | ✅ | Modelli SQLAlchemy, auth JWT, storage miniature WebP su disco, idempotenza |
| **Milestone 3** | Interfaccia Utente Completa (React + TS) | ✅ | Dashboard con KPI, Libreria multimediale, Dettaglio EXIF + GPS, Gestione Fonti e Scansioni |
| **Milestone 4** | Deduplicazione & Fonti Offline | ✅ | Calcolo spazio ridondante, badge dischi online/offline, riconciliazione automatica |
| **Milestone 5** | Agente Locale Headless (NAS / Cron) | ✅ | CLI autonoma Python `agent/scanner_agent.py` con Pillow per scansioni periodiche |
| **Milestone 6** | Distribuzione & Docker Packaging | ✅ | Dockerfile multi-stage, Nginx reverse proxy, `docker-compose.yml`, guida al backup |

---

## 2. Architettura della Repository

```
personal-media-manager/
├── frontend/                     # Web App React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/           # Componenti globali (Sidebar, Topbar)
│   │   ├── features/
│   │   │   ├── dashboard/        # Dashboard con statistiche e stato fonti
│   │   │   ├── library/          # Galleria responsive, filtri, modale dettaglio EXIF & GPS
│   │   │   ├── duplicates/       # Analisi copie duplicate e calcolo spazio sprecato
│   │   │   ├── sources/          # Registrazione e toggle online/offline fonti
│   │   │   ├── scans/            # Centro scansione browser con telemetria in tempo reale
│   │   │   ├── scanner/          # Engine di scansione, hashing WebAssembly e anteprime WebP
│   │   │   ├── auth/             # Modale login/registrazione con demo rapida
│   │   │   └── settings/         # Profilo, statistiche SQLite e diagnostica browser
│   │   └── services/api.ts       # Client API REST tipizzato
│   └── vite.config.ts
├── backend/                      # API Backend FastAPI + SQLite WAL
│   ├── app/
│   │   ├── api/v1/               # Endpoint REST (auth, sources, scans, media, duplicates)
│   │   ├── core/                 # Config database SQLite WAL, sicurezza JWT bcrypt
│   │   ├── models/entities.py    # Modello dati relazionale (users, devices, sources, media, files...)
│   │   ├── schemas/              # Contratti e validatori Pydantic v2
│   │   ├── services/             # Ingestion service, deduplicazione, source service
│   │   └── tests/                # Suite completa di test pytest (16/16 superati)
│   └── requirements.txt
├── agent/                        # Agente Headless CLI per NAS e server (Milestone 5)
│   ├── scanner_agent.py          # Script CLI con streaming hash, Pillow EXIF e batch upload
│   └── requirements.txt
├── deployment/                   # Configurazione per il rilascio in produzione (Milestone 6)
│   ├── Dockerfile.backend        # Container Python 3.12 slim ottimizzato
│   ├── Dockerfile.frontend       # Build multi-stage Node 20 + Nginx Alpine
│   └── nginx.conf                # Reverse proxy SPA con proxy /api/ e compressione gzip
├── docs/                         # Documentazione architetturale di dettaglio
│   ├── architecture.md           # Architettura di sistema e sicurezza
│   ├── database.md               # Modello dati ed ER diagram
│   ├── scanning.md               # Specifiche tecniche per lo streaming hashing
│   ├── roadmap.md                # Matrice criteri di accettazione AC01-AC15
│   ├── deployment.md             # Guida completa di deployment e backup
│   └── milestone_1_report.md     # Report empirico di benchmarking
├── docker-compose.yml            # Stack completo per avvio con un solo comando
├── .env.example                  # Template variabili di configurazione
└── README.md
```

---

## 3. Quick Start con Docker Compose

Per avviare l'intera applicazione in un ambiente containerizzato:

```bash
# 1. Clona la repository ed entra nella cartella
git clone <repo-url> personal-media-manager
cd personal-media-manager

# 2. Configura le variabili d'ambiente
cp .env.example .env

# 3. Avvia lo stack
docker compose up -d --build
```

- **Frontend Web UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Healthcheck**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 4. Avvio in Locale per Sviluppo

### Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pillow requests

# Avvio server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
La Web App sarà disponibile su `http://localhost:5173`. È possibile effettuare il login con il pulsante rapido **"Usa Account Demo"** (`demo@example.com` / `demo123456`).

---

## 5. Esecuzione dell'Agente Headless CLI (NAS / Cron)

Se desideri scansionare cartelle su un server locale, un NAS Synology o un disco esterno montato su Linux senza usare il browser:

```bash
# Esecuzione scansione
./agent/scanner_agent.py \
  --server http://localhost:8000 \
  --email demo@example.com \
  --password demo123456 \
  --source-name "NAS Synology - Archivio 2010-2025" \
  --path /Volumes/PhotoArchive
```

L'agente sfrutta l'hashing a streaming per non sovraccaricare la memoria, genera miniature WebP in locale e salta automaticamente i file non modificati tramite il confronto con le impronte digitali memorizzate sul server.

---

## 6. Esecuzione dei Test Automatici

### Test Backend e Agente (Pytest)
```bash
PYTHONPATH=backend:. backend/venv/bin/pytest backend/app/tests -v
```
Tutti i **16 test** coprono:
- Autenticazione JWT e isolamento multi-tenant.
- Ciclo di vita delle scansioni e idempotenza dell'ingestione.
- Riconoscimento duplicati binari su fonti diverse.
- Preservazione del catalogo con fonti offline.
- Riconciliazione automatica dei file mancanti e ripristinati.
- Aggiornamento hash su file modificati.
- Funzionamento end-to-end dell'agente headless CLI.

### Test e Compilazione Frontend (TypeScript)
```bash
cd frontend
npm run build
```
Compilazione e verifica dei tipi con **0 errori**.

---

## 7. Criteri di Accettazione Verificati (AC01 – AC15)

- [x] **AC01** (Selezione cartella): File System Access API con fallback trasparente a `webkitdirectory`.
- [x] **AC02** (Scansione reattiva): Scansione ricorsiva senza bloccare l'interfaccia utente.
- [x] **AC03** (Hash esatto): SHA-256 a streaming chunked (RAM < 5MB).
- [x] **AC04** (Metadati EXIF): Data di scatto originale, fotocamera, risoluzione, coordinate GPS.
- [x] **AC05** (Miniature): Anteprime WebP 384px con correzione orientamento EXIF.
- [x] **AC06** (Backend SQLite): Persistenza in modalità WAL con isolamento utente.
- [x] **AC07** (Idempotenza): Scansioni ripetute non creano duplicati nel DB.
- [x] **AC08** (Duplicati): Copie identiche raggruppate sotto lo stesso `Media` logico.
- [x] **AC09** (Tracciamento Fonti): Ogni copia fisica traccia la fonte e il percorso relativo.
- [x] **AC10** (Fonti Offline): File e miniature rimangono consultabili quando il disco è disconnesso.
- [x] **AC11** (Galleria): Esplorazione reattiva con filtri per tipo, fonte, ordinamento e ricerca.
- [x] **AC12** (Multi-tenant): Separazione rigorosa dei dati tra account utente.
- [x] **AC13** (Integrità File): Politica tassativamente di sola lettura sui file originali.
- [x] **AC14** (Tolleranza Errori): File corrotti o non leggibili non bloccano la scansione.
- [x] **AC15** (Scansioni Incrementali): Salto immediato dei file invariati e ripresa garantita.

---

## 8. Licenza

Distribuito sotto licenza **MIT**. I file personali e le fotografie restano sempre sul disco dell'utente senza alcuna alterazione.
