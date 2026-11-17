# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Fase 5: Supporto Universale RAW, Smart Thumbnail Backfill & Raffinamento Produzione

> **ISTRUZIONI PER L'AGENTE ESECUTORE**:
> Questo documento definisce i task della **Fase 5** per il progetto `/Users/daniele/projects/personal-media-manager`.
> - **Politica 100% Read-Only sui file originali**: non modificare, spostare o cancellare mai alcun file multimediale sorgente dell'utente.
> - Esegui i 4 blocchi operativi in ordine sequenziale (**Task 5.1 -> Task 5.2 -> Task 5.3 -> Task 5.4**).
> - Al termine di tutti i task, esegui `pytest` e `cd frontend && npm run build` verificando che tutto compili e passi al 100%.

---

## TASK 5.1 — SUPPORTO COMPLETO FORMATI RAW FOTOGRAFICI, NUOVI MEDIA & SIDECAR `.XMP`

### Obiettivo
Espandere il motore di scansione (Browser + Agente CLI + Backend + UI) per supportare tutti i formati **RAW fotografici professionali** (Canon, Nikon, Sony, Fujifilm, Apple ProRAW, Olympus/OM, Panasonic, Pentax, Leica, Hasselblad, ecc.), formati immagine/video avanzati (Action Cam / Droni DJI / GoPro / AVCHD) e sidecar `.XMP`, estraendo in modo ultra-veloce le miniature JPEG incorporate nei file RAW.

### 1. Espansione Estensioni e Tipi in Frontend (`frontend/src/features/scanner/formatDetector.ts`)
- Definisci ed esporta il set `RAW_EXTENSIONS`:
  ```ts
  export const RAW_EXTENSIONS = new Set([
    'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2',
    'raf', 'orf', 'rw2', 'raw', 'pef', 'srw', '3fr', 'fff', 'iiq',
    'x3f', 'rwl', 'erf', 'kdc', 'dcr', 'mos'
  ]);
  ```
- Aggiorna `IMAGE_EXTENSIONS` includendo tutte le `RAW_EXTENSIONS` più:
  `'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'jxl', 'jp2', 'j2k', 'psd', 'tga', 'ico', 'svg'`.
- Aggiorna `VIDEO_EXTENSIONS` includendo:
  `'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', '3g2', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg', 'vob', 'insv'`.
- Esporta una funzione helper `export function isRawExtension(ext: string): boolean` che restituisce `RAW_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ''))`.
- Aggiorna `MIME_MAP` con i MIME corrispondenti per i formati RAW (`dng: 'image/x-adobe-dng'`, `cr2: 'image/x-canon-cr2'`, `cr3: 'image/x-canon-cr3'`, `nef: 'image/x-nikon-nef'`, `arw: 'image/x-sony-arw'`, `raf: 'image/x-fuji-raf'`, `orf: 'image/x-olympus-orf'`, `rw2: 'image/x-panasonic-rw2'`, `pef: 'image/x-pentax-pef'`, `mts: 'video/mp2t'`, `m2ts: 'video/mp2t'`, `jxl: 'image/jxl'`).

### 2. Gestione Sidecar `.XMP` e `.LRV` (`frontend/src/features/scanner/directoryTraverser.ts` e `backend/app/services/ingestion_service.py`)
- In `directoryTraverser.ts`:
  - Oltre a `.aae` (`has_apple_edits: true`), traccia anche i file sidecar `.xmp` (Adobe Lightroom / Camera Raw). Se nella stessa cartella esiste `NOMEFILE.xmp` (es. `DSC0001.XMP` o `DSC0001.ARW.xmp`), imposta sul file principale `hasSidecarXmp = true` (da salvare in `metadata_json.has_xmp_sidecar = true`).
  - Non restituire mai file `.aae`, `.xmp`, `.lrv`, `.thm`, `.dat`, `.ds_store`, `.db`, `.ini` come media autonomi.
- In `backend/app/services/ingestion_service.py`:
  - Aggiorna `IGNORED_EXTENSIONS = {"aae", "xmp", "lrv", "thm", "dat", "ds_store", "db", "ini"}`.

