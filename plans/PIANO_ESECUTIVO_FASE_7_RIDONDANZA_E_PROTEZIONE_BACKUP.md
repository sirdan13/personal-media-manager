# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Fase 7: Logica di Protezione Backup, Ridondanza Intelligente Multi-Disco & Gap Analysis tra Fonti

> **ISTRUZIONI TASSATIVE PER L'AGENTE ESECUTORE (FLASH)**:
> Questo documento definisce il piano operativo della **Fase 7** per `/Users/daniele/projects/personal-media-manager` (costruito sopra la codebase della Fase 6 già implementata).
> 1. **Politica 100% Read-Only sui file originali dell'utente**: non modificare, rinominare, spostare o cancellare MAI alcun file multimediale sorgente dell'utente su dischi esterni, NAS o cartelle locali.
> 2. **Ordine di esecuzione rigoroso**: esegui i task in sequenza (**Task 7.1 -> Task 7.2 -> Task 7.3 -> Task 7.4**).
> 3. **Verifica obbligatoria al termine di OGNI Task**:
>    - Esegui `backend/venv/bin/pytest` dalla root del progetto: **100% dei test devono passare** senza sporcare `backend/data/personal_media_manager.db`.
>    - Esegui `cd frontend && npm run build`: **0 errori TypeScript e Vite**.

---

## 0. RAZIONALE DI PRODOTTO (CAMBIO DI PARADIGMA: DA "SEMPLICI DUPLICATI" A "PROTEZIONE & RIDONDANZA BACKUP")

In un archivio personale distribuito su più supporti fisici (es. *SSD Portatile*, *Hard Disk Esterno*, *NAS*), avere più copie dello stesso file **non è sempre uno spreco**:
- **Quando 2 copie si trovano su 2 dischi fisici diversi (`distinct_sources_count >= 2`)**, quella è **Ridondanza Sana (Backup / Tolleranza ai guasti)** 🛡️.
- **Quando 2+ copie si trovano sullo STESSO disco fisico (`copies_count > distinct_sources_count`)**, quello è **Duplicato Intra-Disco (Spreco puro senza protezione hardware)** ⚠️.
- **Quando esiste 1 sola copia su 1 solo disco fisico (`distinct_sources_count == 1` e `copies_count == 1`)**, quel ricordo è **A Rischio (Single Point of Failure / Non Protetto)** 🔴: se quel disco si rompe o si perde, la foto o il video sono persi per sempre.

### I 3 Stati di Protezione (`protection_status`) di ogni `Media`
| `protection_status` | Regola Matematica (su file attivi `availability_status != 'missing'`) | Significato | Badge / Colore UI |
| :--- | :--- | :--- | :--- |
| **`"unprotected"`** | `distinct_sources_count <= 1` e `copies_count <= 1` | Presente su **1 solo disco fisico** (nessun backup su secondo supporto) | 🔴 `1 DISCO (A RISCHIO)` / `#f43f5e` |
| **`"protected"`** | `distinct_sources_count >= 2` e `copies_count == distinct_sources_count` | **Ridondanza Sana Multi-Disco** (1 copia per ciascun disco distinto, zero doppioni intra-disco) | 🟢 `🛡️ {N} DISCHI (PROTETTO)` / `#22c55e` |
| **`"intra_source_duplicate"`** | `copies_count > distinct_sources_count` | **Doppioni Intra-Disco**: almeno una fonte fisica contiene 2+ copie identiche dello stesso file | 🟠 `⚠️ {copies} COPIE ({sources} DISCHI)` / `#f59e0b` |

