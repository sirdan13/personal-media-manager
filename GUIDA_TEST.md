# Guida al Collaudo e Test di Personal Media Manager

Questa guida illustra passo-passo come avviare, navigare e collaudare tutte le funzionalità di **Personal Media Manager** sul tuo computer.

---

## 1. Avvio Rapido con un Solo Comando

Abbiamo predisposto lo script integrato `start.sh` che avvia sia il backend FastAPI che il frontend Vite in parallelo, aprendo automaticamente il browser.

Nel terminale, dalla cartella principale del progetto:

```bash
./start.sh
```

Lo script si occuperà di:
1. Verificare l'ambiente virtuale Python e le dipendenze npm.
2. Avviare il server backend su `http://127.0.0.1:8000`.
3. Verificare l'healthcheck del backend (`/api/v1/health`).
4. Avviare il frontend React su `http://localhost:5173`.
5. Aprire direttamente il browser sulla Web App.

> **Per arrestare l'applicazione**: basta premere `Ctrl + C` nella finestra del terminale in cui gira `start.sh` (tutti i processi backend e frontend verranno terminati in modo pulito).

---

## 2. Percorso di Test Guidato (Step-by-Step)

### Step 1: Autenticazione
1. All'apertura dell'applicazione, visualizzerai la finestra di login.
2. Puoi inserire le tue credenziali oppure fare clic sul pulsante rapido **"Usa Account Demo"** (`demo@example.com` / `demo123456`).
3. Clicca su **"Accedi alla Piattaforma"**.

---

### Step 2: Registrazione di una Fonte (Hard Disk / Cartella)
1. Dalla barra laterale, seleziona la sezione **"Fonti"**.
2. Clicca su **"+ Registra Nuova Fonte"**.
3. Inserisci un nome descrittivo (ad esempio: `"Hard Disk Esterno"` o `"Foto iPhone"`).
4. Seleziona il tipo di fonte (es. *Cartella Browser*) e conferma con **"Registra Fonte"**.

---

### Step 3: Esecuzione di una Scansione

#### Opzione A: Scansione di una cartella reale del tuo computer
1. Vai nella sezione **"Scansioni"**.
2. Seleziona dal menu a tendina la fonte creata al punto precedente.
3. Clicca su **"Seleziona Cartella da Scansionare"** (su Chrome/Edge si aprirà il selettore cartella nativo; su Safari/Firefox il fallback universale).
4. Scegli una cartella contenente immagini (.jpg, .png, .webp) o video (.mp4, .mov).
5. Osserva la telemetria in tempo reale:
   - Velocità in file/secondo e MB/s.
   - Avanzamento percentuale.
   - Calcolo hash SHA-256 incrementale a blocchi (senza consumo di RAM).
   - Generazione delle anteprime WebP 384px.
   - Sincronizzazione a batch verso il backend.

#### Opzione B: Test Istantaneo con il Generatore di Benchmark (Senza file locali)
Se vuoi testare il motore su grandi volumi senza usare subito le tue foto personali:
1. Sempre nella schermata **"Scansioni"**, scorri verso il box **"Benchmark e Stress Test"**.
2. Clicca su **"Esegui Test 100 File"** o **"Esegui Test 1.000 File"**.
3. Il motore genererà in memoria un set sintetico con duplicati binari controllati ed estrarrà hash e metadati verificando le performance.

---

### Step 4: Consultazione della Dashboard
1. Torna sulla voce **"Dashboard"**.
2. Verifica i contatori aggiornati in tempo reale:
   - **Totale Media Logici**: numero di fotografie/video univoci.
   - **Copie Fisiche**: totale di copie presenti nei vari percorsi.
   - **Duplicati Esatti**: numero di copie ridondanti identificate.
   - **Stato Fonti**: elenco delle memorie registrate con badge online/offline.

---

