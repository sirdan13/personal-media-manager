# Architettura e Fattibilità della Scansione Browser - Personal Media Manager

## 1. Analisi di Fattibilità Tecnica e API Browser

La scansione diretta di cartelle dal browser senza software installato è il requisito più innovativo e delicato del progetto.

### 1.1 Metodi di Accesso al Filesystem nel Browser

Esistono due approcci standard per accedere a file locali dal browser:

| Caratteristica | File System Access API (`showDirectoryPicker`) | Input HTML (`<input type="file" webkitdirectory>`) |
| :--- | :--- | :--- |
| **Supporto Browser** | Chrome 86+, Edge 86+, Opera 72+ (Desktop) | Chrome, Edge, Safari macOS (11.1+), Firefox (50+) |
| **Modello di autorizzazione** | Finestra modale con autorizzazione esplicita cartella | Dialogo di selezione cartella al click |
| **Navigazione directory** | Ricorsiva e asincrona (`values()`, iterator) | Restituisce subito la `FileList` piatta di tutti i file |
| **Persistenza permessi** | Possibile conservare l'handle in IndexedDB (`verifyPermission()`) | Nessuna (al refresh della pagina i puntatori svaniscono) |
| **Consumo di memoria su grandi archivi** | **Basso**: i file vengono scoperti e letti progressivamente durante la visita dell'albero | **Medio-Alto**: crea in memoria migliaia di oggetti `File` contemporaneamente nella `FileList` |
| **Accesso a file grandi** | `handle.getFile()` on-demand | Oggetti `File` già instanziati |

### 1.2 Matrice di Compatibilità e Strategia Polyfill/Fallback

```
+-------------------+-----------------------------+------------------------------+
| Browser (Desktop) | File System Access API      | WebKit Directory Fallback    |
+-------------------+-----------------------------+------------------------------+
| Google Chrome     | SÌ (Pieno supporto nativo)  | Supportato                   |
| Microsoft Edge    | SÌ (Pieno supporto nativo)  | Supportato                   |
| Safari macOS      | NO (Non supportato)         | SÌ (webkitdirectory standard)|
| Mozilla Firefox   | NO (Disabilitato di default)| SÌ (webkitdirectory standard)|
+-------------------+-----------------------------+------------------------------+
```

**Strategia di Rilevamento:**
1. Verificare `if ('showDirectoryPicker' in window)`.
2. Se presente (Chrome/Edge): utilizzare `showDirectoryPicker({ mode: 'read' })`. Fornisce un'esperienza superiore: navigazione ad albero non bloccante, possibilità di ri-richiedere i permessi per la cartella in sessioni successive senza ri-navigare il disco.
3. Se assente (Safari/Firefox): fallback trasparente su `<input type="file" webkitdirectory multiple>`. La UI avvisa l'utente: *"Il tuo browser non supporta il mantenimento dei permessi cartella; in caso di ricaricamento della pagina dovrai riselezionare la cartella per continuare"*.

---

## 2. Calcolo Hash SHA-256 in Streaming e Salvaguardia della Memoria

### 2.1 La Criticità di `crypto.subtle.digest`
La Web Crypto API standard nativa del browser (`crypto.subtle.digest('SHA-256', buffer)`) richiede che **l'intero buffer del file** sia presente in memoria.
- Per un file JPEG da 4 MB: nessun problema.
- Per un video MP4 da 4 GB o una serie di 1.000 file: caricare con `file.arrayBuffer()` causerebbe un'esaurimento istantaneo della memoria della scheda browser (Out of Memory crash).

### 2.2 La Soluzione: Hashing Incrementale a Blocchi (Chunking)
Per garantire stabilità con qualsiasi dimensione di file:
- Si legge il file a blocchi (es. chunk da 2 MB o 4 MB) utilizzando l'API `File.stream()` o `FileReader.readAsArrayBuffer()` con slice (`file.slice(offset, offset + CHUNK_SIZE)`).
- Si aggiorna uno stato crittografico incrementale (`hasher.update(chunk)`).
- Al termine dei chunk si ottiene l'hash finale (`hasher.digest('hex')`).

