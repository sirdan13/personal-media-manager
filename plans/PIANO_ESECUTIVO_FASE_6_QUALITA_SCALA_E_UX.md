# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Fase 6: Stabilità Critica, Sicurezza, Scalabilità, Scanner Nativo Server & UX da Prodotto Maturo

> **ISTRUZIONI TASSATIVE PER L'AGENTE ESECUTORE (FLASH)**:
> Questo documento definisce il piano operativo della **Fase 6** per `/Users/daniele/projects/personal-media-manager`.
> 1. **Politica 100% Read-Only sui file originali dell'utente**: non modificare, rinominare, spostare o cancellare MAI alcun file multimediale sorgente dell'utente su dischi esterni, NAS o cartelle locali. Le scritture sono consentite esclusivamente nel database SQLite (`backend/data/personal_media_manager.db`), nella cartella delle miniature (`backend/data/thumbnails/`) e in file temporanei di sistema rimossi immediatamente dopo l'uso.
> 2. **Ordine di esecuzione rigoroso**: esegui un task alla volta in sequenza (**Task 6.1 -> Task 6.2 -> Task 6.3 -> Task 6.4 -> Task 6.5**).
> 3. **Verifica obbligatoria al termine di OGNI Task**:
>    - Esegui `backend/venv/bin/pytest` dalla root del progetto: **100% dei test devono passare** senza sporcare `backend/data/personal_media_manager.db`.
>    - Esegui `cd frontend && npm run build`: **0 errori TypeScript e Vite**.
> 4. **Zero dipendenze pesanti superflue**: non aggiungere librerie npm o pip non richieste in questo piano (usa TypeScript puro, stdlib Python, Pillow, `sips`/`qlmanage` su macOS e `ffmpeg` opzionale se presente nel `PATH`).

---

## 0. DIAGNOSI TECNICA ACCERTATA (AUDIT DEL CODICE — NON RIPETERE L'INDAGINE)

Dall'analisi completa di backend, frontend, agent, Docker e database reale (`2.301` media logici, `2.303` file fisici, `1.489` foto geolocalizzate, `178` media senza miniatura, `27 MB` di miniature WebP), sono stati accertati i seguenti bug critici e opportunità ad alto impatto:

### Bug Reali Confermati nel Codice
1. **Crash completo su `DELETE /api/v1/sources/{id}` (Backend + Frontend)**:
   - `backend/app/services/source_service.py` (righe 95, 99) usa `Media` ma **`Media` non è importato** a riga 7 (`NameError` garantito se la fonte ha file). Inoltre le miniature `.webp` orfane su disco non vengono rimosse e la clausola `IN (...)` non è suddivisa in chunk per SQLite.
   - `frontend/src/services/api.ts` (riga 38) esegue sempre `return response.json()`, che lancia `SyntaxError` su tutte le risposte `204 No Content` (`deleteSource`, `deleteAlbum`, `deleteTag`).
2. **Vulnerabilità Sicurezza & Path Traversal su `/media/{id}/stream` (e auth `/thumbnail`)**:
   - `backend/app/api/v1/media.py` (righe 141–165): `stream_media` dichiara `token: Optional[str] = Query(None)` **senza mai validarlo** né verificare che `Media.user_id == current_user.id`, e costruisce `os.path.join(s.root_path, f.relative_path)` senza verificare containment (`os.path.commonpath`).
   - `get_thumbnail` non valida il proprietario multi-tenant.
3. **Bug Query SQL in `backend/app/services/media_service.py`**:
   - Combinare `search` + `tag_id` esegue due `JOIN` sulla stessa tabella `media_tags` senza alias -> `OperationalError: ambiguous table name: media_tags`.
   - `copies_count` usa `func.count(File.id)` invece di `func.count(func.distinct(File.id))`, moltiplicando il conteggio quando `search` fa join con i tag.
   - `get_timeline_buckets` non esclude i `.mov` secondari delle Live Photos (disallineamento rispetto alla galleria).
   - `list_duplicate_groups` include file `availability_status == "missing"` e soffre di query N+1.
4. **Dettaglio EXIF rotto in `MediaDetailModal.tsx`**:
   - `MediaDetailModal.tsx` (riga 424) legge `primaryFile?.metadata_json`, ma `FileOut` in `backend/app/schemas/media.py` e `media_service.py` **non espone `metadata_json`** -> l'intero blocco Fotocamera/Lente/EXIF/GPS non viene mai renderizzato!
5. **Bug Scanner Browser (`ScansView.tsx`) & Fonti bloccate in `scanning`**:
   - `ScansView.tsx` invia `modified_at` invece di `filesystem_modified_at` (atteso da `ScanBatchItem`).
   - `flushBatch()` è chiamato senza `await` / coda promesse -> `reconcileSource` e `completeScan` possono partire prima che i batch terminino.
   - Se l'utente clicca **"Ferma"** (`abort()`), viene comunque chiamato `reconcileSource` con i `seenPaths` parziali, marcando erroneamente come `missing` tutti i file non ancora scansionati!
   - Nel DB reale la fonte `SSD_512_Sam` è rimasta bloccata in stato `scanning` per un'interruzione precedente: manca un recovery automatico all'avvio.
6. **Bug Configurazione, Dipendenze e Healthcheck**:
   - `backend/requirements.txt` manca di `Pillow` e `requests`, e duplica `reverse_geocoder` due volte.
   - `backend/app/main.py` espone solo `/health`, mentre `Dockerfile.backend`, `start.sh` e `README.md` interrogano `/api/v1/health`.
   - `frontend/src/features/settings/SettingsView.tsx` (riga 35) chiama `http://localhost:8000/health` hardcoded (rotto su Docker, LAN e Tailscale).
   - `docker-compose.yml` usa `DATABASE_PATH` e `JWT_SECRET_KEY`, ignorati da `backend/app/core/config.py` (`DATABASE_URL`, `SECRET_KEY`).

### Opportunità di Prodotto ad Alto Impatto
- **Scanner Nativo Lato Server (Background)** con `Pillow` + embedded RAW JPEG + `ffmpeg` / macOS `sips` + `qlmanage`: sfrutta direttamente i dischi già montati scelti dal nuovo Volume Explorer e risolve immediatamente le **178 miniature video/RAW mancanti** senza tenere il browser aperto.
- **Lightbox Alta Risoluzione + Navigazione Tastiera (`←`/`→`/`Esc`/`F`)** + EXIF completi (fotocamera, lente, apertura, tempi, ISO, luogo, badge `.AAE`/`.XMP`).
- **Vista Dedicata "Album & Tag"** nella sidebar con copertine, creazione/rinomina/eliminazione e assegnazione rapida.
- **Clustering Mappa GPS** (per gestire fluidamente le 1.489+ foto geolocalizzate senza lag DOM) + **Ricerca con Debounce & AbortController** + **Eliminazione N+1 e full-table scan in ingestion**.
- **Dashboard Analitica + Backup SQLite WAL-safe + Sistema Toast (addio `alert()`)**.

---

## TASK 6.1 — FIX BUG CRITICI, SICUREZZA MULTI-TENANT, HEALTHCHECK & CONFIGURAZIONE (PRIORITÀ P0)

### Obiettivo
Risolvere tutti i crash confermati, chiudere la falla di sicurezza su streaming/miniature, correggere le query SQL e allineare configurazione, Docker e scanner browser.