### 3. Estrazione Ultra-Veloce Miniature RAW nel Browser (`frontend/src/features/scanner/thumbnailGenerator.ts`)
I browser (specialmente Chrome/Firefox, e Safari per alcuni formati) non sempre decodificano i file RAW direttamente in `createImageBitmap(file)`, ma **tutti i file RAW (inclusi i 54 `.DNG` Apple ProRAW, `.CR2`, `.CR3`, `.NEF`, `.ARW`, `.RAF`, `.ORF`, `.RW2`) contengono un'anteprima JPEG incorporata (`PreviewImage` / `JpgFromRaw` / IFD thumbnail)**.
- In `thumbnailGenerator.ts`:
  - Importa `exifr` da `'exifr'` e `isRawExtension, getFileExtension` da `'./formatDetector'`.
  - Crea una funzione `async function extractRawPreviewBlob(file: File): Promise<Blob | null>`:
    1. Prova `const thumbBytes = await exifr.thumbnail(file);` — se `thumbBytes` esiste ed è `> 4096` byte, restituisci `new Blob([thumbBytes], { type: 'image/jpeg' })`.
    2. Se `exifr.thumbnail` è assente o troppo piccolo, scansiona i primi `Math.min(file.size, 8 * 1024 * 1024)` byte del file (`new Uint8Array(await file.slice(0, maxRead).arrayBuffer())`) cercando tutti i segmenti JPEG embedded delimitati da Start-Of-Image (`0xFF, 0xD8, 0xFF`) e End-Of-Image (`0xFF, 0xD9`). Seleziona il segmento JPEG con lunghezza maggiore (purché `> 8192` byte) e restituiscilo come `new Blob([slice], { type: 'image/jpeg' })`.
  - In `generateImageThumbnail(file, orientation)`:
    - Se `isRawExtension(getFileExtension(file.name))` è `true`:
      - Chiama prima `extractRawPreviewBlob(file)`. Se restituisce un `Blob` valido, usa quel `Blob` al posto di `file` per creare l'immagine/bitmap e disegnare il canvas!
      - Se non trova un JPEG embedded, prosegui con il normale tentativo `createImageBitmap(file)` / `<img src=...>` (che su Safari macOS usa il decoder di sistema Apple CoreImage).

### 4. Estrazione Miniature RAW e HEIC nell'Agente CLI Python (`agent/scanner_agent.py`)
- Aggiorna `SUPPORTED_RAW_EXTS = {".dng", ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".orf", ".rw2", ".raw", ".pef", ".srw", ".3fr", ".fff", ".iiq", ".x3f", ".rwl"}`.
- Aggiungi `SUPPORTED_RAW_EXTS` a `SUPPORTED_IMAGE_EXTS`, e aggiungi `".mts", ".m2ts", ".mpg", ".mpeg", ".3gp", ".insv"` a `SUPPORTED_VIDEO_EXTS`.
- Prova a importare e registrare `pillow_heif` opzionalmente (`try: import pillow_heif; pillow_heif.register_heif_opener() except ImportError: pass`).
- Implementa in `ScannerAgent` un metodo helper `extract_largest_embedded_jpeg(self, filepath: str, max_read_bytes: int = 12 * 1024 * 1024) -> Optional[bytes]`:
  - Legge i primi `max_read_bytes` del file RAW e individua i marker JPEG `\xff\xd8\xff` ... `\xff\xd9`, restituendo il blocco JPEG più grande (`len > 8192`) che si apre validamente con `Image.open(io.BytesIO(block))`.
- In `extract_image_metadata_and_thumb(self, filepath: str)`:
  - Se l'estensione è in `SUPPORTED_RAW_EXTS` (o se `Image.open(filepath)` fallisce o restituisce un'immagine minuscola `< 256px` come accade per l'IFD0 di molti DNG/NEF/CR2):
    1. Estrai comunque i tag EXIF con `Image.open(filepath)` se possibile.
    2. Per generare la miniatura, usa `extract_largest_embedded_jpeg(filepath)`.
    3. Se anche quello fallisce e siamo su macOS (`sys.platform == "darwin"`), usa come fallback `sips -s format jpeg -Z 512 <filepath> --out <temp_jpg>` in una `tempfile.NamedTemporaryFile` per convertire qualsiasi RAW/HEIC tramite il motore nativo Apple!

### 5. Filtro Rapido "RAW" e Badge "RAW" nella Libreria (`backend` + `frontend`)
- **Backend (`backend/app/services/media_service.py` e `backend/app/api/v1/media.py`)**:
  - Supporta il valore `media_type="raw"` nel parametro query di `GET /api/v1/media`: quando `media_type == "raw"`, filtra i media che hanno almeno un `File` con `func.lower(File.extension).in_(RAW_EXTENSIONS)`.
  - Aggiungi il campo `primary_extension: Optional[str] = None` in `MediaOut` (`func.min(File.extension).label("primary_extension")`) così la UI sa sempre se una card è `.dng`, `.cr3`, `.nef`, `.arw`, `.heic`, ecc.
- **Frontend (`frontend/src/features/library/LibraryView.tsx`)**:
  - Aggiungi l'opzione `"Solo RAW (DNG/CR3/NEF/ARW)"` (`value="raw"`) nel selettore tipo media della Libreria.
  - Sulle card della griglia il cui `primary_extension` (o estensione di `primary_filename`) appartiene a `RAW_EXTENSIONS`, mostra un badge distintivo **`RAW · {EXT.toUpperCase()}`** (colore ambra `#f59e0b`).

