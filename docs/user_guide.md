# Guida Utente — Personal Media Manager

Questa guida spiega come avviare, configurare e usare **Personal Media Manager** nell'uso quotidiano.

---

## 1. Avvio e Arresto dell'Applicazione

Sono disponibili tre modalità di avvio a seconda dell'ambiente:

### A. Modalità App Self-Contained macOS (Consigliata per uso quotidiano)
- Esegui **`start_app.command`** (doppio clic o da terminale `./start_app.command`).
- Se `frontend/dist/` non esiste, compila automaticamente il frontend, poi avvia un unico server FastAPI su **`http://localhost:8089`** che serve sia le API sia l'interfaccia web e apre il browser.

### B. Modalità Sviluppo macOS (Doppio clic / App macOS)
- Esegui **`Avvia_Media_Manager.command`** oppure apri **`Personal Media Manager.app`**.
- Libera le porte `8000` e `5173`, avvia il backend FastAPI (`--reload`) su `http://localhost:8000` e Vite su `http://localhost:5173`, quindi apre il browser su `http://localhost:5173`.
- Log salvati in `/tmp/pmm_backend.log` e `/tmp/pmm_frontend.log`.
- Per fermare i servizi: premi **`q`** o `Ctrl+C` nella finestra del terminale, oppure esegui **`Arresta_Media_Manager.command`**.

### C. Modalità Docker Compose
```bash
cp .env.example .env
docker compose up -d --build
```
- Web UI: `http://localhost:3000`
- Backend & Swagger Docs: `http://localhost:8000/docs`

---

## 2. Primo Accesso e Account

Alla prima apertura viene mostrata la schermata di login/registrazione (`AuthModal`):
- Puoi registrare un nuovo account locale oppure usare il pulsante rapido **"Usa Account Demo"** (`demo@example.com` / `demo123456`).
- Ogni utente ha un catalogo completamente isolato (fonti, media, album, tag, impostazioni AI).

---

## 3. Sezioni dell'Interfaccia

La barra laterale (`Sidebar`) organizza l'applicazione in 10 viste:

1. **Dashboard**: riepilogo KPI (totale foto/video, copie fisiche, spazio totale, duplicati esatti e spazio recuperabile, stato online/offline delle fonti).
2. **Libreria**: vista unificata di foto e video con:
   - **Vista Griglia** con slider di zoom per regolare la dimensione delle miniature.
   - **Vista Lista File** ad alta densità (200 elementi per pagina, senza miniature) con filtro per cartella.
   - **Selezione multipla**: trascinamento rettangolare (marquee/rubber-band) dagli spazi vuoti o dai margini, click + menu contestuale con **tasto destro**, azioni batch (Aggiungi a Preferiti, Sposta nel Cestino, Aggiungi ad Album/Tag).
   - **Modale Dettaglio Media**: anteprima ad alta risoluzione (inclusa estrazione anteprima per file RAW e streaming video quando la fonte è online), metadati EXIF completi, coordinate GPS, elenco di tutte le copie fisiche con stato della fonte e pulsante per aprire/mostrare il file nel Finder (`reveal`).
3. **Video**: filtro rapido della libreria sui soli file video.
4. **Preferiti**: raccolta immediata dei media contrassegnati con il cuore.
5. **Album & Tag**: creazione e gestione di album tematici e tag colorati per organizzare i media trasversalmente ai dischi.
6. **Mappa GPS**: esplorazione geografica su mappa interattiva (Leaflet) dei media dotati di coordinate EXIF, con nomi località risolti offline (`reverse_geocoder`).
7. **Duplicati**:
   - **Duplicati Esatti (SHA-256)**: gruppi di file binariamente identici su una o più fonti.
   - **Simili (dHash)**: immagini visivamente simili (es. raffiche o varianti) con supporto opzionale AI/euristico per suggerire lo scatto migliore (*Best Shot*).
   - **Copertura Backup (`backup-gap`)**: individua file presenti su fonti primarie ma non ancora copiati su fonti di backup.
   - **Cestino Sicuro**: i file eliminati dai duplicati vengono spostati nel cestino locale (reversibile tramite **Ripristina**, eliminabili definitivamente con **Svuota Cestino**).
8. **Fonti & Dischi**:
   - Registrazione di cartelle locali, dischi USB/esterni e NAS con ruolo `primary` o `backup` ed esclusioni di percorsi (`excluded_paths`).
   - Stato **Online / Offline**: quando un disco è scollegato, miniature e metadati restano consultabili.
   - **Verifica Rapida**, **Riconciliazione** (rileva file spostati, rimossi o ripristinati) e **Pulizia Orfani**.
   - **Confronto Drive & Backup Attivo**: confronta due fonti e copia i file mancanti verso la fonte di backup verificando l'integrità con SHA-256 post-copia.
9. **Scansioni**:
   - **Scansione Browser**: selezione cartella via File System Access API (o `webkitdirectory`), hashing SHA-256 a streaming (consumo RAM costante) e generazione miniature WebP lato client.
   - **Scansione Server**: avvia la scansione diretta dal backend su percorsi montati localmente (es. `/Volumes/...`).
   - **Agente CLI Headless (`agent/scanner_agent.py`)**: per NAS o cron job senza browser.
10. **Impostazioni**:
    - Profilo qualità miniature (`compact` 240px, `balanced` 320px, `high` 384px) e compattazione storage.
    - Download backup del database SQLite.
    - Manutenzione (backfill geotag, pulizia scansioni bloccate).
    - Configurazione **AI Advisor** (`none`, `gemini`, `ollama`), limite richieste giornaliere e consenso invio immagini cloud.

---

## 4. Monitoraggio Proattivo in Background

Quando il backend è attivo, un monitor in background controlla periodicamente i volumi esterni e le cartelle locali registrate:
- Al collegamento di un disco USB già censito o alla modifica di file locali, esegue una verifica rapida e invia una notifica in tempo reale all'interfaccia web tramite Server-Sent Events (`/api/v1/sources/events`).
