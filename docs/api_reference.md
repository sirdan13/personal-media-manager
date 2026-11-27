# Riferimento API REST (`/api/v1`) — Personal Media Manager

Tutti gli endpoint sono montati sotto `/api/v1` (ad eccezione di `GET /health`).
Quando il backend è in esecuzione, la documentazione interattiva OpenAPI/Swagger è sempre disponibile su `/docs` e `/redoc`.

---

## Healthcheck
- `GET /health` — Stato generale del servizio.
- `GET /api/v1/health` — Stato API v1.

---

## Autenticazione (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Registrazione nuovo utente (ritorna JWT `Token`).
- `POST /api/v1/auth/login` — Login con email e password (ritorna JWT `Token`).
- `GET /api/v1/auth/me` — Profilo utente autenticato.

---

## Fonti & Archivi (`/api/v1/sources`)
- `GET /api/v1/sources/browse/filesystem` — Navigazione cartelle sul filesystem locale del server.
- `GET /api/v1/sources/events` — Stream SSE (`text/event-stream`) per notifiche in tempo reale dal monitor proattivo (mount USB, modifiche locali).
- `GET /api/v1/sources` — Elenco fonti registrate dall'utente.
- `POST /api/v1/sources` — Registra una nuova fonte (`primary` o `backup`).
- `GET /api/v1/sources/{source_id}` — Dettaglio singola fonte.
- `PATCH /api/v1/sources/{source_id}` — Aggiorna proprietà della fonte.
- `DELETE /api/v1/sources/{source_id}` — Elimina una fonte dal catalogo.
- `POST /api/v1/sources/verify` — Verifica rapida stato/esistenza file su fonti online.
- `POST /api/v1/sources/purge-missing` — Pulizia record orfani/mancanti dal catalogo.
- `GET /api/v1/sources/compare` — Confronto diff tra due fonti (es. `primary` vs `backup`).
- `POST /api/v1/sources/backup-copy` — Copia file mancanti verso fonte di backup con verifica SHA-256.
- `GET /api/v1/sources/{source_id}/fingerprints` — Impronte digitali (`relative_path`, `size`, `mtime`) per scansioni incrementali.
- `POST /api/v1/sources/{source_id}/reconcile` — Riconciliazione file spostati/rimossi/ripristinati.
- `POST /api/v1/sources/{source_id}/toggle-status` — Cambio manuale stato `online` / `offline`.
- `GET /api/v1/sources/{source_id}/folders` — Struttura cartelle indicizzate nella fonte (usata dal filtro cartella).
- `POST /api/v1/sources/{source_id}/exclusions` — Aggiorna percorsi esclusi (`excluded_paths`).

---

## Scansione & Ingestione (`/api/v1/scans`)
- `GET /api/v1/scans` — Cronologia `ScanJob` dell'utente.
- `POST /api/v1/scans/{source_id}/start` — Avvia un `ScanJob` per ingestione browser/agente.
- `POST /api/v1/scans/{scan_id}/batch` — Invia un batch di metadati file e miniature WebP (idempotente).
- `POST /api/v1/scans/{scan_id}/complete` — Completa la scansione e finalizza le statistiche.
- `GET /api/v1/scans/{scan_id}` — Stato e telemetria di un `ScanJob`.
- `POST /api/v1/scans/{source_id}/server-scan` — Avvia una scansione diretta lato server sul `root_path` locale.
- `POST /api/v1/scans/{scan_id}/cancel` — Annulla una scansione in corso.

---

## Libreria Media (`/api/v1/media`)
- `GET /api/v1/media` — Elenco paginato e filtrabile (tipo, fonte, cartella, testo, ordinamento). Ritorna `X-Total-Count`.
- `POST /api/v1/media/{media_id}/favorite` — Attiva/disattiva stato preferito.
- `POST /api/v1/media/batch/favorite` — Imposta preferiti in blocco su più `media_id`.
- `POST /api/v1/media/batch/trash` — Sposta nel cestino sicuro in blocco.
- `GET /api/v1/media/dashboard/stats` — KPI aggregati per la Dashboard.
- `GET /api/v1/media/timeline` — Bucket temporali per timeline.
- `GET /api/v1/media/map` — Elementi geolocalizzati per la vista Mappa GPS.
- `GET /api/v1/media/{media_id}` — Dettaglio completo media (EXIF, GPS, copie fisiche).
- `GET /api/v1/media/{media_id}/thumbnail` — Streaming miniatura WebP dal disco backend.
- `GET /api/v1/media/{media_id}/stream` — Streaming file originale (se fonte online).
- `GET /api/v1/media/{media_id}/preview` — Anteprima HD / estrazione preview per file RAW (se fonte online).
- `POST /api/v1/media/files/{file_id}/reveal` — Evidenzia la copia fisica specifica nel file manager (Finder).
- `POST /api/v1/media/{media_id}/reveal` — Evidenzia la prima copia disponibile del media nel file manager.