### Step 5: Esplorazione della Libreria & Dettaglio EXIF / GPS
1. Clicca su **"Libreria"** (oppure filtra direttamente con le schede **"Foto"** e **"Video"**).
2. Prova i controlli in cima:
   - **Ricerca testuale**: cerca per nome del file.
   - **Filtro Fonte**: seleziona una specifica fonte o visualizzale tutte.
   - **Ordinamento**: data di scatto (più recenti / più vecchie), nome, dimensione file.
3. Fai clic su una foto per aprire la **Schermata di Dettaglio**:
   - Visualizza l'anteprima WebP ottimizzata.
   - Leggi le specifiche tecniche (risoluzione, peso, formato).
   - Consulta i metadati EXIF (fotocamera, modello, data e ora di scatto originale).
   - Se la foto include coordinate GPS, visualizza le coordinate e clicca sul link **"Mappa"** per aprire la posizione esatta su OpenStreetMap.
   - Verifica l'hash crittografico **SHA-256**.
   - Nella sezione **"Copie Fisiche Identificate"**, vedi esattamente in quale cartella e su quale hard disk risiede la foto.

---

### Step 6: Verifica dei Duplicati Esatti
1. Clicca su **"Duplicati"** nel menu laterale.
2. Visualizzerai tutti i file che possiedono lo stesso identico hash SHA-256 binario pur trovandosi in cartelle o con nomi diversi.
3. Osserva:
   - Il riquadro in alto con il calcolo dello **Spazio Ridondante Potenzialmente Recuperabile** (es. `1.4 GB risparmiabili`).
   - La tabella di confronto delle copie: `#1`, `#2` con i rispettivi percorsi, nomi e fonti.
   - **Nota di sicurezza**: il software è rigorosamente *read-only* e non tocca né cancella i file originali.

---

### Step 7: Test delle Fonti Offline (Scollegate)
Un requisito essenziale del progetto è poter consultare l'archivio anche quando un hard disk o pennetta USB viene fisicamente rimossa:
1. Vai su **"Fonti"**.
2. Sulla fonte appena scansionata, clicca sul pulsante **"Imposta Offline"**.
3. Torna in **"Libreria"**:
   - Tutte le foto e miniature della fonte rimangono visibili, ricercabili e consultabili!
   - Aprendo il dettaglio di una foto, la copia mostrerà chiaramente il badge grigio **`DISCO OFFLINE`**.
4. Torna su **"Fonti"** e clicca su **"Ricollega (Online)"** per riattivare la fonte.

---

### Step 8: Test della Scansione Incrementale Istantanea
1. Vai su **"Scansioni"** e avvia nuovamente la scansione sulla stessa cartella già indicizzata.
2. Noterai che la scansione sarà praticamente **istantanea**: il motore confronta le impronte digitali memorizzate (`size` e `mtime`) e salta il ricalcolo dell'hash e la rigenerazione della miniatura per i file non modificati!

---

### Step 9: Test dell'Agente Locale Headless CLI (Opzionale)
Se desideri collaudare la scansione da riga di comando (utile per NAS o script automatici notturni via cron):
1. Apri un secondo terminale.
2. Lancia l'agente Python:
   ```bash
   ./agent/scanner_agent.py \
     --server http://localhost:8000 \
     --email demo@example.com \
     --password demo123456 \
     --source-name "Scansione CLI Test" \
     --path ./backend/app/tests
   ```
3. L'agente eseguirà l'hashing a streaming, l'estrazione metadati e l'invio batch direttamente al backend senza passare dal browser.

---

## 3. Riepilogo Porte e Riferimenti

| Servizio | URL | Descrizione |
| :--- | :--- | :--- |
| **Web App** | [http://localhost:5173](http://localhost:5173) | Interfaccia grafica completa |
| **Backend API** | [http://127.0.0.1:8000](http://127.0.0.1:8000) | Server REST FastAPI |
| **Swagger Docs** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Documentazione OpenAPI interattiva |
| **Credenziali Demo** | `demo@example.com` / `demo123456` | Account di prova preconfigurato |