> **Nota importante**: un media con `distinct_sources_count >= 2` e `copies_count > distinct_sources_count` (es. 2 copie su SSD + 1 copia su HDD Backup = 3 copie su 2 dischi) ha `protection_status = "intra_source_duplicate"` (perché ha 1 copia di spreco sull'SSD da segnalare), ma è anche coperto da backup su 2 dischi (`is_backed_up = distinct_sources_count >= 2`).

---

## TASK 7.1 — MODELLO DATI, SCHEMI E SERVIZI BACKEND PER `protection_status`, RUOLO FONTE E METRICHE DI RIDONDANZA

### 1. Ruolo Opzionale della Fonte (`role` su `Source`) — `backend/app/models/entities.py`, `database.py`, `schemas/source.py`, `source_service.py`
- In `backend/app/models/entities.py` (`Source`):
  - Aggiungi `role = Column(String(30), nullable=False, default="primary")` (valori ammessi: `"primary"` = Disco Principale / Lavoro, `"backup"` = Disco di Backup / Replica, `"archive"` = Archivio Storico).
- In `backend/app/core/database.py` (`run_db_migrations`):
  - Controlla `PRAGMA table_info(sources)`: se `"role"` non è in `cols`, esegui `ALTER TABLE sources ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'primary'`.
- In `backend/app/schemas/source.py`:
  - Aggiungi `role: Optional[str] = "primary"` in `SourceCreate`, `SourceUpdate` e `role: str = "primary"` in `SourceOut`.
- In `backend/app/services/source_service.py`:
  - Includi `role=getattr(s, "role", "primary") or "primary"` in `get_user_sources()`, `create_source()` e `update_source()`.

### 2. Campi di Protezione & Ridondanza in `MediaOut` e `DuplicateGroupOut` — `backend/app/schemas/media.py`
- In `MediaOut`:
  - Aggiungi:
    ```python
    distinct_sources_count: int = 1
    protection_status: str = "unprotected"  # "unprotected" | "protected" | "intra_source_duplicate"
    ```
- In `DuplicateGroupOut`:
  - Aggiungi:
    ```python
    distinct_sources_count: int = 1
    redundancy_type: str = "intra_source_duplicate"  # "healthy_multi_source" | "intra_source_duplicate" | "mixed"
    intra_source_wasted_bytes: int = 0
    multi_source_backup_bytes: int = 0
    ```

### 3. Calcolo `distinct_sources_count` e Filtro `protection_status` in `list_user_media` e `get_media_detail` — `backend/app/services/media_service.py` e `backend/app/api/v1/media.py`
- Crea una funzione helper pura in `backend/app/services/media_service.py`:
  ```python
  def compute_protection_status(copies_count: int, distinct_sources_count: int) -> str:
      if copies_count > distinct_sources_count:
          return "intra_source_duplicate"
      if distinct_sources_count >= 2:
          return "protected"
      return "unprotected"
  ```
- In `list_user_media()` e `count_user_media()`:
  - Aggiungi parametro `protection_status: Optional[str] = None` (e passalo da `GET /api/v1/media` in `backend/app/api/v1/media.py`).
  - Nella select di `list_user_media()`, aggiungi `func.count(func.distinct(File.source_id)).label("distinct_sources_count")`.
  - Se `protection_status` è valorizzato, applica il filtro (usando una subquery su `File` con `File.availability_status != "missing"` raggruppata per `File.media_id` così funziona sia in `list_user_media` che in `count_user_media` anche quando è attivo un filtro `source_id`!):
    ```python
    prot_subq = (
        db.query(
            File.media_id.label("m_id"),
            func.count(func.distinct(File.id)).label("c_files"),
            func.count(func.distinct(File.source_id)).label("c_sources")
        )
        .filter(File.availability_status != "missing")
        .group_by(File.media_id)
        .subquery()
    )
    ```
    - Se `protection_status == "unprotected"`: filtra `Media.id` con `c_sources <= 1` e `c_files <= 1`.
    - Se `protection_status == "protected"`: filtra `Media.id` con `c_sources >= 2` e `c_files == c_sources`.
    - Se `protection_status == "intra_source_duplicate"`: filtra `Media.id` con `c_files > c_sources`.
  - Popola `distinct_sources_count` e `protection_status=compute_protection_status(copies_count, distinct_sources_count)` in `MediaOut` e in `get_media_detail()`.

### Verifica Task 7.1
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 7.2 — MOTORE BACKEND: DISTINZIONE SPRECO INTRA-DISCO VS BACKUP MULTI-DISCO & GAP ANALYSIS TRA 2 FONTI

### 1. Evoluzione `list_duplicate_groups` e `get_duplicates_summary` — `backend/app/services/media_service.py`
- Aggiorna `list_duplicate_groups(db: Session, user_id: str, offset: int = 0, limit: int = 50, mode: str = "all") -> List[DuplicateGroupOut]`:
  - Nella subquery su `File` (`File.availability_status != "missing"`), calcola sia `func.count(File.id).label("c")` sia `func.count(func.distinct(File.source_id)).label("s")`.
  - Filtra in base a `mode`:
    - `mode == "all"`: `having(func.count(File.id) > 1)`
    - `mode == "intra_source"`: `having(func.count(File.id) > func.count(func.distinct(File.source_id)))` (solo i media che hanno copie doppie sullo **stesso** disco!)
    - `mode == "multi_source"`: `having(and_(func.count(func.distinct(File.source_id)) >= 2, func.count(File.id) == func.count(func.distinct(File.source_id))))` (solo le repliche di backup sane distribuite su 2+ dischi senza doppioni intra-disco!)
  - Per ogni gruppo restituito, calcola:
    - `copies_count = len(file_outs)`
    - `distinct_sources_count = len({f.source_id for f in file_outs})`
    - `single_size = max((f.size_bytes for f in file_outs), default=0)`
    - `intra_source_wasted_bytes = single_size * max(0, copies_count - distinct_sources_count)`
    - `multi_source_backup_bytes = single_size * max(0, distinct_sources_count - 1)`
    - `redundancy_type`:
      - `"healthy_multi_source"` se `distinct_sources_count >= 2 and copies_count == distinct_sources_count`
      - `"intra_source_duplicate"` se `distinct_sources_count == 1 and copies_count > 1`
      - `"mixed"` se `distinct_sources_count >= 2 and copies_count > distinct_sources_count`
- Aggiorna `get_duplicates_summary(db: Session, user_id: str) -> Dict[str, Any]` (mantenendo `total_groups`, `total_redundant_copies`, `total_recoverable_bytes` per retrocompatibilità coi test esistenti!):
  - Calcola su tutti i media attivi dell'utente (escludendo i `.mov` secondari delle Live Photos o contando tutti i media con file `availability_status != "missing"`):
    - `total_groups`: media con `copies > 1`
    - `intra_source_groups`: media con `copies > distinct_sources`
    - `healthy_multi_source_groups`: media con `distinct_sources >= 2` e `copies == distinct_sources`
    - `unprotected_media_count`: media con `distinct_sources == 1` e `copies == 1`
    - `unprotected_favorites_count`: media con `is_favorite == 1` e `distinct_sources == 1`
    - `protected_media_count`: media con `distinct_sources >= 2`
    - `protection_coverage_pct`: `round(protected_media_count / total_active_media * 100, 1)` (0.0 se 0 media)
    - `intra_source_wasted_bytes`: somma di `max_size * (copies - distinct_sources)` (il **vero spreco** eliminabile senza ridurre il numero di dischi di backup!)
    - `multi_source_backup_bytes`: somma di `max_size * (distinct_sources - 1)` (lo spazio investito in copie di backup su dischi diversi)
    - `total_redundant_copies`: somma di `(copies - 1)`
    - `total_recoverable_bytes`: somma di `max_size * (copies - 1)`

### 2. Nuovo Servizio & Endpoint Gap Analysis tra 2 Fonti (`GET /api/v1/duplicates/backup-gap`) — `media_service.py` e `duplicates.py`
- In `backend/app/services/media_service.py`, aggiungi `compute_backup_gap(db: Session, user_id: str, primary_source_id: str, backup_source_id: str, only_favorites: bool = False) -> Dict[str, Any]`:
  1. Verifica che `primary_source_id` e `backup_source_id` appartengano a `user_id`.
  2. Trova tutti i `Media` (e il relativo primo `File` su `primary_source_id` + presenza `Thumbnail`) che hanno almeno un `File` con `source_id == primary_source_id` e `availability_status != "missing"` (se `only_favorites=True`, filtra `Media.is_favorite == 1`).
  3. Trova il set `backed_up_media_ids` di tutti i `Media.id` che hanno almeno un `File` con `source_id == backup_source_id` e `availability_status != "missing"`.
  4. Costruisci la lista `missing_items` per i media di `primary_source_id` il cui `media.id not in backed_up_media_ids`:
     ```python
     {
         "media_id": media.id,
         "canonical_sha256": media.canonical_sha256,
         "filename": primary_file.filename,
         "relative_path": primary_file.relative_path,
         "size_bytes": primary_file.size_bytes,
         "captured_at": media.captured_at.isoformat() if media.captured_at else None,
         "is_favorite": bool(media.is_favorite),
         "has_thumbnail": has_thumb,
         "media_type": media.media_type
     }
     ```
  5. Restituisci:
     ```python
     {
         "primary_source_id": primary_source_id,
         "backup_source_id": backup_source_id,
         "total_primary_media": total_primary,
         "backed_up_media": backed_up_count,
         "missing_on_backup_count": len(missing_items),
         "missing_on_backup_bytes": sum(x["size_bytes"] for x in missing_items),
         "coverage_pct": round(backed_up_count / total_primary * 100, 1) if total_primary > 0 else 100.0,
         "missing_items": missing_items
     }
     ```
- In `backend/app/api/v1/duplicates.py`:
  - Aggiorna `GET /api/v1/duplicates` per accettare `mode: str = Query("all", pattern="^(all|intra_source|multi_source)$")` e passarlo a `list_duplicate_groups`.
  - Aggiungi `GET /api/v1/duplicates/backup-gap`:
    - Parametri: `primary_source_id: str`, `backup_source_id: str`, `only_favorites: bool = False`, `export_format: Optional[str] = Query(None, pattern="^(csv|json|rsync_txt)$")`.
    - Se `export_format == "rsync_txt"`: restituisce `Response(content="\n".join(item["relative_path"] for item in gap["missing_items"]) + ("\n" if gap["missing_items"] else ""), media_type="text/plain", headers={"Content-Disposition": 'attachment; filename="missing_on_backup_rsync.txt"'})`.
    - Se `export_format == "csv"`: restituisce CSV scaricabile con le colonne di `missing_items`.
    - Altrimenti restituisce il dizionario JSON `gap`.
  - Aggiorna `GET /api/v1/duplicates/export`:
    - Aggiungi parametro opzionale `mode: str = Query("all", pattern="^(all|intra_source|multi_source)$")`.
    - Per ogni gruppo, traccia `seen_sources = set()` e distingui in modo intelligente:
      - La prima copia assoluta (o sulla `preferred_source_id`): `recommended_action = "KEEP"` (retrocompatibile!) e aggiungi una nuova colonna `"redundancy_role"`:
        - `"PRIMARY_KEEP"` per la copia principale scelta
        - `"BACKUP_REPLICA_KEEP"` per la **prima** copia su ciascuna **altra** fonte fisica distinta (`f.source_id not in seen_sources`) -> da **conservare** perché protegge da guasto disco!
        - `"REDUNDANT_SAME_DISK"` per le copie successive sulla **stessa** fonte fisica (`f.source_id in seen_sources`) -> vere candidate alla pulizia!

### Verifica Task 7.2
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 7.3 — INTERFACCIA UTENTE: CENTRO "PROTEZIONE BACKUP & DUPLICATI", BADGE RESILIENZA & GAP ANALYSIS

### 1. Client API (`frontend/src/services/api.ts`)
- Aggiorna `ApiClient.getMedia(params)` per supportare `protectionStatus?: string` (`protection_status`).
- Aggiorna `ApiClient.getDuplicates(offset = 0, limit = 50, mode: 'all' | 'intra_source' | 'multi_source' = 'all')`.
- Aggiungi `ApiClient.getBackupGap(primarySourceId: string, backupSourceId: string, onlyFavorites = false)`.
- Aggiungi `ApiClient.getBackupGapExportUrl(primarySourceId: string, backupSourceId: string, format: 'csv' | 'json' | 'rsync_txt', onlyFavorites = false)`.
- Aggiorna `ApiClient.createSource` / `updateSource` per supportare opzionalmente `role?: string`.

### 2. Badge e Filtro di Protezione in `LibraryView.tsx` e `MediaDetailModal.tsx`
- In `frontend/src/features/library/LibraryView.tsx`:
  - Aggiungi stato `protectionStatus` (`'' | 'protected' | 'unprotected' | 'intra_source_duplicate'`) e selettore nella barra filtri:
    - `🛡️ Tutti gli stati backup`
    - `🟢 Protetti (2+ Dischi)` (`protected`)
    - `🔴 A Rischio (1 Solo Disco)` (`unprotected`)
    - `🟠 Duplicati Intra-Disco (Spreco)` (`intra_source_duplicate`)
  - Sulle card media (`renderMediaCard`):
    - Se `media.protection_status === 'protected'`: mostra un badge **verde (`#22c55e`) `🛡️ {media.distinct_sources_count} DISCHI`** (e bordo card verde tenue o neutro invece del bordo arancione d'allarme!).
    - Se `media.protection_status === 'intra_source_duplicate'`: mostra badge **ambra (`#f59e0b`) `⚠️ {media.copies_count} COPIE · {media.distinct_sources_count} {media.distinct_sources_count === 1 ? 'DISCO' : 'DISCHI'}`**.
- In `frontend/src/features/library/MediaDetailModal.tsx`:
  - Nell'intestazione e nella sezione **"Copie Fisiche Identificate"**, mostra chiaramente il badge dello stato di protezione:
    - 🟢 `Protetto su {distinct_sources_count} dischi distinti`
    - 🔴 `A Rischio: presente su 1 solo disco fisico`
    - 🟠 `Attenzione: contiene copie duplicate sullo stesso disco`

### 3. Evoluzione di `DuplicatesView.tsx` in "Protezione Backup, Ridondanza & Duplicati"
- In `frontend/src/features/duplicates/DuplicatesView.tsx`:
  - **4 Card KPI nella testata**:
    1. 🟢 **Copertura Backup (2+ Dischi)**: `{summary.protection_coverage_pct}%` (`{summary.protected_media_count}` media protetti su più dischi).
    2. 🔴 **A Rischio (1 Solo Disco)**: `{summary.unprotected_media_count}` media (`{summary.unprotected_favorites_count}` ❤️ Preferiti senza backup!).
    3. 🟠 **Spreco Reale Intra-Disco**: `{formatBytes(summary.intra_source_wasted_bytes)}` (`{summary.intra_source_groups}` gruppi con doppioni sullo *stesso* disco).
    4. 🛡️ **Spazio Investito in Backup**: `{formatBytes(summary.multi_source_backup_bytes)}` (`{summary.healthy_multi_source_groups}` repliche sane su altri dischi).
  - **4 Tab di Navigazione**:
    1. 🟠 **Doppioni Intra-Disco (Spreco Reale)** (`mode = 'intra_source'`) — mostra i file duplicati dentro lo stesso disco, evidenziando con badge `SPRECO STESSO DISCO` le copie ridondanti sullo stesso supporto.
    2. 🟢 **Repliche Multi-Disco (Backup Sani)** (`mode = 'multi_source'`) — mostra i media custoditi su 2+ dischi diversi con badge verde `REPLICA DI SICUREZZA`.
    3. 🛡️ **Verifica Copertura & Gap tra 2 Dischi (Backup Check)**:
       - Selettore **Fonte Primaria** (es. `SSD 512`) e **Fonte di Backup** (es. `HDD Esterno / NAS`) + checkbox **"Solo Preferiti ❤️"**.
       - Barra di copertura visuale (`{gap.coverage_pct}% copiato sul disco di backup` — `{gap.backed_up_media}` su `{gap.total_primary_media}` media, `{gap.missing_on_backup_count}` mancanti pari a `{formatBytes(gap.missing_on_backup_bytes)}`).
       - Pulsanti export 100% read-only:
         - **"Esporta CSV Mancanti"**
         - **"Esporta Lista `rsync --files-from` (.txt)"** (con box informativo che mostra il comando `rsync -av --files-from=missing_on_backup_rsync.txt "<root_primaria>/" "<root_backup>/"` pronto da copiare!).
       - Elenco/griglia dei file presenti sulla Fonte Primaria che mancano ancora sulla Fonte di Backup (cliccabili per aprire `MediaDetailModal`).
    4. ✨ **Foto Simili / Raffiche (`dHash`)** (mantenendo i controlli `max_distance` e `within24h`).
- In `frontend/src/features/sources/SourcesView.tsx`:
  - Nel modale creazione/lista fonti, mostra e permetti di selezionare il ruolo della fonte (`Disco Principale`, `Disco di Backup`, `Archivio Storico`).
- In `frontend/src/features/dashboard/DashboardView.tsx`:
  - Aggiungi un indicatore sintetico **"Salute Backup Multi-Disco"** con `%` di media protetti su 2+ dischi e link diretto a `duplicates`.

### Verifica Task 7.3
- Esegui `backend/venv/bin/pytest` e `cd frontend && npm run build`.

---

## TASK 7.4 — SUITE DI TEST AUTOMATIZZATI (`backend/app/tests/test_phase_7_redundancy.py`)

Crea `backend/app/tests/test_phase_7_redundancy.py` usando esclusivamente le fixture isolate `(client, auth_headers, db)` di `conftest.py` e verifica:
1. **`test_protection_status_classification_and_filtering`**:
   - Crea 2 fonti: `Source A` (`role="primary"`) e `Source B` (`role="backup"`).
   - Ingestisci:
     - **Media 1 (Unprotected + Favorite)**: 1 copia solo su `Source A`, marcato `is_favorite = True`.
     - **Media 2 (Protected Multi-Disk)**: 1 copia su `Source A` + 1 copia (stesso SHA-256) su `Source B`.
     - **Media 3 (Intra-Source Duplicate)**: 2 copie (stesso SHA-256, percorsi diversi `dir1/m3.jpg` e `dir2/m3.jpg`) entrambe su `Source A`.
   - Verifica `GET /api/v1/media`:
     - Media 1 ha `distinct_sources_count == 1`, `copies_count == 1`, `protection_status == "unprotected"`.
     - Media 2 ha `distinct_sources_count == 2`, `copies_count == 2`, `protection_status == "protected"`.
     - Media 3 ha `distinct_sources_count == 1`, `copies_count == 2`, `protection_status == "intra_source_duplicate"`.
   - Verifica i filtri `GET /api/v1/media?protection_status=unprotected`, `protection_status=protected`, `protection_status=intra_source_duplicate`.
2. **`test_duplicates_modes_and_smart_summary_metrics`**:
   - Verifica `GET /api/v1/duplicates/summary`:
     - `intra_source_groups == 1` (solo Media 3)
     - `healthy_multi_source_groups == 1` (solo Media 2)
     - `unprotected_media_count == 1` (Media 1)
     - `unprotected_favorites_count == 1` (Media 1)
     - `protected_media_count == 1` (Media 2)
     - `intra_source_wasted_bytes == size(Media 3)` (NON include Media 2 che è backup sano!)
     - `multi_source_backup_bytes == size(Media 2)`
   - Verifica `GET /api/v1/duplicates?mode=intra_source` (restituisce solo Media 3) e `GET /api/v1/duplicates?mode=multi_source` (restituisce solo Media 2).
   - Verifica `GET /api/v1/duplicates/export?format=json`: la seconda copia di Media 2 ha `redundancy_role == "BACKUP_REPLICA_KEEP"`, mentre la seconda copia di Media 3 ha `redundancy_role == "REDUNDANT_SAME_DISK"`.
3. **`test_backup_gap_analysis_and_rsync_export`**:
   - Chiama `GET /api/v1/duplicates/backup-gap?primary_source_id={Source A}&backup_source_id={Source B}`:
     - `total_primary_media == 3`, `backed_up_media == 1` (Media 2), `missing_on_backup_count == 2` (Media 1 e Media 3).
   - Chiama `GET /api/v1/duplicates/backup-gap?primary_source_id={Source A}&backup_source_id={Source B}&only_favorites=true`:
     - `missing_on_backup_count == 1` (solo Media 1).
   - Chiama `GET /api/v1/duplicates/backup-gap?primary_source_id={Source A}&backup_source_id={Source B}&export_format=rsync_txt`:
     - Verifica HTTP `200`, `text/plain` contenente i `relative_path` di Media 1 e Media 3.

---

## CRITERI DI ACCETTAZIONE FINALI (CHECKLIST OBBLIGATORIA)

- [ ] `backend/venv/bin/pytest` esegue tutti i test (i 40 esistenti + i nuovi di `test_phase_7_redundancy.py`) con **100% pass** e **0 modifiche** al DB reale `backend/data/personal_media_manager.db`.
- [ ] `cd frontend && npm run build` compila con **0 errori TypeScript/Vite**.
- [ ] La Libreria distingue visivamente **Repliche Sane Multi-Disco (`🛡️ N DISCHI` verde)** da **Doppioni Intra-Disco (`⚠️` ambra)** e permette di filtrare per `protection_status`.
- [ ] La vista Duplicati & Backup separa lo **Spreco Intra-Disco** dallo **Spazio Investito in Backup** e include il tab **Verifica Copertura & Gap tra 2 Dischi** con export CSV e `rsync --files-from`.
