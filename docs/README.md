# Documentazione — Personal Media Manager

Benvenuto nella cartella dedicata alla documentazione tecnica e operativa di **Personal Media Manager**.

---

## Indice dei Documenti

| Documento | A chi serve | Contenuto |
| :--- | :--- | :--- |
| **[Guida Utente](user_guide.md)** | Utenti finali | Avvio su macOS / Docker, login, panoramica delle 10 viste UI, scansioni, duplicati, cestino sicuro, backup SHA-256, monitoraggio USB |
| **[Guida Sviluppatori](developer_guide.md)** | Sviluppatori / Futuri sviluppi | Mappa completa dei file backend/frontend, checklist per aggiungere nuove feature end-to-end, comandi di test e build |
| **[Riferimento API v1](api_reference.md)** | Sviluppatori / Agenti | Elenco completo degli endpoint REST `/api/v1/*` raggruppati per modulo |
| **[Architettura di Sistema](architecture.md)** | Sviluppatori | Principi guida, diagramma componenti, protocollo scanner <-> backend e servizi post-MVP |
| **[Modello Dati & Database](database.md)** | Sviluppatori | Schema ER, definizione tabelle core e aggiuntive (`albums`, `tags`, `ai_*`), indici, PRAGMA SQLite WAL e `run_db_migrations` |
| **[Specifiche Scanner & Hashing](scanning.md)** | Sviluppatori | Pipeline streaming SHA-256, estrazione EXIF e generazione miniature WebP |
| **[Deployment & Backup](deployment.md)** | Ops / Self-hosting | Configurazione Docker Compose, Nginx, `.env` e procedure di backup |
| **[Roadmap & Criteri MVP](roadmap.md)** | Storico progetto | Milestone 0–6 e matrice criteri di accettazione `AC01`–`AC15` |
| **[Report Benchmark Milestone 1](milestone_1_report.md)** | Storico performance | Risultati empirici di throughput e consumo RAM dello scanner browser |

---

## Stato Attuale del Software

Il progetto ha superato la fase MVP (Milestone 0–6) e include le estensioni fino alla **Fase 14**:
- **SPA Self-Contained** servita direttamente da FastAPI su porta `8089` (`start_app.command`), oltre alla modalità sviluppo (`Avvia_Media_Manager.command`, `Personal Media Manager.app`) e Docker (`docker-compose.yml`).
- **Libreria Unificata** con vista Griglia (zoom slider stile Apple Photos), vista Lista File (200/pagina, filtro cartella), selezione marquee, menu contestuale, scorciatoie da tastiera, anteprime HD/RAW.
- **Organizzazione**: Preferiti, Album, Tag colorati, Mappa GPS con reverse geocoding offline.
- **Protezione & Deduplicazione**: Duplicati esatti (SHA-256), simili (dHash), Cestino sicuro reversibile, confronto drive e copia backup con verifica SHA-256.
- **AI Advisor opzionale**: Supporto configurabile per `gemini` / `ollama` / `none` (Folder Advisor, Smart Albums, Best Shot) con cache e cap giornaliero.
- **Monitoraggio Proattivo**: Rilevamento automatico mount USB e modifiche cartelle locali con notifiche SSE in tempo reale.
