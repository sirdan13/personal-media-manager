# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Fase 8: Pulizia Non-Distruttiva dei Duplicati tramite Cestino Protetto su Disco (`.pmm_trash`)

> **ISTRUZIONI TASSATIVE PER L'AGENTE ESECUTORE (FLASH)**:
> Questo documento definisce il piano operativo della **Fase 8** per `/Users/daniele/projects/personal-media-manager`.
> 1. **Politica Zero-Eliminazione Fisica (Safe Disk Trash `.pmm_trash`)**:
>    - Non usare **MAI** `os.remove` / `os.unlink` / `shutil.rmtree` sui file multimediali dell'utente.
>    - La pulizia dei duplicati avviene **esclusivamente spostando (`os.replace` / `shutil.move`)** le copie selezionate dentro una cartella protetta **`.pmm_trash/files/<percorso_relativo_originale>` situata nella root dello STESSO disco/fonte di provenienza (`source.root_path`)**.
>    - Poiché lo spostamento avviene sullo stesso filesystem/volume, l'operazione è istantanea (`O(1)` atomic rename), non copia byte tra dischi e permette il **ripristino in 1 click** nella posizione originale.
> 2. **Invariante Inviolabile "Mai Orfanare un Media"**:
>    - Il backend deve **rifiutare con `HTTP 400`** qualsiasi richiesta di spostamento nel cestino che lascerebbe un `Media` con **`0` copie attive (`availability_status` attivo)** nel catalogo. Almeno **1 copia attiva** per ogni foto/video deve sempre restare intatta nella sua cartella originale!
> 3. **Ordine di esecuzione rigoroso**: esegui i task in sequenza (**Task 8.1 -> Task 8.2 -> Task 8.3 -> Task 8.4**).
> 4. **Verifica obbligatoria al termine di OGNI Task**:
>    - Esegui `backend/venv/bin/pytest` dalla root del progetto (`100% pass`, zero modifiche a `backend/data/personal_media_manager.db`).
>    - Esegui `cd frontend && npm run build` (`0 errori TypeScript/Vite`).

---

## TASK 8.1 — SCHEMA DATABASE, ESCLUSIONE `.pmm_trash` DAGLI SCANNER E FILTRO STATO `"trashed"`

### Obiettivo
Preparare il modello dati (`File`) per tracciare i file spostati in `.pmm_trash`, garantire che nessuna scansione futura indicizzi la cartella `.pmm_trash` e fare in modo che i file `"trashed"` vengano esclusi dai conteggi dei duplicati attivi senza essere sovrascritti da `"missing"` durante la riconciliazione.

### 1. Nuove Colonne su `File` e Migrazione Automatica (`entities.py`, `database.py`, `schemas/media.py`)
- **`backend/app/models/entities.py` (`File`)**:
  - Aggiungi:
    ```python
    trash_relative_path = Column(Text, nullable=True)
    trashed_at = Column(DateTime, nullable=True)
    ```
- **`backend/app/core/database.py` (`run_db_migrations`)**:
  - Controlla `PRAGMA table_info(files)`:
    - Se `"trash_relative_path"` non è in `cols`: `ALTER TABLE files ADD COLUMN trash_relative_path TEXT`
    - Se `"trashed_at"` non è in `cols`: `ALTER TABLE files ADD COLUMN trashed_at DATETIME`
    - Fai `conn.commit()`.
- **`backend/app/schemas/media.py` (`FileOut`)**:
  - Aggiungi:
    ```python
    trash_relative_path: Optional[str] = None
    trashed_at: Optional[datetime] = None
    ```

### 2. Ignorare Sempre `.pmm_trash` in Tutti gli Scanner e nella Riconciliazione
- Aggiungi `".pmm_trash"` a `IGNORED_DIR_NAMES` in:
  1. `backend/app/services/media_preview_service.py`
  2. `agent/scanner_agent.py`
  3. `frontend/src/features/scanner/directoryTraverser.ts` (`IGNORED_DIRECTORIES`)