---

## TASK 5.2 — SMART INCREMENTAL THUMBNAIL BACKFILL (RIGENERAZIONE MINIATURE MANCANTI SENZA RICALCOLO SHA-256)

### Obiettivo
Attualmente nel DB ci sono **54 file `.dng`** e **92 video (`.mov`/`.mp4`)** già indicizzati ma privi di miniatura (`has_thumbnail == False`). Quando l'utente rilancia la scansione della stessa cartella, lo scanner salta completamente i file già noti (`isIncrementalSkip = true`), impedendo la generazione delle miniature mancanti a meno di ricalcolare tutti i 13,7 GB di SHA-256.
Vogliamo che lo scanner **continui a saltare il calcolo SHA-256** per i file già noti, ma **generi e invii la miniatura** se sul server quel file ha `has_thumbnail == False`!

### Modifiche Richieste
1. **Backend (`backend/app/services/source_service.py` -> `get_source_fingerprints`)**:
   - Modifica la query di `get_source_fingerprints(db, user_id, source_id)` affinché faccia un `outerjoin(Thumbnail, File.media_id == Thumbnail.media_id)` e includa nel dizionario restituito per ogni `relative_path`:
     ```python
     "has_thumbnail": thumb_id is not None
     ```
2. **Frontend (`frontend/src/features/scanner/scannerEngine.ts`)**:
   - Aggiorna il tipo `fingerprints?: Record<string, { size_bytes: number; sha256: string; has_thumbnail?: boolean }>;`.
   - In `processSingleFile`:
     - Se `known && known.size_bytes === file.size && known.sha256`, imposta `sha256 = known.sha256` (nessun ricalcolo SHA-256!).
     - Imposta `const needsThumbnailBackfill = known.has_thumbnail === false;`.
     - Se `isIncrementalSkip && !needsThumbnailBackfill`, salta metadati e miniatura come prima.
     - Se invece `needsThumbnailBackfill` è `true`, estrai metadati e genera la miniatura anche se lo SHA-256 è stato riutilizzato!
3. **Agente CLI (`agent/scanner_agent.py`)**:
   - Stessa logica: nello skip incrementale (riga ~328), se `fp.get("has_thumbnail") is False`, riutilizza `sha256 = fp["sha256"]` senza rileggere il file per l'hash, ma esegui l'estrazione di metadati e miniatura (`extract_image_metadata_and_thumb` o `extract_video_metadata_and_thumb`) e inviala nel batch!

---

## TASK 5.3 — RIFINITURA LIVE PHOTOS, STREAMING LOCALE READ-ONLY & OTTIMIZZAZIONE `dHash`

### 1. Nascondere i `.MOV` Secondari delle Live Photos dalla Griglia Principale (`backend/app/services/media_service.py`)
- In `list_user_media()`:
  - Quando `media_type` è `None` (vista "Tutti i media"), escludi i record `Media` il cui `id` compare come `live_video_media_id` di un altro `Media` dello stesso utente:
    ```python
    live_video_subq = db.query(Media.live_video_media_id).filter(
        Media.user_id == user_id,
        Media.live_video_media_id.isnot(None)
    )
    query = query.filter(~Media.id.in_(live_video_subq))
    ```
  - In questo modo le 17 Live Photos non compaiono due volte nella galleria generale (una volta come `.HEIC` Live e una volta come `.MOV` separato), mentre restano visibili se l'utente filtra esplicitamente per `media_type="video"`.

