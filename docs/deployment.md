# Guida al Deployment & Distribuzione (Milestone 6)

Questa guida illustra le modalità di distribuzione, esecuzione e backup per **Personal Media Manager**.

---

## 1. Quick Start con Docker Compose (Metodo Consigliato)

Il modo più rapido per avviare l'intera suite (Frontend React ottimizzato su Nginx + Backend FastAPI con database SQLite e persistenza miniature) è utilizzare Docker Compose.

### Prerequisiti
- Docker Engine 24.0+
- Docker Compose v2.20+

### Procedura di Avvio

1. **Configura le variabili di ambiente:**
   ```bash
   cp .env.example .env
   # Modifica la chiave JWT_SECRET_KEY nel file .env
   ```

2. **Avvia i container in background:**
   ```bash
   docker compose up -d --build
   ```

3. **Accedi all'applicazione:**
   - **Frontend Web UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Healthcheck endpoint**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

4. **Arresto:**
   ```bash
   docker compose down
   ```

I dati del catalogo SQLite (`media.db`) e le miniature generate (`/thumbnails`) sono preservati nel volume persistente Docker `pmm_data`.

---

## 2. Avvio Locale per Sviluppo (Bare Metal)

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pillow requests

# Avvio server di sviluppo
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
La Web App sarà accessibile su `http://localhost:5173`.

---

## 3. Scansione Automatica con Headless CLI Agent (Milestone 5)

Per indicizzare cartelle locali di grandi dimensioni, dischi di rete (SMB/NFS) o NAS senza mantenere aperto il browser:

```bash
# Installazione dipendenze minime dell'agente
pip install -r agent/requirements.txt

# Esecuzione scansione
./agent/scanner_agent.py \
  --server http://localhost:8000 \
  --email demo@example.com \
  --password demo123456 \
  --source-name "NAS Foto Famiglia" \
  --path /percorso/della/cartella/foto
```

### Parametri CLI disponibili:
- `--server`: URL del backend centrale (default: `http://localhost:8000`).
- `--email`: Email dell'account utente.
- `--password`: Password dell'account.
- `--source-name`: Nome descrittivo della fonte o disco (es. "Hard Disk Lacie 4TB").
- `--path`: Percorso assoluto o relativo della cartella da scansionare.
- `--batch-size`: Numero di file per batch HTTP (default: `50`).
- `--no-incremental`: Forza il ricalcolo dell'hash di tutti i file ignorando le impronte già memorizzate.
- `--no-reconcile`: Disabilita la marcatura automatica dei file rimossi/spostati.

### Esecuzione Periodica tramite Crontab
Per pianificare una scansione incrementale notturna ogni giorno alle 03:00:
```cron
0 3 * * * /usr/bin/python3 /opt/personal-media-manager/agent/scanner_agent.py --server http://127.0.0.1:8000 --email demo@example.com --password demo123456 --source-name "Backup Foto" --path /mnt/nas/photos >> /var/log/pmm_scan.log 2>&1
```

---

## 4. Strategie di Backup e Disaster Recovery

### Backup a Caldo del Database SQLite (WAL Mode)
Grazie alla modalità WAL (`Write-Ahead Logging`), il backup del database SQLite può essere effettuato a caldo senza bloccare letture o scritture:

```bash
# Tramite CLI SQLite nativa
sqlite3 ./data/media.db ".backup ./backups/media_backup_$(date +%Y%m%d_%H%M%S).db"
```

Nel caso di deployment Docker:
```bash
docker exec pmm-backend sqlite3 /data/media.db ".backup /data/backup_today.db"
```

### Replica delle Miniature
Le miniature WebP sono memorizzate con partizionamento su disco a due livelli:
`/data/thumbnails/{sha[0:2]}/{sha[2:4]}/{sha}.webp`

Per replicarle o sincronizzarle:
```bash
rsync -avz --progress ./data/thumbnails/ /percorso/backup/thumbnails/
```

---

## 5. Checklist di Sicurezza per la Produzione

1. **JWT Secret Key**: Generare sempre una chiave crittografica casuale a 256 bit:
   ```bash
   openssl rand -hex 32
   ```
2. **Reverse Proxy SSL**: Terminare sempre HTTPS (ad esempio con Let's Encrypt / Traefik / Cloudflare / Nginx esterno).
3. **Immutabilità dei File Originali**:
   - Il software opera in modalità **rigorosamente di sola lettura** sui file originali.
   - Per ulteriore sicurezza aziendale, montare i percorsi sorgente con flag `:ro` nei volumi Docker:
     ```yaml
     volumes:
       - /mnt/dischi_foto:/media/nas:ro
     ```