### 1. Autenticazione Flessibile (Header Bearer O Query `?token=`) — `backend/app/api/deps.py`
- Aggiungi una nuova dipendenza `get_current_user_from_header_or_query`:
  ```python
  from fastapi import Depends, HTTPException, status, Query, Request

  def get_current_user_from_header_or_query(
      request: Request,
      token: Optional[str] = Query(None),
      db: Session = Depends(get_db)
  ) -> User:
      raw_token = token
      auth_header = request.headers.get("Authorization")
      if auth_header and auth_header.lower().startswith("bearer "):
          raw_token = auth_header.split(" ", 1)[1].strip()
      if not raw_token:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="Autenticazione richiesta o token mancante",
              headers={"WWW-Authenticate": "Bearer"},
          )
      payload = decode_access_token(raw_token)
      if not payload or "sub" not in payload:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="Autenticazione richiesta o token scaduto",
              headers={"WWW-Authenticate": "Bearer"},
          )
      user = db.query(User).filter(User.id == payload["sub"]).first()
      if not user:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="Utente non trovato",
              headers={"WWW-Authenticate": "Bearer"},
          )
      return user
  ```

### 2. Sicurezza su `/thumbnail` e `/stream` + Protezione Path Traversal — `backend/app/api/v1/media.py`
- Crea un helper `resolve_safe_source_file(root_path: str, relative_path: str) -> Optional[str]`:
  ```python
  def resolve_safe_source_file(root_path: str, relative_path: str) -> Optional[str]:
      if not root_path or not relative_path:
          return None
      try:
          real_root = os.path.realpath(root_path)
          real_target = os.path.realpath(os.path.join(real_root, relative_path))
          if os.path.commonpath([real_root, real_target]) != real_root:
              return None
          if os.path.isfile(real_target):
              return real_target
      except (ValueError, OSError):
          return None
      return None
  ```
- In `GET /api/v1/media/{media_id}/thumbnail`:
  - Usa `current_user: User = Depends(get_current_user_from_header_or_query)`.
  - Verifica ownership: `media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()`. Se assente -> `404`.
  - Mantieni `Cache-Control: private, max-age=604800` (non `public`).
- In `GET /api/v1/media/{media_id}/stream`:
  - Usa `current_user: User = Depends(get_current_user_from_header_or_query)` e aggiungi parametro opzionale `download: bool = Query(False)`.
  - Verifica ownership: `media = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()`. Se assente -> `404`.
  - Usa `resolve_safe_source_file(s.root_path, f.relative_path)` per ogni file associato.
  - Se `download=True`, aggiungi `content_disposition_type="attachment"` in `FileResponse` (altrimenti `"inline"`).
- **Frontend (`frontend/src/services/api.ts`)**:
  - Aggiorna `getThumbnailUrl(mediaId: string)` per includere il token in query string esattamente come `getMediaStreamUrl`:
    ```ts
    public static getThumbnailUrl(mediaId: string): string {
      const token = this.getToken();
      return `${API_BASE}/media/${mediaId}/thumbnail${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }
    ```
  - Aggiungi `getMediaDownloadUrl(mediaId: string)` che restituisce `/api/v1/media/${mediaId}/stream?download=true&token=...`.
  - **Fix `204 No Content` in `ApiClient.request()`** (`frontend/src/services/api.ts` riga 38):
    ```ts
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
    ```

### 3. Fix Crash `delete_source` & Cleanup Miniature Orfane — `backend/app/services/source_service.py`
- Importa `Media` da `app.models.entities` a riga 7 (`from app.models.entities import Source, File, Thumbnail, Media`) e `settings` da `app.core.config`.
- In `delete_source(db, user_id, source_id)`:
  1. Raccogli `affected_media_ids`.
  2. Elimina la fonte (`db.delete(source); db.commit()`).
  3. Processa `affected_media_ids` in **chunk da 500 elementi** (per rispettare il limite parametri di SQLite):
     - Trova gli `orphan_ids` (media senza più `File`).
     - Prima di eliminare i `Media` orfani, recupera i `Thumbnail.storage_path` relativi a `orphan_ids`, elimina i record `Media` (`synchronize_session=False`), fai `db.commit()`, e infine rimuovi i file `.webp` fisici da `os.path.join(settings.THUMBNAILS_DIR, storage_path)` se presenti e solo se nessun altro `Thumbnail` nel DB punta allo stesso `storage_path`!

### 4. Fix Query SQL & Live Photos in `backend/app/services/media_service.py`
- In `list_user_media()`:
  - Sostituisci `func.count(File.id)` con `func.count(func.distinct(File.id)).label("copies_count")` e `func.count(func.distinct(Thumbnail.id)).label("thumb_count")`.
  - Per il filtro `search`, NON fare `.outerjoin(MediaTag).outerjoin(Tag)` sulla query principale (che entra in conflitto con `tag_id` e genera prodotti cartesiani!). Usa invece una sottoquery `exists()`:
    ```python
    from sqlalchemy import or_, exists
    tag_match_exists = exists().where(
        MediaTag.media_id == Media.id,
        MediaTag.tag_id == Tag.id,
        Tag.name.ilike(s)
    )
    ```
    e inserisci `tag_match_exists` dentro `or_(...)`!
  - In questo modo `search` + `tag_id` + `album_id` funzionano insieme senza errori né moltiplicazione di `copies_count`.
- In `get_timeline_buckets(db, user_id)`:
  - Escludi i `.mov` secondari delle Live Photos usando la stessa `live_video_subq` di `list_user_media()` così i conteggi dei mesi corrispondono esattamente alla galleria principale.
- In `list_duplicate_groups()`:
  - Filtra `File.availability_status != "missing"` nella subquery e nella query dei file, così i file già marcati mancanti non falsano i duplicati attivi.

### 5. Fix `ScansView.tsx` (Batch Ordering, Abort Safety, `filesystem_modified_at`) & Stale Scan Recovery
- **Frontend (`frontend/src/features/scans/ScansView.tsx`)**:
  - Sostituisci `modified_at: file.modifiedAt` con `filesystem_modified_at: file.modifiedAt`.
  - Gestisci i batch in modo serializzato tramite una catena di Promise (`let batchChain: Promise<void> = Promise.resolve();`):
    ```ts
    const flushBatch = () => {
      if (buffer.length === 0 || !activeScanJobRef.current) return batchChain;
      const toSend = [...buffer];
      buffer = [];
      batchChain = batchChain.then(async () => {
        try {
          await ApiClient.sendBatch(
            activeScanJobRef.current.id,
            toSend,
            toSend[toSend.length - 1].relative_path
          );
        } catch (err) {
          console.error('Batch upload error:', err);
        }
      });
      return batchChain;
    };
    ```
    Al termine di `engine.scan()`, chiama `await flushBatch(); await batchChain;` PRIMA di `reconcileSource` e `completeScan`.
  - Traccia `let wasAborted = false;` (impostato a `true` quando si clicca **"Ferma"**): se `wasAborted === true`, **NON chiamare `ApiClient.reconcileSource()`**! Chiama invece `ApiClient.completeScan(job.id, result.files.length, result.errors.length, 'Scansione interrotta manualmente dall\'utente')`.
- **Backend (`backend/app/services/scan_service.py` + `backend/app/main.py`)**:
  - Aggiungi `recover_stale_scans(db: Session) -> int` in `scan_service.py`:
    - Trova tutti i `ScanJob` con `status == "running"` (e tutte le `Source` con `status == "scanning"`) rimasti aperti da un riavvio precedente.
    - Marca i `ScanJob` come `status = "failed"`, `error_message = "Scansione interrotta (riavvio server o sessione chiusa)"`, `completed_at = utc_now()`.
    - Ripristina `Source.status` a `"online"` se `root_path` non è impostato o esiste su disco, altrimenti `"offline"`.
  - Chiama `recover_stale_scans` all'avvio in `backend/app/main.py` dentro un blocco protetto (e NON nei test `conftest.py`, usando `SessionLocal` solo in `main.py` / lifespan).

### 6. Allineamento Healthcheck, Dipendenze & Configurazione Docker
- `backend/app/api/v1/router.py`: aggiungi `@api_router.get("/health", tags=["Health"])` che restituisce `{"status": "healthy", "project": settings.PROJECT_NAME, "version": settings.VERSION}` (mantenendo anche `/health` in `main.py`).
- `backend/requirements.txt`: rimuovi il duplicato `reverse_geocoder>=1.5.1` e aggiungi `Pillow>=10.0.0` e `requests>=2.31.0`.
- `backend/app/core/config.py`: supporta gli alias `DATABASE_PATH` (se impostato e `DATABASE_URL` non è passato esplicitamente, costruisci `f"sqlite:///{os.environ['DATABASE_PATH']}"`) e `JWT_SECRET_KEY` (fallback per `SECRET_KEY`), oppure aggiorna `docker-compose.yml` per passare `DATABASE_URL=sqlite:////data/media.db`, `SECRET_KEY=${JWT_SECRET_KEY:-...}`, `ACCESS_TOKEN_EXPIRE_MINUTES=43200`. Fai entrambe le cose per massima compatibilità!
- `frontend/src/features/settings/SettingsView.tsx`: sostituisci `fetch('http://localhost:8000/health')` con `fetch('/api/v1/health')` e mostra `window.location.origin + '/api/v1'` al posto dell'URL hardcoded `http://localhost:8000/api/v1`.