**Libreria Selezionata:**
`hash-wasm` (implementazione SHA-256 altamente ottimizzata in WebAssembly SIMD):
- Prestazioni: > 400-600 MB/s su moderni browser desktop.
- Consumo di memoria: costante (< 5 MB di RAM anche per file video da 50 GB).
- Nessuna dipendenza complessa, compatibile con Web Worker.

---

## 3. Estrazione Metadati Client-Side

Per non inviare file non necessari al server e preservare la privacy:
1. **Fotografie (JPEG, TIFF, WebP, HEIC/AVIF)**:
   - Utilizzo di `exifr` (libreria JS/TS leggera e ad altissime prestazioni per il parsing dei tag EXIF, IPTC e XMP).
   - Legge solo i primi 64-128 KB del file (header EXIF), senza scaricare l'intero binario.
   - Dati estratti:
     - Data e ora di scatto originale (`DateTimeOriginal` o `CreateDate`).
     - Modello e produttore fotocamera/smartphone (`Make`, `Model`).
     - Orientamento (`Orientation` tag 1-8).
     - Dimensioni native (`ImageWidth`, `ImageHeight`).
     - Coordinate GPS (latitudine, longitudine, altitudine).
     - Parametri di scatto (FNumber, ExposureTime, ISO, FocalLength).
2. **Video (MP4, MOV, WebM)**:
   - Estrazione durata e dimensioni native tramite elemento `<video>` off-screen con `URL.createObjectURL(file)` e revoca immediata, oppure parsing atomico dei tag `moov/mvhd` (primi blocchi del file).
3. **Formati Generici / Non Supportati**:
   - Vengono comunque indicizzati con `filename`, `relative_path`, `size_bytes`, `extension`, `filesystem_modified_at` e `sha256`.

---

## 4. Generazione Miniature Lato Client

1. **Ridimensionamento Diretto**:
   - Lato client tramite `createImageBitmap()` o `HTMLImageElement` + `OffscreenCanvas`.
   - Ridimensionamento al volo a una risoluzione massima di 384px sul lato lungo, preservando il rapporto d'aspetto (aspect ratio).
   - Correzione automatica dell'orientamento EXIF.
2. **Formato e Compressione**:
   - Compressione in `image/webp` con qualità 0.75 (o `image/jpeg` su browser obsoleti).
   - Dimensione media della miniatura: **15 - 35 KB** (rispetto ai 5 - 25 MB del file originale).
3. **Invio al Backend**:
   - Le miniature vengono trasmesse in lotti al server insieme al payload JSON dei metadati.
   - Non c'è alcun upload del file originale.

---

## 5. Gestione Concorrenza, Memoria e Pipeline di Scansione

Per mantenere l'interfaccia a 60 FPS senza bloccare il thread principale:

```
[ Directory Discovery ] 
       | (Trova file ed estensioni supportate)
       v
[ Queue / Backlog ] (Lista ordinata dei percorsi)
       |
       |-- Concorrenza limitata (default: 3 worker paralleli)
       v
[ Worker Pipeline ]
       |-- Passo 1: Hash SHA-256 incrementale a chunk (RAM limitata a 2MB)
       |-- Passo 2: Estrazione EXIF dai primi 64KB
       |-- Passo 3: Creazione miniatura 384px WebP
       v
[ Batch Accumulator ] (Accumula fino a 25-50 elementi)
       |
       v (POST /api/v1/scans/{id}/batch)
[ Backend Ingestion ]
       |-- Aggiornamento stato avanzamento
       |-- Checkpoint su IndexedDB / Backend
```

### 5.1 Tolleranza agli Errori per Singolo File
Se un file è corrotto, protetto da permessi o ha un formato non decodificabile:
- L'errore viene intercettato nel blocco `try/catch` del worker.
- Il file viene registrato con `failed_files += 1` e il dettaglio dell'errore viene allegato.
- La scansione procede regolarmente con il file successivo senza interrompersi.

### 5.2 Strategia di Checkpointing e Ripresa
1. Il backend e il client mantengono il registro dei file già elaborati per quel `source_id`.
2. In caso di interruzione (chiusura browser, disconnessione di rete):
   - Al riavvio della scansione per la medesima fonte, il client controlla i percorsi già registrati nel backend.
   - I file già presenti vengono saltati istantaneamente, riprendendo esattamente dall'ultimo elemento mancante.