### 2. Endpoint Streaming Locale Read-Only (`GET /api/v1/media/{media_id}/stream`) + Player Live Photo
- In `backend/app/api/v1/media.py`:
  - Aggiungi `GET /api/v1/media/{media_id}/stream` (accetta anche `?token=...` in query string come l'endpoint `/thumbnail` per funzionare nei tag `<video src=...>`).
  - Cerca i `File` associati a `media_id` (uniti a `Source`): se esiste un file su una `Source` con `root_path` valorizzato il cui percorso completo `os.path.join(source.root_path, file.relative_path)` esiste sul filesystem (`os.path.isfile(full_path)`), restituisci `FileResponse(full_path, media_type=file.mime_type)`. Altrimenti restituisci `404` ("Disco offline o file non accessibile direttamente dal server").
- In `frontend/src/features/library/MediaDetailModal.tsx`:
  - Se il media è un `video` o è una `is_live_photo` (usando `live_video_media_id`), mostra un pulsante **"Riproduci Live Photo / Video (se disco online)"** che carica `<video controls autoPlay loop muted playsInline src={ApiClient.getMediaStreamUrl(targetMediaId)} />` con gestione elegante dell'errore (`onError`) se il disco esterno è scollegato.

### 3. Ottimizzazione Performance `find_similar_media_groups` (`backend/app/services/dhash_service.py`)
- Per garantire che il confronto `dHash` scali fino a 50.000–100.000 foto senza rallentamenti `O(N^2)`:
  - Converti tutti i `dhash` esadecimali in interi Python a 64-bit (`int(m.dhash, 16)`) **una sola volta** fuori dal doppio ciclo (`(m1_int ^ m2_int).bit_count()` in Python 3.10+ è un'istruzione C `POPCNT` 20x più veloce di `bin(...).count("1")`!).
  - Aggiungi un parametro opzionale `max_time_diff_hours: Optional[int] = None` se si vogliono limitare i confronti alle foto scattate nello stesso arco temporale.

---

## TASK 5.4 — ISOLAMENTO TEST DB, PULIZIA DATI SPURI DI TEST & `pytest.ini`

### Problema Rilevato nell'Audit
Durante l'esecuzione precedente, `backend/app/tests/test_phase_4.py` ha istanziato direttamente `SessionLocal()` e `TestClient(app)` invece di usare le fixture isolate `client, auth_headers, db` di `conftest.py`. Inoltre `conftest.py` non redirigeva `settings.THUMBNAILS_DIR` su una cartella temporanea. Di conseguenza sono rimasti nel DB reale `personal_media_manager.db` alcuni utenti `phase4_...@test.com` e 4 fonti fittizie (`Test Phone`, `Test Drive`).

### Passi da Eseguire
1. **`pytest.ini` nella root del progetto (`/Users/daniele/projects/personal-media-manager/pytest.ini`)**:
   - Crea `pytest.ini` con:
     ```ini
     [pytest]
     pythonpath = backend .
     testpaths = backend/app/tests
     ```
2. **Isolamento `THUMBNAILS_DIR` in `backend/app/tests/conftest.py`**:
   - Nella fixture `db` (o in una fixture `autouse=True` in `conftest.py`), usa `monkeypatch.setattr(settings, "THUMBNAILS_DIR", str(tmp_path / "thumbnails"))` così nessun test scrive mai miniature di test dentro `backend/data/thumbnails/`.
3. **Refactoring `backend/app/tests/test_phase_4.py`**:
   - Rimuovi `client = TestClient(app)` e `SessionLocal()` da `test_phase_4.py` e usa esclusivamente le fixture standard `(client, auth_headers, db)` definite in `conftest.py`.
4. **Aggiungi `backend/app/tests/test_phase_5_raw.py`**:
   - Testa:
     - L'estrazione di un JPEG embedded da un file `.dng` / `.cr3` sintetico (costruito in memoria con un header dummy + marker JPEG `\xff\xd8...\xff\xd9`).
     - Il filtro `GET /api/v1/media?media_type=raw`.
     - Lo skip dei sidecar `.xmp` e l'associazione di `has_xmp_sidecar: True`.
     - Il campo `has_thumbnail` nell'endpoint `/api/v1/sources/{id}/fingerprints`.
     - Il filtro che nasconde i `.mov` secondari delle Live Photos dalla lista principale `GET /api/v1/media`.
5. **Pulizia DB Reale (`backend/data/personal_media_manager.db`) e Rimozione `.bak`**:
   - Esegui uno script Python one-shot che rimuove da `backend/data/personal_media_manager.db` tutti gli utenti con `email LIKE 'phase4_%@test.com'` (e in cascata le loro fonti `Test Phone` / `Test Drive` e i media `p4_sha*` / `album_test_sha*`), oltre all'eventuale file di test `111122223333...webp` in `backend/data/thumbnails/11/11/`, ed esegue `VACUUM`.
   - Rimuovi il file `backend/data/personal_media_manager.db.bak`.

---

## CRITERI DI ACCETTAZIONE FINALI (VERIFICA OBBLIGATORIA)
- [ ] Eseguendo `backend/venv/bin/pytest` direttamente dalla root del progetto (senza variabili d'ambiente manuali), tutti i test (inclusi i nuovi test in `test_phase_5_raw.py`) passano al 100%.
- [ ] Eseguendo ` backend/venv/bin/pytest`, il database reale `backend/data/personal_media_manager.db` **non** viene toccato né sporcato da utenti o fonti di test.
- [ ] In `backend/data/personal_media_manager.db` esiste solo la fonte reale dell'utente (`ssd 512`) e zero fonti `Test Phone` / `Test Drive`.
- [ ] Il build frontend (`cd frontend && npm run build`) termina con 0 errori TypeScript/Vite.