- In `backend/app/services/source_service.py`:
  - In `is_path_excluded(rel_path, excluded_patterns)`: restituisci sempre `True` se una qualsiasi componente del percorso è `".pmm_trash"` (es. `rel_path.startswith(".pmm_trash/")` o `"/.pmm_trash/" in f"/{rel_path.replace(chr(92), '/')}/"`).
  - In `reconcile_source_files(db, user_id, source_id, seen_paths)`:
    - Se `f.relative_path not in seen_set`:
      - **NON** sovrascrivere `f.availability_status` se è già `"trashed"` (`if f.availability_status not in ("missing", "trashed"): f.availability_status = "missing"`).
    - Se invece `f.relative_path in seen_set` e `f.availability_status in ("missing", "trashed")` (es. l'utente ha rimesso manualmente il file nella cartella originale da Finder):
      - Ripristina `f.availability_status = "available"`, `f.trash_relative_path = None`, `f.trashed_at = None`.

### 3. Escludere i File `"trashed"` dai Conteggi Attivi in `backend/app/services/media_service.py`
- Definisci in cima a `backend/app/services/media_service.py`:
  ```python
  INACTIVE_FILE_STATUSES = ("missing", "trashed")
  ```
- Sostituisci tutti i filtri `File.availability_status != "missing"` (e in Python `f.availability_status != "missing"`) con `File.availability_status.notin_(INACTIVE_FILE_STATUSES)` (e `f.availability_status not in INACTIVE_FILE_STATUSES`) in:
  - `list_user_media` (`prot_global`)
  - `count_user_media` (`prot_global`)
  - `get_media_detail` (`active_files`, popolando anche `trash_relative_path=f.trash_relative_path` e `trashed_at=f.trashed_at` in `FileOut`)
  - `list_duplicate_groups` (sia nella subquery che nel bulk caricamento di `files_with_sources`, popolando anche `trash_relative_path` e `trashed_at` in `FileOut`)
  - `get_duplicates_summary`
  - `compute_backup_gap`

### Verifica Task 8.1
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 8.2 — SERVIZIO BACKEND DI QUARANTENA/CESTINO SU DISCO (`.pmm_trash`) E RIPRISTINO

### Obiettivo
Creare un servizio dedicato `backend/app/services/trash_service.py` ed esporre gli endpoint REST in `backend/app/api/v1/duplicates.py` per spostare le copie selezionate nel cestino del rispettivo disco, elencare il contenuto del cestino e ripristinare i file nella posizione originale.

### 1. Creazione `backend/app/services/trash_service.py`
Implementa le seguenti funzioni con sicurezza rigorosa sui percorsi:

1. **Validazione Path Containment (`_resolve_safe_path_in_source(root_path: str, rel_path: str) -> Optional[str]`)**:
   - Usa `real_root = os.path.realpath(root_path)` e `real_target = os.path.realpath(os.path.join(real_root, rel_path))`.
   - Verifica che `os.path.commonpath([real_root, real_target]) == real_root` e che `real_target != real_root`. Restituisci `real_target` o `None`.

2. **Spostamento Copie nel Cestino del Disco (`trash_duplicate_files(db: Session, user_id: str, file_ids: List[str], keep_file_ids: Optional[List[str]] = None) -> Dict[str, Any]`)**:
   - Deduplica `file_ids`. Se vuoto -> restituisci `{"trashed_count": 0, "trashed_bytes": 0, "errors": [], "items": []}`.
   - Carica i record `(File, Source, Media)` corrispondenti a `file_ids` verificando `Media.user_id == user_id` e `Source.user_id == user_id`.
   - Raggruppa i file richiesti per `media_id`.
   - **GUARDRAIL CRITICO ("Mai Orfanare un Media")**:
     - Per ogni `media_id` coinvolto, carica TUTTE le copie attualmente attive (`File.availability_status.notin_(("missing", "trashed"))`) di quel `media_id`.
     - Calcola quante copie attive **resterebbero** dopo aver spostato nel cestino i `file_ids` richiesti per quel `media_id`.
     - Se `remaining_active_copies < 1` (o se un `file_id` passato in `file_ids` è anche presente in `keep_file_ids`):
       - **Rifiuta l'operazione per quel gruppo** (o solleva `HTTPException(status_code=400, detail="Operazione bloccata: devi conservare almeno 1 copia attiva per ogni foto/video.")`)! Non spostare mai l'ultima copia rimasta di un media!
   - Per ogni `file_obj, source, media` valido da spostare:
     1. Verifica che `source.root_path` sia configurato e la directory esista sul server (`os.path.isdir(source.root_path)`). Se il disco è scollegato, aggiungi un errore descrittivo in `errors` (o solleva `400` se era un singolo file) e passa oltre.
     2. Calcola `src_full_path = _resolve_safe_path_in_source(source.root_path, file_obj.relative_path)`. Verifica che `src_full_path` esista (`os.path.isfile(src_full_path)`).
     3. Costruisci il percorso di destinazione dentro lo **stesso disco**:
        - `clean_rel = file_obj.relative_path.lstrip("/\\")`
        - `trash_rel = os.path.join(".pmm_trash", "files", clean_rel)`
        - `dst_full_path = _resolve_safe_path_in_source(source.root_path, trash_rel)`
        - Se `dst_full_path` esiste già su disco (collisione di un precedente spostamento), aggiungi il suffisso `_{file_obj.id[:8]}` prima dell'estensione sia a `trash_rel` sia a `dst_full_path`.
     4. Crea la cartella padre `os.makedirs(os.path.dirname(dst_full_path), exist_ok=True)` e sposta il file atomicamente sullo stesso disco con `shutil.move(src_full_path, dst_full_path)`.
     5. **Sidecar opzionali (`.aae`, `.xmp`)**:
        - Controlla se nella stessa cartella di `src_full_path` esistono sidecar associati (`{base}.aae`, `{base}.AAE`, `{base}.xmp`, `{base}.XMP`, `{filename}.xmp`, `{filename}.XMP`).
        - Se nella stessa cartella `(source.id, os.path.dirname(file_obj.relative_path))` non resta alcun altro `File` attivo con lo stesso nome base, sposta anche il sidecar nella corrispondente cartella `.pmm_trash/files/...`.
     6. **Scrittura audit log locale sul disco (`{source.root_path}/.pmm_trash/manifest.jsonl`)**:
        - Appendi una riga JSON con `timestamp`, `action: "trash"`, `file_id`, `media_id`, `sha256: file_obj.sha256`, `original_relative_path: file_obj.relative_path`, `trash_relative_path: trash_rel`, `size_bytes: file_obj.size_bytes`.
     7. **Aggiornamento DB**:
        - `file_obj.availability_status = "trashed"`
        - `file_obj.trash_relative_path = trash_rel`
        - `file_obj.trashed_at = datetime.now(timezone.utc)`
   - Fai `db.commit()` e restituisci:
     ```python
     {
         "trashed_count": len(trashed_items),
         "trashed_bytes": sum(x["size_bytes"] for x in trashed_items),
         "items": trashed_items,
         "errors": errors
     }
     ```

3. **Elenco File nel Cestino (`list_trashed_files(db: Session, user_id: str, source_id: Optional[str] = None) -> Dict[str, Any]`)**:
   - Interroga tutti i `(File, Source, Media)` dell'utente con `File.availability_status == "trashed"` (filtrati opzionalmente per `source_id`), ordinati per `File.trashed_at.desc()`.
   - Verifica se il file nel cestino esiste fisicamente su disco (`is_disk_online = bool(source.root_path and os.path.isdir(source.root_path))`).
   - Restituisci:
     ```python
     {
         "total_count": len(items),
         "total_bytes": sum(x["size_bytes"] for x in items),
         "by_source": [
             {
                 "source_id": ...,
                 "source_name": ...,
                 "root_path": ...,
                 "trash_folder_path": os.path.join(s.root_path, ".pmm_trash") if s.root_path else None,
                 "is_online": ...,
                 "count": ...,
                 "bytes": ...
             }
         ],
         "items": [
             {
                 "file_id": f.id,
                 "media_id": m.id,
                 "source_id": s.id,
                 "source_name": s.name,
                 "is_source_online": is_online,
                 "filename": f.filename,
                 "original_relative_path": f.relative_path,
                 "trash_relative_path": f.trash_relative_path,
                 "size_bytes": f.size_bytes,
                 "sha256": f.sha256,
                 "trashed_at": f.trashed_at.isoformat() if f.trashed_at else None,
                 "has_thumbnail": ...
             }
         ]
     }
     ```

4. **Ripristino File dal Cestino alla Posizione Originale (`restore_trashed_files(db: Session, user_id: str, file_ids: List[str]) -> Dict[str, Any]`)**:
   - Per ogni `file_id` con `File.availability_status == "trashed"` e `Media.user_id == user_id`:
     1. Verifica che `source.root_path` esista su disco e che `trash_full_path = _resolve_safe_path_in_source(source.root_path, file_obj.trash_relative_path)` esista.
     2. Calcola `orig_full_path = _resolve_safe_path_in_source(source.root_path, file_obj.relative_path)`.
     3. Se `orig_full_path` non esiste già su disco, crea `os.makedirs(os.path.dirname(orig_full_path), exist_ok=True)` e sposta il file indietro con `shutil.move(trash_full_path, orig_full_path)` (ripristinando anche eventuali sidecar `.aae`/`.xmp` presenti in `.pmm_trash/files/...`).
     4. Se `orig_full_path` esiste già con lo stesso SHA-256/dimensione, rimuovi solo la copia in `.pmm_trash` o segnala collisione.
     5. Appendi riga `"action": "restore"` in `.pmm_trash/manifest.jsonl`.
     6. Aggiorna DB: `file_obj.availability_status = "available"`, `file_obj.trash_relative_path = None`, `file_obj.trashed_at = None`.
   - Fai `db.commit()` e restituisci `{"restored_count": ..., "restored_bytes": ..., "errors": ...}`.

### 2. Nuovi Endpoint REST in `backend/app/api/v1/duplicates.py`
- Aggiungi i modelli Pydantic di richiesta:
  ```python
  class TrashFilesRequest(BaseModel):
      file_ids: List[str]
      keep_file_ids: Optional[List[str]] = None

  class RestoreFilesRequest(BaseModel):
      file_ids: List[str]
  ```
- Aggiungi gli endpoint:
  - `POST /api/v1/duplicates/trash`: chiama `trash_duplicate_files(db, current_user.id, payload.file_ids, payload.keep_file_ids)`.
  - `GET /api/v1/duplicates/trash`: accetta `source_id: Optional[str] = Query(None)` e chiama `list_trashed_files(db, current_user.id, source_id)`.
  - `POST /api/v1/duplicates/trash/restore`: chiama `restore_trashed_files(db, current_user.id, payload.file_ids)`.

### Verifica Task 8.2
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 8.3 — INTERFACCIA UTENTE (`DuplicatesView.tsx`): SELEZIONE COPIA DA TENERE VS CESTINARE, CONFERMA SICURA E TAB `.pmm_trash`

### Obiettivo
Rendere la schermata **Duplicati** (`frontend/src/features/duplicates/DuplicatesView.tsx`) uno strumento interattivo di pulizia sicura dove l'utente può:
1. Scegliere con un click, dentro ogni gruppo di duplicati, **quale copia conservare (`CONSERVA`)** e **quali copie spostare nel cestino del disco (`SPOSTA IN .pmm_trash`)**.
2. Usare un selettore automatico **"Pre-seleziona Spreco Intra-Disco (Tieni 1 per Disco)"** per non dover cliccare manualmente centinaia di file.
3. Vedere una **Barra Flottante / Modale di Conferma Non-Distruttiva** che mostra esattamente la cartella `.pmm_trash` di destinazione sul disco.
4. Consultare e ripristinare in 1 click i file spostati dal nuovo tab **"🗑️ Cestino Dischi (`.pmm_trash`)"**.

### 1. Metodi Client API (`frontend/src/services/api.ts`)
- Aggiungi in `ApiClient`:
  - `trashDuplicateFiles(fileIds: string[], keepFileIds?: string[])` -> `POST /api/v1/duplicates/trash`
  - `getTrashedFiles(sourceId?: string)` -> `GET /api/v1/duplicates/trash`
  - `restoreTrashedFiles(fileIds: string[])` -> `POST /api/v1/duplicates/trash/restore`

### 2. Selezione Interattiva "Quale Tenere / Quale Spostare in `.pmm_trash`" in `DuplicatesView.tsx`
- Aggiungi lo stato:
  - `selectedForTrash: Set<string>` (insieme dei `file.id` marcati dall'utente per lo spostamento in `.pmm_trash`).
  - `trashData: any | null` (dati caricati da `ApiClient.getTrashedFiles()`).
  - `confirmModalOpen: boolean` (modale di riepilogo e conferma prima dello spostamento).
  - `isTrashing: boolean`.
- **Regola UI di Sicurezza per Gruppo (`toggleFileTrash(group, fileId)` e `setPrimaryKeepInGroup(group, keepFileId)`)**:
  - In ogni `group`, su ciascuna riga `file`:
    - Mostra due pulsanti / pillole interattive chiare:
      1. 🟢 **`✓ CONSERVA`** (attivo quando `!selectedForTrash.has(file.id)`): cliccando **" Tieni solo questa su questo disco"** su una copia specifica, quella copia viene impostata come **`CONSERVA`** e tutte le **altre copie sullo STESSO disco (`same source_id`)** vengono automaticamente selezionate come **`🗑️ SPOSTA IN .pmm_trash`**!
      2. 🗑️ **`SPOSTA IN .pmm_trash`** (attivo quando `selectedForTrash.has(file.id)`): cliccandolo marca/smarca quella singola copia per il cestino, **MA** se l'utente tenta di marcare per il cestino l'**ultima copia rimasta** del gruppo (che lascerebbe `0` copie `CONSERVA`), mostra un toast di avviso (`"Devi conservare almeno 1 copia attiva di questo media!"`) oppure sposta automaticamente lo stato `CONSERVA` su un'altra copia del gruppo!
    - Se la fonte di quella copia è `OFFLINE` (`file.source_status === 'offline'`), disabilita il pulsante `SPOSTA IN .pmm_trash` su quella copia mostrando il tooltip `"Collega il disco per poter spostare questo file"`.
  - **Pulsante Rapido sul Singolo Gruppo**:
    - Nell'header di ogni card gruppo, se nel gruppo ci sono copie marcate in `selectedForTrash` (oppure un pulsante rapido **"Pulisci Doppioni Gruppo -> `.pmm_trash`"** che sposta subito nel cestino le copie extra sullo stesso disco di quel singolo gruppo!), permetti anche l'azione immediata sul singolo gruppo oltre a quella batch!
- **Pulsanti di Auto-Selezione Rapida nella Barra Controlli del Tab `Doppioni Stesso Disco (Spreco)`**:
  - **"⚡ Seleziona Automaticamente Doppioni Spreco (Tieni percorso più corto)"**: per ogni gruppo visualizzato, mantiene `CONSERVA` sulla prima copia di ogni disco distinto (preferendo il `relative_path` più corto/pulito o la `preferredSourceId`) e aggiunge tutte le copie extra sullo stesso disco (online) a `selectedForTrash`.
  - **"Deseleziona Tutto"** (svuota `selectedForTrash`).

### 3. Barra Flottante e Modale di Conferma Spostamento in `.pmm_trash`
- Quando `selectedForTrash.size > 0`:
  - Mostra una **Floating Action Bar** in basso (o sticky in alto) con:
    - Contatore: **`🗑️ {selectedForTrash.size} copie selezionate per il Cestino Disco • Spazio liberato dai doppioni: {formatBytes(selectedTrashBytes)}`**
    - Pulsante **"Sposta in `.pmm_trash` (Non Distruttivo)"** -> apre il Modale di Conferma.
- **Modale di Conferma Sicura**:
  - Spiega chiaramente:
    - *"I **{selectedForTrash.size}** file selezionati **NON verranno eliminati**: saranno spostati istantaneamente nella cartella protetta **`.pmm_trash/files/`** sulla root del rispettivo disco di provenienza."*
    - *"Per ogni foto o video coinvolto, **almeno 1 copia originale resta intatta** nella sua cartella attuale."*
    - *"Potrai ripristinare qualsiasi file nella sua posizione originale con 1 click dal tab **Cestino Dischi (`.pmm_trash`)**."*
  - Alla conferma:
    - Chiama `ApiClient.trashDuplicateFiles(Array.from(selectedForTrash))`.
    - Mostra Toast di successo (`"Spostati {res.trashed_count} file in .pmm_trash ({formatBytes(res.trashed_bytes)})"`).
    - Svuota `selectedForTrash` e ricarica `loadDuplicates()`, `loadSummary()` e `loadTrash()`.

### 4. Nuovo Tab "🗑️ Cestino Dischi (`.pmm_trash`)" in `DuplicatesView.tsx`
- Aggiungi il 5° tab **`trash`** (`🗑️ Cestino Dischi ({trashData?.total_count || 0})`) in `DuplicatesView.tsx`:
  - **Riepilogo per Disco (`trashData.by_source`)**:
    - Mostra per ogni disco il percorso esatto `{trash_folder_path}`, lo stato `ONLINE / OFFLINE`, il numero di file nel cestino e i MB/GB occupati, con un pulsante **"Ripristina Tutto su questo Disco"**.
  - **Lista dei File nel Cestino (`trashData.items`)**:
    - Mostra miniatura, `filename`, **Percorso Originale** (`📁 {original_relative_path}`), **Percorso attuale nel Cestino** (`🗑️ {trash_relative_path}`), dimensione, data di spostamento e pulsante **"↩️ Ripristina Posizione Originale"** (`ApiClient.restoreTrashedFiles([item.file_id])`).
    - Supporta anche selezione multipla / **"↩️ Ripristina Tutti i File"**.

### Verifica Task 8.3
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 8.4 — SUITE DI TEST AUTOMATIZZATI (`backend/app/tests/test_phase_8_safe_trash.py`)

Crea `backend/app/tests/test_phase_8_safe_trash.py` usando le fixture isolate `(client, auth_headers, db, tmp_path)` e verifica:

1. **`test_trash_intra_source_duplicate_moves_file_to_disk_trash_and_updates_stats`**:
   - Crea una cartella reale su `tmp_path / "disk_a"` e registra `Source A` con `root_path = str(tmp_path / "disk_a")`.
   - Crea 2 file identici su disco: `album/photo.jpg` (da tenere) e `dup_folder/photo_copy.jpg` (da cestinare) + un sidecar `dup_folder/photo_copy.xmp`, e indicizzali sotto lo stesso `Media` (`copies_count == 2`).
   - Chiama `POST /api/v1/duplicates/trash` con `file_ids=[copy_file_id]`, `keep_file_ids=[keep_file_id]`.
   - Verifica HTTP `200`, `trashed_count == 1`.
   - Verifica sul filesystem (`tmp_path / "disk_a"`):
     - `album/photo.jpg` **esiste ancora intatto**!
     - `dup_folder/photo_copy.jpg` **non è più** in `dup_folder/`, ma **esiste fisicamente** in `.pmm_trash/files/dup_folder/photo_copy.jpg` (insieme al sidecar `.xmp`)!
     - `.pmm_trash/manifest.jsonl` esiste e contiene la riga `"action": "trash"`.
   - Verifica che `GET /api/v1/duplicates?mode=intra_source` ora restituisca `0` gruppi duplicati e `GET /api/v1/media` riporti `copies_count == 1` per quel media!

2. **`test_trash_guardrail_blocks_trashing_all_copies_of_a_media`**:
   - Tenta di chiamare `POST /api/v1/duplicates/trash` passando **tutte** le copie attive di un `Media` (lasciando `0` copie attive).
   - Verifica che il backend rifiuti l'operazione (`HTTP 400`) e che **nessun file venga spostato** su disco!

3. **`test_restore_from_trash_returns_file_to_exact_original_path`**:
   - Chiama `GET /api/v1/duplicates/trash` -> verifica che il file cestinato compaia nella lista con `original_relative_path` e `trash_relative_path`.
   - Chiama `POST /api/v1/duplicates/trash/restore` con `file_ids=[copy_file_id]`.
   - Verifica HTTP `200`, `restored_count == 1`.
   - Verifica sul filesystem che `dup_folder/photo_copy.jpg` sia tornato esattamente al suo posto originale e `availability_status == "available"`.

4. **`test_scanner_and_reconcile_ignore_pmm_trash_folder`**:
   - Con un file spostato in `.pmm_trash/files/...`, avvia `POST /api/v1/scans/{source_id}/server-scan` (o `reconcile_source_files`).
   - Verifica che i file dentro `.pmm_trash` **non** vengano re-indicizzati come nuovi file e che il record con `availability_status == "trashed"` resti `"trashed"` (non diventi `"available"` né `"missing"`).

---

## CRITERI DI ACCETTAZIONE FINALI (CHECKLIST OBBLIGATORIA)

- [ ] `backend/venv/bin/pytest` esegue tutti i test (inclusi i nuovi in `test_phase_8_safe_trash.py`) con **100% pass** e **0 modifiche** a `backend/data/personal_media_manager.db`.
- [ ] `cd frontend && npm run build` termina con **0 errori TypeScript/Vite**.
- [ ] Nessun file utente viene mai cancellato (`os.remove` mai usato sui media): i file scelti vengono spostati in `{source.root_path}/.pmm_trash/files/...` sullo stesso disco.
- [ ] È impossibile spostare in `.pmm_trash` tutte le copie di un media (almeno 1 copia `CONSERVA` è sempre garantita sia da UI sia da backend).
- [ ] Dal tab **Cestino Dischi (`.pmm_trash`)** è possibile visualizzare i file spostati e ripristinarli nella posizione originale in 1 click.