---

## Duplicati & Cestino (`/api/v1/duplicates`)
- `GET /api/v1/duplicates` — Gruppi di duplicati binari esatti (stesso SHA-256).
- `GET /api/v1/duplicates/summary` — Riepilogo conteggi e spazio recuperabile.
- `GET /api/v1/duplicates/backup-gap` — Media non ancora replicati su fonti `backup`.
- `GET /api/v1/duplicates/export` — Esportazione report duplicati.
- `GET /api/v1/duplicates/similar` — Gruppi di immagini visivamente simili (dHash).
- `POST /api/v1/duplicates/trash` — Sposta copie duplicate esatte selezionate nel cestino sicuro.
- `POST /api/v1/duplicates/trash-similar` — Sposta nel cestino copie simili selezionate.
- `GET /api/v1/duplicates/trash` — Elenco file attualmente nel cestino.
- `POST /api/v1/duplicates/trash/restore` — Ripristina file dal cestino alla posizione originale.
- `POST /api/v1/duplicates/trash/empty` — Svuota definitivamente il cestino.

---

## Album (`/api/v1/albums`) e Tag (`/api/v1/tags`)
- `GET /api/v1/albums` — Elenco album dell'utente.
- `POST /api/v1/albums` — Crea nuovo album.
- `PATCH /api/v1/albums/{album_id}` — Modifica nome/descrizione album.
- `DELETE /api/v1/albums/{album_id}` — Elimina album.
- `POST /api/v1/albums/{album_id}/media` — Aggiunge media all'album.
- `DELETE /api/v1/albums/{album_id}/media/{media_id}` — Rimuove media dall'album.
- `GET /api/v1/tags` — Elenco tag dell'utente.
- `POST /api/v1/tags` — Crea tag (nome + colore).
- `DELETE /api/v1/tags/{tag_id}` — Elimina tag.
- `POST /api/v1/tags/{tag_id}/media` — Associa media al tag.
- `DELETE /api/v1/tags/{tag_id}/media/{media_id}` — Rimuove tag da un media.

---

## AI Advisor & Smart Curation (`/api/v1/ai`)
- `GET /api/v1/ai/settings` — Legge configurazione provider AI dell'utente (senza esporre `api_key`).
- `PUT /api/v1/ai/settings` — Aggiorna provider (`none` / `gemini` / `ollama`), modelli, cap giornaliero, consenso cloud.
- `GET /api/v1/ai/models` — Elenca modelli disponibili per il provider configurato.
- `POST /api/v1/ai/test` — Verifica connettività con il provider AI.
- `POST /api/v1/ai/folder-advisor/analyze` — Analisi struttura cartelle e suggerimenti organizzativi.
- `POST /api/v1/ai/folder-advisor/preview` — Anteprima piano di riorganizzazione cartelle.
- `POST /api/v1/ai/smart-albums/suggest` — Suggerisce album tematici dai metadati/luoghi.
- `POST /api/v1/ai/smart-albums/create` — Crea gli album suggeriti.
- `POST /api/v1/ai/duplicates/suggest-keep` — Suggerisce quale copia conservare tra i duplicati.
- `POST /api/v1/ai/similar/rank-heuristic` — Classifica euristicamente immagini simili.
- `POST /api/v1/ai/similar/best-shot` — Individua lo scatto migliore (*Best Shot*) in un gruppo simile.

---

## Impostazioni Sistema (`/api/v1/settings`)
- `GET /api/v1/settings/storage` — Statistiche storage (dimensione DB, miniature, profilo utente).
- `PUT /api/v1/settings/storage` — Aggiorna profilo qualità miniature (`compact`, `balanced`, `high`).
- `POST /api/v1/settings/storage/compact` — Compatta database SQLite (`VACUUM`) e pulisce miniature orfane.
- `GET /api/v1/settings/backup/db` — Scarica copia di backup del database SQLite.
- `POST /api/v1/settings/maintenance/geotag-backfill` — Popola `place_name` retroattivamente sui media con coordinate GPS.
- `POST /api/v1/settings/maintenance/cleanup-stale-scans` — Ripulisce scansioni rimaste bloccate.