### Verifica Task 6.1
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 6.2 — PERFORMANCE & SCALABILITÀ (INGESTION, DUPLICATI, RICERCA, MAPPA CLUSTERING) (PRIORITÀ P1)

### Obiettivo
Rimuovere i colli di bottiglia quadratici / N+1 in ingestion e deduplicazione, aggiungere debounce e conteggio totale alla ricerca, e implementare il clustering sulla mappa GPS per gestire migliaia di foto senza rallentamenti.

### 1. Ottimizzazione Ingestion: Live Photo Scoped & Batch Reverse Geocoding (`backend/app/services/ingestion_service.py` + `geo_service.py`)
- **Live Photo Linking Scoped per Directory**:
  - Modifica `link_live_photos_for_user(db: Session, user_id: str, source_id: Optional[str] = None, directories: Optional[set[str]] = None) -> int`:
    - Se `source_id` e `directories` sono passati (chiamata da `process_scan_batch`), carica SOLO i `File` di quella `source_id` che si trovano in quelle cartelle (usando filtro `File.source_id == source_id` e filtrando per `dir_name in directories`, evitando il full-table scan di tutti i file dell'utente a ogni batch!).
    - Se `source_id` è `None` (chiamata retroattiva globale), mantieni il comportamento completo su tutto l'utente.
  - In `process_scan_batch`, raccogli `touched_dirs = {os.path.dirname(item.relative_path or "") for item in batch_data.items}` e chiama `link_live_photos_for_user(db, user_id, source_id=source_id, directories=touched_dirs)`.
- **Batch Reverse Geocoding senza `db.commit()` nel ciclo**:
  - In `backend/app/services/geo_service.py`: aggiungi `resolve_and_cache_places_batch(db: Session, coords: List[Tuple[float, float]]) -> Dict[str, str]`:
    1. Deduplica le chiavi `coord_to_key(lat, lon)`.
    2. Cerca tutte le chiavi già in cache `geo_places` in una sola query `SELECT coord_key, place_name FROM geo_places WHERE coord_key IN (...)`.
    3. Per le sole coordinate mancanti (se `HAS_RG` è `True`), chiama `rg.search(missing_coords, verbose=False)` **una sola volta** per l'intero batch e inserisci in `geo_places` senza `db.commit()` intermedio (lasciando il commit al chiamante o in transazione unica).
  - In `process_scan_batch`: prima del ciclo `for item in batch_data.items:`, pre-risolvi tutte le coordinate del batch con `resolve_and_cache_places_batch` in un'unica chiamata!
  - In `backend/app/tests/conftest.py`: chiama `init_geo_places_cache(engine)` dentro la fixture `db_engine` così anche il DB di test in-memory ha la tabella `geo_places`.

### 2. Logica "Salute Backup & Ridondanza Intelligente", Gap Analysis tra Dischi & Rimozione N+1 (`media.py`, `media_service.py`, `duplicates.py`, `DuplicatesView.tsx`, `LibraryView.tsx`)

#### Concetto di Prodotto da Implementare
In un catalogo distribuito su più dischi fisici, avere più copie **non è sempre uno spreco**:
- 🔴 **`unprotected` (A Rischio / 1 Solo Disco)**: `distinct_sources_count == 1` e `copies_count == 1`. Se quell'unico disco si rompe, il ricordo è perso.
- 🟢 **`protected` (Ridondanza Sana Multi-Disco)**: `distinct_sources_count >= 2` e `copies_count == distinct_sources_count` (1 copia su ciascuno dei $N$ dischi diversi = **Backup Sano**, zero spreco).
- 🟠 **`intra_source_duplicate` (Duplicato Spreco Intra-Disco)**: `copies_count > distinct_sources_count` (esistono 2+ copie identiche **sullo stesso disco fisico**, che non aumentano la tolleranza ai guasti e sono vero spazio sprecato recuperabile!).

#### Modifiche Backend (`backend/app/schemas/media.py`, `media_service.py`, `duplicates.py`)
1. **Nuovi Campi di Resilienza su `MediaOut` e `DuplicateGroupOut` (`backend/app/schemas/media.py`)**:
   - In `MediaOut`:
     - `distinct_sources_count: int = 1`
     - `protection_status: str = "unprotected"` (`"unprotected"` | `"protected"` | `"intra_source_duplicate"`)
   - In `DuplicateGroupOut`:
     - `distinct_sources_count: int = 1`
     - `redundancy_type: str = "intra_source_duplicate"` (`"healthy_multi_source"` se `copies_count == distinct_sources_count`, altrimenti `"intra_source_duplicate"`)
     - `intra_source_wasted_bytes: int = 0` (`single_size * (copies_count - distinct_sources_count)`)
2. **Calcolo `distinct_sources_count` e Filtro `protection_status` in `list_user_media()` (`media_service.py` & `media.py`)**:
   - Nella query di `list_user_media()`, seleziona anche `func.count(func.distinct(File.source_id)).label("distinct_sources_count")`.
   - Calcola `protection_status`:
     - `"intra_source_duplicate"` se `copies_count > distinct_sources_count`
     - `"protected"` se `distinct_sources_count >= 2` e `copies_count == distinct_sources_count`
     - `"unprotected"` altrimenti (`distinct_sources_count <= 1` e `copies_count <= 1`)
   - Aggiungi il parametro query `protection_status: Optional[str] = Query(None)` in `GET /api/v1/media`:
     - `"unprotected"`: `having(and_(func.count(func.distinct(File.source_id)) <= 1, func.count(func.distinct(File.id)) <= 1))`
     - `"protected"`: `having(and_(func.count(func.distinct(File.source_id)) >= 2, func.count(func.distinct(File.id)) == func.count(func.distinct(File.source_id))))`
     - `"intra_source_duplicate"`: `having(func.count(func.distinct(File.id)) > func.count(func.distinct(File.source_id)))`
3. **Refactoring `list_duplicate_groups()` (Zero N+1 + Filtro Modalità)**:
   - Aggiungi parametro `mode: str = "all"` (`"all"` | `"intra_source"` | `"multi_source"`):
     - `"intra_source"`: solo i gruppi con `COUNT(File.id) > COUNT(DISTINCT File.source_id)` (duplicati sullo stesso disco).
     - `"multi_source"`: solo i gruppi con `COUNT(DISTINCT File.source_id) >= 2` e `COUNT(File.id) == COUNT(DISTINCT File.source_id)` (repliche di backup sane su dischi diversi).
   - Elimina le query N+1 caricando `File` + `Source` e `Thumbnail` per tutti i `page_media_ids` in 2 sole query bulk (escludendo sempre `File.availability_status == "missing"`).
4. **Riepilogo Salute Backup & Ridondanza (`GET /api/v1/duplicates/summary`)**:
   - Restituisce:
     - `total_groups`: totale gruppi con `copies_count > 1`
     - `intra_source_groups`: gruppi con copie doppie sullo stesso disco
     - `healthy_multi_source_groups`: gruppi replicati su 2+ dischi senza doppioni intra-disco
     - `unprotected_media_count`: media presenti su **1 sola fonte fisica** (`distinct_sources_count == 1`)
     - `unprotected_favorites_count`: media **Preferiti (`is_favorite == 1`)** presenti su **1 sola fonte fisica** (priorità massima di backup!)
     - `protected_media_count`: media presenti su **2+ fonti fisiche distinte** (`distinct_sources_count >= 2`)
     - `protection_coverage_pct`: percentuale del catalogo protetta su almeno 2 dischi
     - `intra_source_wasted_bytes`: spazio realmente sprecato da copie doppie sullo **stesso** disco (`sum(size * (copies - distinct_sources))`)
     - `multi_source_backup_bytes`: spazio investito in repliche di sicurezza su altri dischi
     - `total_recoverable_bytes`: alias retrocompatibile (`sum(size * (copies - 1))`)
     - `total_redundant_copies`: `sum(copies - 1)`
5. **Nuovo Endpoint Gap Analysis tra 2 Fonti (`GET /api/v1/duplicates/backup-gap`)**:
   - Parametri:
     - `primary_source_id: str = Query(...)` (es. Disco Principale / SSD)
     - `backup_source_id: str = Query(...)` (es. Disco di Backup / NAS)
     - `only_favorites: bool = Query(False)`
     - `export_format: Optional[str] = Query(None, pattern="^(csv|json|rsync_txt)$")`
   - Logica (confronto per `Media.id` / `canonical_sha256`, quindi funziona anche se sul disco di backup i file hanno nomi o cartelle diverse!):
     - Trova tutti i `Media` attivi (`availability_status != "missing"`) presenti su `primary_source_id`.
     - Verifica quali di questi `Media` hanno almeno una copia attiva su `backup_source_id` (`backed_up_count`) e quali **NON esistono su `backup_source_id`** (`missing_on_backup`).
     - Se `export_format` non è specificato, restituisce JSON:
       ```json
       {
         "primary_source_id": "...",
         "backup_source_id": "...",
         "total_primary_media": 2100,
         "backed_up_media": 1800,
         "missing_on_backup_count": 300,
         "missing_on_backup_bytes": 1450000000,
         "coverage_pct": 85.7,
         "missing_items": [
           { "media_id": "...", "filename": "...", "relative_path": "...", "size_bytes": 4200000, "captured_at": "...", "is_favorite": true, "has_thumbnail": true }
         ]
       }
       ```
     - Se `export_format == "rsync_txt"`, restituisce `text/plain` con un `relative_path` per riga (pronto per `rsync -av --files-from=missing_backup.txt /Volumes/Primary/ /Volumes/Backup/`, 100% read-only!).
     - Se `export_format == "csv"` o `"json"`, scarica il report completo dei file da copiare sul disco di backup.
6. **Export Intelligente (`GET /api/v1/duplicates/export`)**:
   - Distingue `recommended_action` in 3 valori chiari:
     - `KEEP_PRIMARY` (la prima copia sulla fonte preferita/principale)
     - `KEEP_BACKUP_REPLICA` (la prima copia su ciascuna **altra** fonte fisica distinta — da conservare come backup!)
     - `REDUNDANT_SAME_SOURCE` (le copie duplicate **sulla stessa fonte fisica** — vere candidate alla pulizia!).

#### Modifiche Frontend (`DuplicatesView.tsx` & `LibraryView.tsx`)
1. **In `LibraryView.tsx`**:
   - Aggiungi filtro rapido **Stato Protezione Backup**:
     - `Tutti` | `🛡️ Protetti (2+ Dischi)` | `🔴 A Rischio (1 Disco)` | `⚠️ Duplicati Intra-Disco`
   - Sulle card media:
     - Se `protection_status === 'protected'`: mostra badge **verde `🛡️ {distinct_sources_count} DISCHI`** (al posto del vecchio warning arancione!).
     - Se `protection_status === 'intra_source_duplicate'`: mostra badge **ambra `⚠️ {copies_count} COPIE ({distinct_sources_count} DISCHI)`**.
2. **In `DuplicatesView.tsx` (Ridenominato "Protezione Backup, Ridondanza & Duplicati")**:
   - **3 Card KPI in alto**:
     1. 🟢 **Copertura Backup Multi-Disco**: `{protection_coverage_pct}%` (`{protected_media_count}` media su 2+ dischi).
     2. 🔴 **A Rischio (1 Solo Disco)**: `{unprotected_media_count}` media (`{unprotected_favorites_count}` Preferiti senza 2° disco!).
     3. 🟠 **Spreco Reale Intra-Disco**: `{formatBytes(intra_source_wasted_bytes)}` (`{intra_source_groups}` file duplicati sullo *stesso* disco).
   - **4 Tab Operativi**:
     1. **Duplicati Intra-Disco (Spreco Reale)** (`mode="intra_source"`) — copie multiple sullo stesso disco.
     2. **Repliche Multi-Disco (Backup Sani)** (`mode="multi_source"`) — media custoditi su 2+ dischi diversi, con badge verde `REPLICA DI SICUREZZA`.
     3. **Verifica Copertura & Gap tra 2 Dischi** — selettore *Fonte Primaria* vs *Fonte di Backup*, barra percentuale di copertura, filtro *"Solo Preferiti non copiati"*, griglia dei file mancanti sul disco di backup e pulsanti **"Esporta Lista CSV"** / **"Esporta `rsync --files-from` (.txt)"**.
     4. **Foto Simili / Raffiche (`dHash`)** con selettore sensibilità `max_distance` (`4`, `6`, `10`) e filtro `max_time_diff_hours=24`.

### 3. Ricerca con Debounce, AbortController & Conteggio Totale (`media.py`, `media_service.py`, `LibraryView.tsx`)
- **Backend (`backend/app/services/media_service.py` & `backend/app/api/v1/media.py`)**:
  - Aggiungi una funzione helper `count_user_media(...)` (o restituisci `(items, total)` internamente) e imposta l'header HTTP `X-Total-Count` (e `Access-Control-Expose-Headers: X-Total-Count` in `main.py` CORS middleware) nella risposta di `GET /api/v1/media`, mantenendo il body JSON invariato (`List[MediaOut]`) per retrocompatibilità totale!
- **Frontend (`frontend/src/features/library/LibraryView.tsx` & `api.ts`)**:
  - Aggiungi `debouncedSearch` (300ms via `useEffect` + `setTimeout`) così la digitazione nella barra di ricerca non invia una query per ogni carattere.
  - Usa `AbortController` dentro l'effect di `fetchMedia` (passando `signal` a `ApiClient.getMedia`) per cancellare richieste obsolete ed evitare race condition nei risultati.
  - Mostra un contatore discreto sopra la griglia: `Visualizzati {mediaList.length} di {totalCount} elementi` (se `X-Total-Count` è disponibile).

### 4. Clustering Mappa GPS & Fix Sicurezza/Cleanup (`frontend/src/features/map/MapView.tsx`)
- **Protezione XSS**: crea un helper `escapeHtml(str: string): string` (`&`, `<`, `>`, `"`, `'`) e applicalo sempre a `item.primary_filename` e `item.place_name` nel popup Leaflet.
- **Clustering Spaziale Zoom-Aware in TypeScript Puro (zero dipendenze npm)**:
  - Crea una funzione `clusterMapPoints(items: MapMediaItem[], map: L.Map, cellSizePx = 56)` che proietta ogni punto con `map.latLngToLayerPoint([item.latitude, item.longitude])`, raggruppa i punti nella stessa cella `Math.floor(pt.x / cellSizePx), Math.floor(pt.y / cellSizePx)` e produce:
    - **Cluster con `count > 1`**: `L.divIcon` circolare con miniatura del primo scatto (o badge blu `#0284c7`) e numero di foto (`count`), cliccabile per fare `map.setView(center, Math.min(map.getZoom() + 2, 18))` oppure aprire un popup con anteprima + pulsante **"Vedi tutte le {count} foto in quest'area"** (`onNavigateToLocation`).
    - **Singolo punto (`count === 1`)**: marker con miniatura circolare o pin standard e popup sicuro con pulsante Dettaglio e "Tutte le foto qui".
  - Aggiorna i cluster sugli eventi `zoomend` e `moveend` usando un `L.LayerGroup` dedicato (`markersLayerRef`) così anche con 10.000 foto geolocalizzate la mappa renderizza sempre < 100 nodi DOM!
- **Cleanup corretto**: nell'`useEffect` di inizializzazione mappa, ritorna `() => { map.remove(); mapInstanceRef.current = null; }` per evitare memory leak al cambio tab.
- **Arricchisci `MapMediaOut`** (`backend/app/schemas/media.py` + `media_service.py`): includi `place_name: Optional[str] = None` così i popup mappa mostrano anche la località!

### Verifica Task 6.2
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 6.3 — ESPERIENZA UTENTE: EXIF COMPLETI, LIGHTBOX ALTA RISOLUZIONE, TASTIERA & VISTA ALBUM/TAG (PRIORITÀ P1)

### Obiettivo
Portare la fruizione quotidiana del catalogo al livello di un media manager moderno: EXIF completi funzionanti, preview in alta risoluzione on-the-fly (inclusi HEIC e RAW), navigazione tastiera nel lightbox e gestione dedicata di Album & Tag.

### 1. Riparazione & Arricchimento EXIF + Endpoint Preview Alta Risoluzione Read-Only
- **Backend (`backend/app/schemas/media.py` & `backend/app/services/media_service.py`)**:
  - Aggiungi `metadata_json: Optional[str] = None` a `FileOut` e popolalo in `get_media_detail()` (`metadata_json=f.metadata_json`).
- **Backend (`backend/app/api/v1/media.py`) — Nuovo Endpoint `GET /api/v1/media/{media_id}/preview`**:
  - Protetto con `Depends(get_current_user_from_header_or_query)` e ownership check `Media.user_id == current_user.id`.
  - Parametro opzionale `max_edge: int = Query(1920, ge=400, le=3840)`.
  - Usa `resolve_safe_source_file(s.root_path, f.relative_path)` per localizzare una copia online.
  - Se non trovata su disco -> `404` ("Disco offline o file non accessibile").
  - Se trovata (100% read-only sul file sorgente):
    - Se è un formato web nativo (`jpg`, `jpeg`, `png`, `webp`, `gif`) e `size_bytes <= 8 * 1024 * 1024`: può restituire direttamente `FileResponse` o ricodificare ridimensionato a `max_edge` JPEG quality `88` in memoria (`Response(content=..., media_type="image/jpeg")`) dopo `ImageOps.exif_transpose`.
    - Se è **RAW** (`ext in RAW_EXTENSIONS`): estrai il JPEG embedded più grande (riutilizzando una funzione condivisa in `backend/app/services/media_preview_service.py`) o usa `sips` su macOS come fallback -> restituisci `image/jpeg` max `1920px`.
    - Se è **HEIC/HEIF**: prova `Pillow` (con `pillow_heif` opzionale) -> fallback `sips` su macOS -> restituisci `image/jpeg` max `1920px`.
    - Imposta header `Cache-Control: private, max-age=3600`.
- **Frontend (`frontend/src/services/api.ts`)**:
  - Aggiungi `ApiClient.getMediaPreviewUrl(mediaId: string, maxEdge = 1920)`.

### 2. Potenziamento `MediaDetailModal.tsx` (Lightbox HD, EXIF completi, Tastiera, Sync Preferiti)
- Estendi le props di `MediaDetailModal`:
  ```ts
  interface MediaDetailModalProps {
    mediaId: string | null;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    hasPrev?: boolean;
    hasNext?: boolean;
    onFavoriteChanged?: (mediaId: string, isFavorite: boolean) => void;
  }
  ```
- **Navigazione da Tastiera (`useEffect` su `window.keydown`)**:
  - Ignora gli eventi se `document.activeElement` è un `<input>`, `<textarea>` o `<select>`.
  - `Escape` -> `onClose()`
  - `ArrowLeft` -> `if (hasPrev && onPrev) onPrev()`
  - `ArrowRight` -> `if (hasNext && onNext) onNext()`
  - `f` / `F` -> toggle preferito del media corrente
- **Pulsanti Freccia Prev/Next** sul pannello sinistro del modale (e passa `onPrev`/`onNext`/`hasPrev`/`hasNext`/`onFavoriteChanged` da `LibraryView.tsx` basandosi sull'indice di `selectedMediaId` in `mediaList`).
- **Visualizzazione Alta Risoluzione & Download**:
  - Nel pannello preview per le immagini, carica la miniatura istantaneamente e offri il pulsante **"Carica HD (se disco online)"** (o carica automaticamente `/preview` in overlay progressivo con fallback silenzioso alla miniatura se `onError` / disco offline!) + pulsante **"Scarica Originale"** (`ApiClient.getMediaDownloadUrl(data.id)`).
- **Sezione EXIF Completa**:
  - Mostra `data.place_name` e `data.latitude`/`data.longitude` direttamente dai campi di `MediaDetailOut` (anche se `metadata_json` non li ripetesse).
  - Dal JSON parsato di `primaryFile.metadata_json` (gestendo sia chiavi camelCase da `exifr` browser sia PascalCase da Pillow/agent, es. `meta.make || meta.Make`, `meta.model || meta.Model`, `meta.lensModel || meta.LensModel`, `meta.fNumber`, `meta.exposureTime`, `meta.iso`):
    - Fotocamera (`Make + Model`), Obiettivo (`LensModel`)
    - Pillole parametri di scatto: `f/{fNumber}`, `{exposureTime < 1 ? '1/' + Math.round(1/exposureTime) + 's' : exposureTime + 's'}`, `ISO {iso}`
    - Badge sidecar: `Apple Edits (.AAE)` se `meta.has_apple_edits`, `Lightroom / XMP (.XMP)` se `meta.has_xmp_sidecar`.
- Quando cambia `is_favorite` dentro `MediaDetailModal`, chiama `onFavoriteChanged?.(mediaId, res.is_favorite)` così la griglia sottostante si aggiorna subito.

### 3. Vista Dedicata "Album & Tag" (`AlbumsView.tsx` + Backend Update Album + Sidebar)
- **Backend (`backend/app/schemas/album_tag.py` & `backend/app/api/v1/albums.py`)**:
  - Aggiungi `cover_media_id: Optional[str] = None` a `AlbumOut`.
  - Aggiungi schema `AlbumUpdate(BaseModel): name: Optional[str] = None; description: Optional[str] = None`.
  - In `GET /api/v1/albums`: per ogni album restituisci anche `cover_media_id` (l'ID del primo media dell'album che possiede una miniatura, o il primo media dell'album).
  - Aggiungi endpoint `PATCH /api/v1/albums/{album_id}` (rinomina / aggiorna descrizione con ownership check).
- **Frontend (`frontend/src/features/albums/AlbumsView.tsx` + `Sidebar.tsx` + `Topbar.tsx` + `App.tsx`)**:
  - Aggiungi `ApiClient.updateAlbum(albumId, name, description)`.
  - Crea `frontend/src/features/albums/AlbumsView.tsx`:
    - Sezione **Album Virtuali**: griglia di card con immagine di copertina (`cover_media_id`), nome, descrizione, contatore media, pulsante **"+ Nuovo Album"**, pulsanti rapidi **Rinomina** e **Elimina** (con conferma chiara "Solo album virtuale, nessun file toccato"), e click sulla card -> naviga a `library` pre-filtrata su quell'`albumId`!
    - Sezione **Tag Personalizzati**: elenco pillole colorate con nome, contatore media, form rapido creazione tag con color picker (6 colori preset + custom), click sul tag -> naviga a `library` pre-filtrata su quel `tagId`, e pulsante elimina tag.
  - Aggiungi voce **"Album & Tag"** in `Sidebar.tsx`, titolo in `Topbar.tsx` e stato `initialAlbumId` / `initialTagId` in `App.tsx` passati a `LibraryView.tsx`.
  - In `LibraryView.tsx`: mostra una pillola filtro attiva con pulsante `✕` quando si proviene da un album o tag, e nella Floating Batch Action Bar aggiungi un'opzione rapida **"+ Nuovo Album da selezione"** (chiede il nome, crea l'album e aggiunge tutti i `selectedIds`).

### Verifica Task 6.3
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 6.4 — SCANNER NATIVO LATO SERVER (BACKGROUND) & BACKFILL AUTOMATICO MINIATURE RAW/VIDEO (PRIORITÀ P1/P2)

### Obiettivo
Permettere all'utente di avviare una **scansione nativa lato server in background** su qualsiasi fonte con `root_path` accessibile dall'host (es. `/Volumes/SSD_512_Sam`), con supporto completo per RAW, HEIC e video (tramite `ffmpeg` o macOS `sips`/`qlmanage`), monitoraggio live dalla UI e annullamento sicuro.

### 1. Servizio Condiviso Estrazione Preview/Miniature (`backend/app/services/media_preview_service.py`)
Crea un modulo pulito e riutilizzabile da **sia** `/media/{id}/preview` **sia** `local_scanner_service.py`:
- Costanti condivise: `RAW_EXTENSIONS`, `IMAGE_EXTENSIONS`, `VIDEO_EXTENSIONS`, `IGNORED_EXTENSIONS`, `IGNORED_DIR_NAMES`.
- `extract_largest_embedded_jpeg(filepath: str, max_read_bytes: int = 12 * 1024 * 1024) -> Optional[bytes]`:
  - Trova tutti i blocchi `\xff\xd8\xff ... \xff\xd9` > 8192 byte e verifica con `Image.open(io.BytesIO(candidate)).verify()`.
- `generate_image_preview_bytes(filepath: str, max_edge: int = 320, quality: int = 65, fmt: str = "WEBP") -> Tuple[Optional[bytes], Optional[int], Optional[int], Dict[str, Any], Optional[datetime]]`:
  - Registra `pillow_heif` opzionalmente (`try: import pillow_heif; pillow_heif.register_heif_opener() except Exception: pass`).
  - Estrae EXIF completi (`Make`, `Model`, `LensModel`, `DateTimeOriginal`, `GPSInfo` -> `latitude`/`longitude`, `FNumber`, `ExposureTime`, `ISOSpeedRatings`).
  - Per i RAW o immagini non decodificabili direttamente da Pillow: usa `extract_largest_embedded_jpeg`, poi fallback su macOS (`sys.platform == "darwin"`) con `sips -s format jpeg -Z {max_edge} {filepath} --out {tmp_jpg}`.
  - Applica `ImageOps.exif_transpose`, converte in RGB, ridimensiona a `max_edge` e codifica in `fmt` (`WEBP` o `JPEG`).
- `generate_video_thumbnail_bytes(filepath: str, max_edge: int = 320, quality: int = 65) -> Tuple[Optional[bytes], Optional[int], Optional[int], Optional[float]]`:
  1. Se `shutil.which("ffmpeg")` è disponibile: estrae 1 frame a `0.5s` (fallback `0.0s` per video brevi < 0.5s) in pipe JPEG e codifica con Pillow in WebP `max_edge @ quality`. Se `shutil.which("ffprobe")` è disponibile, legge `width`, `height`, `duration`.
  2. Altrimenti, se `sys.platform == "darwin"` e `shutil.which("qlmanage")` è disponibile:
     - Usa `tempfile.TemporaryDirectory()` ed esegue `subprocess.run(["qlmanage", "-t", "-s", str(max(max_edge, 512)), "-o", tmpdir, filepath], capture_output=True, timeout=15)`.
     - Cerca il file `.png` generato dentro `tmpdir`, aprilo con Pillow, convertilo in RGB, ridimensiona a `max_edge` e codifica in WebP `quality`!
     - Questo genera miniature pulite per tutti i `.MOV` e `.MP4` su macOS senza richiedere `ffmpeg`!

### 2. Motore di Scansione Background Lato Server (`backend/app/services/local_scanner_service.py`)
- Mantieni un registro thread-safe in memoria `_ACTIVE_SCANS: Dict[str, threading.Event] = {}` (mappa `scan_id -> cancel_event`) protetto da `_LOCK = threading.Lock()`.
- Implementa `start_server_scan(db: Session, user_id: str, source_id: str, backfill_thumbnails_only: bool = False) -> ScanJob`:
  1. Verifica ownership fonte (`get_source_by_id`), verifica che `source.root_path` sia valorizzato ed esista (`os.path.isdir(source.root_path)`), altrimenti `HTTP 400` ("Percorso fonte non accessibile sul server o disco offline").
  2. Verifica che non ci sia già un job `running` attivo per la stessa `source_id` (`HTTP 409`).
  3. Crea il `ScanJob` tramite `start_scan_job(db, user_id, source_id, 0)`.
  4. Registra `cancel_event = threading.Event()` in `_ACTIVE_SCANS[job.id]` e avvia un `threading.Thread(target=_run_server_scan_worker, args=(job.id, user_id, source_id, source.root_path, backfill_thumbnails_only, cancel_event), daemon=True)`.
  5. Restituisce `job`.
- Implementa `cancel_server_scan(db: Session, user_id: str, scan_id: str) -> ScanJob`:
  - Verifica ownership del job, imposta `cancel_event.set()` se attivo e aggiorna lo stato se non è più in esecuzione.
- Implementa `_run_server_scan_worker(...)`:
  - Apre una propria sessione DB dedicata (`SessionLocal()`, chiusa nel `finally` — mai condividere la sessione HTTP del request thread!).
  - Carica `fingerprints = get_source_file_fingerprints(db, user_id, source_id)`.
  - Attraversa `root_path` con `os.walk` (saltando `IGNORED_DIR_NAMES`, file che iniziano con `.`, e tracciando sidecar `.aae` / `.xmp` nella stessa cartella!).
  - Aggiorna `job.total_files_discovered = len(discovered)` e fa `db.commit()`.
  - Itera i file in batch da `25`:
    - Controlla `cancel_event.is_set()` ad ogni file: se annullato, salva l'ultimo batch elaborato, chiama `complete_scan_job(..., error_message="Scansione annullata dall'utente")` **SENZA chiamare `reconcile_source_files`** e termina pulitamente!
    - Smart incremental skip + backfill:
      - Se `backfill_thumbnails_only=True`: salta tutti i file che hanno già `fp.get("has_thumbnail") is True`.
      - Se il file è noto con stessa `size_bytes` e `sha256`: riutilizza `sha256` (zero rilettura SHA-256!). Se `has_thumbnail is False`, rigenera comunque metadati + miniatura!
      - Altrimenti calcola SHA-256 a chunk da 64 KB + metadati + miniatura.
    - Chiama `process_scan_batch(db, user_id, scan_id, ScanBatchRequest(items=batch, checkpoint_path=rel_path))`.
  - Se completata senza cancellazione e `backfill_thumbnails_only is False`: esegui `reconcile_source_files(db, user_id, source_id, seen_paths)`.
  - Chiama `complete_scan_job(db, user_id, scan_id, processed_total, failed_total)`.
  - Nel `finally`: rimuovi `scan_id` da `_ACTIVE_SCANS` e chiudi la sessione DB.

### 3. Nuovi Endpoint & Integrazione UI (`scans.py`, `api.ts`, `ScansView.tsx`, `SourcesView.tsx`)
- **Backend (`backend/app/api/v1/scans.py`)**:
  - `POST /api/v1/scans/{source_id}/server-scan` (body opzionale `{ "backfill_thumbnails_only": false }`, response `ScanJobOut`, status `201`).
  - `POST /api/v1/scans/{scan_id}/cancel` (response `ScanJobOut`).
- **Frontend (`frontend/src/services/api.ts`)**:
  - `ApiClient.startServerScan(sourceId: string, backfillThumbnailsOnly = false)`
  - `ApiClient.cancelScan(scanId: string)`
  - `ApiClient.getScanStatus(scanId: string)`
- **Frontend (`frontend/src/features/scans/ScansView.tsx` & `SourcesView.tsx`)**:
  - In `ScansView.tsx`:
    - Se la fonte selezionata ha `root_path` valorizzato e `status !== 'offline'`, mostra un blocco dedicato **"Scansione Nativa dal Server (Consigliata · Background · Supporto RAW/Video)"** con 2 pulsanti:
      1. **"Avvia Scansione Completa dal Server"**
      2. **"Rigenera Solo Miniature Mancanti (Veloce)"** (`backfillThumbnailsOnly = true`)
    - Quando esiste un job `running` (rilevato anche ricaricando `getScans()` all'apertura della pagina!), attiva un polling ogni `1500ms` su `GET /api/v1/scans/{activeJobId}` mostrando barra progresso live (`processed_files / total_files_discovered`, `last_checkpoint_path`) e pulsante **"Annulla Scansione"** (`POST /api/v1/scans/{id}/cancel`).
  - In `SourcesView.tsx`:
    - Aggiungi sulle card delle fonti con `root_path` online un pulsante rapido **"Scansiona Server"** che avvia o apre direttamente la scansione server per quella fonte.

### Verifica Task 6.4
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 6.5 — DASHBOARD ANALITICA, BACKUP CATALOGO WAL-SAFE, MANUTENZIONE & TOAST SYSTEM (PRIORITÀ P2)

### Obiettivo
Completare la qualità percepita del prodotto con statistiche approfondite, backup scaricabile del database SQLite in sicurezza WAL, strumenti di manutenzione 1-click e un sistema Toast pulito al posto di `alert()`.

### 1. Dashboard Arricchita (`backend/app/services/media_service.py` + `DashboardView.tsx`)
- Estendi `get_dashboard_stats(db, user_id)` aggiungendo (mantenendo intatti tutti i campi esistenti per retrocompatibilità!):
  - `missing_thumbnails_count`: numero di `Media` dell'utente senza record in `Thumbnail`
  - `geotagged_count`: numero di `Media` con `latitude IS NOT NULL`
  - `favorites_count`: numero di `Media` con `is_favorite == 1`
  - `raw_count`: numero di `Media` con almeno un file in `RAW_EXTENSIONS`
  - `live_photos_count`: numero di `Media` con `is_live_photo == 1`
  - `recoverable_duplicate_bytes`: da `get_duplicates_summary(db, user_id)["total_recoverable_bytes"]`
  - `storage_by_source`: lista `[{ "source_id", "source_name", "status", "file_count", "total_bytes" }]` ordinata per `total_bytes DESC`
- Aggiorna `frontend/src/features/dashboard/DashboardView.tsx`:
  - Mostra una riga di mini-badge informativi (RAW, Live Photos, Geolocalizzati, Preferiti) cliccabili per andare alla vista filtrata corrispondente.
  - Se `missing_thumbnails_count > 0`, mostra un banner informativo discreto (colore ambra) con link rapido a **Scansioni** per rigenerare le miniature mancanti.
  - Aggiungi un pannello **"Distribuzione Spazio per Disco / Fonte"** con barre percentuali pulite in CSS puro.

### 2. Backup DB WAL-Safe & Manutenzione in `SettingsView.tsx`
- **Backend (`backend/app/api/v1/settings.py`)**:
  - `GET /api/v1/settings/backup/db`:
    - Protetto da `Depends(get_current_user)` (o `get_current_user_from_header_or_query`).
    - Ricava il percorso SQLite da `settings.DATABASE_URL` (solo se inizia con `sqlite:///`, altrimenti `400`).
    - Crea una copia consistente usando `sqlite3.connect(src_path)` -> `src_conn.backup(dst_conn)` verso un file temporaneo (100% sicuro anche con WAL attivo e scritture concorrenti!).
    - Restituisce il file con `FileResponse(..., filename=f"pmm_backup_{YYYYMMDD}.db", background=BackgroundTask(os.remove, tmp_path))`.
  - `POST /api/v1/settings/maintenance/geotag-backfill`:
    - Chiama `backfill_all_media_places(db)` e restituisce `{"updated_count": count}`.
  - `POST /api/v1/settings/maintenance/cleanup-stale-scans`:
    - Chiama `recover_stale_scans(db)` (filtrato opzionalmente o per l'utente) e restituisce `{"recovered_count": count}`.
- **Frontend (`frontend/src/features/settings/SettingsView.tsx` & `api.ts`)**:
  - Aggiungi una card **"Backup & Manutenzione Catalogo"** con 3 pulsanti chiari:
    1. **"Scarica Backup Database (.db)"** (download tramite `fetch` con header `Authorization` + Blob download).
    2. **"Aggiorna Località GPS Offline"** (`POST /settings/maintenance/geotag-backfill`).
    3. **"Ripristina Scansioni Bloccate"** (`POST /settings/maintenance/cleanup-stale-scans`).

### 3. Sistema Notifiche Toast (`frontend/src/components/ToastContext.tsx`)
- Crea `frontend/src/components/ToastContext.tsx` con `ToastProvider` e hook `useToast()` (`showToast(message, type: 'success' | 'error' | 'info')`) che renderizza toast eleganti in basso a destra con auto-dismiss dopo 3.5s.
- Avvolgi `<App />` con `<ToastProvider>` in `frontend/src/main.tsx`.
- Sostituisci tutte le chiamate `alert(...)` in `LibraryView.tsx`, `MediaDetailModal.tsx`, `SourcesView.tsx` e `ScansView.tsx` con `showToast(...)`.

---

## SUITE DI TEST AUTOMATIZZATI OBBLIGATORIA (`backend/app/tests/test_phase_6.py`)

Crea `backend/app/tests/test_phase_6.py` usando esclusivamente le fixture isolate `(client, auth_headers, other_user_headers, db)` di `conftest.py` (e `tmp_path` per file sintetici) verificando tutti i casi seguenti:
1. **`test_delete_source_cleans_orphan_media_and_thumbnails`**:
   - Crea una fonte, inserisce un media con miniatura, chiama `DELETE /api/v1/sources/{id}` -> verifica HTTP `204`, fonte eliminata, media orfano eliminato e file `.webp` rimosso da `THUMBNAILS_DIR`.
2. **`test_stream_and_thumbnail_require_auth_and_enforce_ownership`**:
   - Senza token -> `401`.
   - Con `other_user_headers` -> `404` (isolamento multi-tenant!).
   - Con `auth_headers` o `?token=<valid>` -> `200`.
3. **`test_stream_blocks_path_traversal`**:
   - Crea un `File` con `relative_path = "../../etc/passwd"` su una fonte valida -> `GET /api/v1/media/{id}/stream` deve restituire `404` (mai servire file fuori `root_path`!).
4. **`test_search_combined_with_tag_and_copies_count_accuracy`**:
   - Crea 1 media con 2 copie fisiche e 3 tag; esegui `GET /api/v1/media?search=<nome>&tag_id=<tag_id>` -> verifica HTTP `200`, header `X-Total-Count == "1"`, e `copies_count == 2` (non `6`!).
5. **`test_media_detail_exposes_metadata_json_and_preview_endpoint`**:
   - Verifica che `GET /api/v1/media/{id}` includa `files[0]["metadata_json"]` con i campi EXIF.
   - Verifica che `GET /api/v1/media/{id}/preview` restituisca HTTP `200` con `image/jpeg` valido per un'immagine reale in `tmp_path`.
6. **`test_album_cover_and_rename`**:
   - Crea album, aggiungi media con miniatura -> `GET /api/v1/albums` restituisce `cover_media_id == media.id`; `PATCH /api/v1/albums/{id}` aggiorna nome e descrizione.
7. **`test_smart_redundancy_protection_status_and_backup_gap_analysis`**:
   - Crea 2 fonti (`SSD Principale` e `HDD Backup`).
   - Inserisci:
     - **Media A** presente 1 volta su `SSD` e 1 volta su `HDD` -> verifica `distinct_sources_count == 2`, `copies_count == 2`, `protection_status == "protected"` (Ridondanza Sana Multi-Disco, `intra_source_wasted_bytes == 0`), e nel report export la seconda copia è marcata `KEEP_BACKUP_REPLICA`.
     - **Media B** presente 2 volte sullo **stesso** `SSD` (`folder1/b.jpg` e `folder2/b.jpg`) -> verifica `distinct_sources_count == 1`, `copies_count == 2`, `protection_status == "intra_source_duplicate"`, `intra_source_wasted_bytes == size_B`, e nel report export la seconda copia è marcata `REDUNDANT_SAME_SOURCE`.
     - **Media C** (marcato Preferito `is_favorite = True`) presente solo 1 volta su `SSD` -> verifica `protection_status == "unprotected"`, `GET /api/v1/media?protection_status=unprotected&is_favorite=true` restituisce Media C, e `GET /api/v1/duplicates/backup-gap?primary_source_id=SSD&backup_source_id=HDD` riporta **Media B e Media C** come `missing_on_backup` (e `export_format=rsync_txt` elenca i loro `relative_path`).
   - Verifica inoltre che marcando una copia come `missing`, i conteggi si aggiornino escludendo i file `missing`.
8. **`test_server_scan_background_workflow`**:
   - Crea una cartella `tmp_path` con 2 immagini synthetic JPG + 1 sidecar `.xmp`, crea una `Source` con `root_path = str(tmp_path)`, chiama `POST /api/v1/scans/{source_id}/server-scan`, attendi il completamento (polling breve su `GET /api/v1/scans/{scan_id}`), verifica che i 2 media siano indicizzati con miniatura WebP e `has_xmp_sidecar` e che il file `.xmp` non sia un media autonomo.
   - *(Nota tecnica per test con DB in-memory: in `local_scanner_service.py`, permetti di iniettare opzionalmente un `session_factory` o di eseguire in modo sincrono/testabile su `tmp_path` con DB su file temporaneo `tmp_path / "test.db"` così il worker thread condivide lo stesso SQLite in modo deterministico!)*
9. **`test_health_api_v1_and_stale_scan_recovery`**:
   - Verifica `GET /api/v1/health` -> HTTP `200` `{"status": "healthy", ...}`.
   - Verifica `POST /api/v1/settings/maintenance/cleanup-stale-scans` sblocca una fonte rimasta in `scanning` e un job rimasto in `running`.

---

## CRITERI DI ACCETTAZIONE FINALI (CHECKLIST OBBLIGATORIA)

- [ ] `backend/venv/bin/pytest` dalla root esegue **tutti** i test (i 30 esistenti + tutti i nuovi di `test_phase_6.py`) con **100% pass** e **0 modifiche** a `backend/data/personal_media_manager.db`.
- [ ] `cd frontend && npm run build` termina con **0 errori TypeScript/Vite**.
- [ ] `DELETE /api/v1/sources/{id}` funziona end-to-end senza `NameError` né `SyntaxError` JSON.
- [ ] `/media/{id}/thumbnail`, `/media/{id}/stream` e `/media/{id}/preview` applicano autenticazione, ownership multi-tenant e protezione path traversal.
- [ ] `MediaDetailModal` mostra EXIF completi, supporto preview HD, download originale e navigazione tastiera (`←`, `→`, `Esc`, `F`).
- [ ] Nuova vista `Album & Tag` presente nella sidebar con copertine, creazione, rinomina ed eliminazione.
- [ ] Mappa GPS con clustering zoom-aware fluido e protezione XSS nei popup.
- [ ] Scansione nativa lato server avviabile dalla UI con polling live, backfill miniature RAW/Video (incl. `sips`/`qlmanage` su macOS e `ffmpeg` se presente) e annullamento sicuro.
- [ ] Nessun `alert()` residuo nei flussi principali (sostituiti da Toast).
