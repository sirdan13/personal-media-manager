# PIANO ESECUTIVO PER AGENTE AI (FLASH) — Fase 9: AI Advisor & Smart Curation (Euristica Locale + Gemini Free Tier / Ollama)

> **ISTRUZIONI TASSATIVE PER L'AGENTE ESECUTORE (FLASH)**:
> Piano della **Fase 9** per `/Users/daniele/projects/personal-media-manager`, costruito sopra la Fase 8 già implementata (`trash_service.py`, `.pmm_trash`, tab Cestino in `DuplicatesView.tsx`).
>
> 1. **L'AI SUGGERISCE, NON ESEGUE MAI**: nessun endpoint AI sposta file. L'AI produce solo **pre-selezioni** (`keep` / `trash`) con motivazione. Lo spostamento avviene esclusivamente tramite gli endpoint di trash esistenti (o nuovi endpoint di trash con guardrail, Task 9.5), dopo **conferma esplicita** dell'utente nella UI. Tutto resta reversibile da `.pmm_trash`.
> 2. **Funziona sempre, anche senza AI**: il motore euristico locale (Task 9.1) è il default ed è usato come **fallback automatico** su qualsiasi errore AI (chiave mancante, timeout, quota esaurita, JSON non valido, provider offline).
> 3. **Zero chiamate di rete nei test**: tutti i test devono usare un provider finto (`FakeProvider`) o `monkeypatch`. Nessun test deve chiamare Google o Ollama.
> 4. **Nessuna nuova dipendenza pip/npm**: usa `httpx` (già in `requirements.txt`), `Pillow`, stdlib. Niente SDK `google-generativeai`.
> 5. **Ordine rigoroso**: Task 9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 9.6 → 9.7 → 9.8.
> 6. **Verifica dopo OGNI task**: `backend/venv/bin/pytest` (100% pass, nessuna modifica a `backend/data/personal_media_manager.db`) e `cd frontend && npm run build` (0 errori).

---

## 0. PRINCIPI DI DESIGN (LEGGERE PRIMA DI INIZIARE)

### Dove si usa cosa (per restare nella quota gratuita)
| Funzione | Motore | Costo token | Dati inviati all'esterno |
| :--- | :--- | :--- | :--- |
| Quale copia tenere in un **duplicato esatto** (SHA-256) | **Solo euristica locale** | 0 | Nessuno |
| **Regole di pulizia per cartelle** (Folder Advisor) | Euristica + 1 chiamata LLM testo (opzionale) | ~1-3k token per analisi | Solo **nomi di cartelle** e conteggi |
| **Best Shot** nelle foto simili (dHash) | Euristica (nitidezza) + LLM multimodale (opzionale) | 1 chiamata per cluster | **Miniature WebP 320px** (solo se l'utente lo autorizza) |
| **Smart Album** (eventi per data/luogo) | Clustering locale + 1 chiamata LLM testo per i nomi (opzionale) | ~1-2k token | Date, località (`place_name`), nomi cartelle |

> Per i duplicati esatti i pixel sono identici bit per bit: un LLM non aggiunge valore e sprecherebbe quota. **Non chiamare mai l'AI per i singoli gruppi di duplicati esatti.**

### Provider supportati
- `none` (default): solo euristica.
- `gemini`: Google AI Studio (Gemini API REST), chiave gratuita.
- `ollama`: server locale (`http://localhost:11434`), 100% offline e gratuito (es. modelli `llama3.2` per testo, `llava` / `qwen2.5vl` per immagini).

### Privacy (obbligatorio in UI)
- Le immagini vengono inviate a un provider cloud **solo** se `allow_cloud_images = true` (default `false`).
- In Impostazioni mostra l'avviso: *"Con il piano gratuito di Gemini, Google può usare i contenuti inviati per migliorare i propri servizi. Per massima privacy usa Ollama in locale."*
- I limiti della quota gratuita **cambiano nel tempo**: non hardcodare numeri di quota nella UI; usa il tetto giornaliero configurabile (`daily_request_cap`) e mostra il contatore di utilizzo.

---

## TASK 9.1 — MOTORE EURISTICO LOCALE "ZERO-TOKEN" (`curation_heuristics.py`)

### Obiettivo
Calcolare in locale, senza rete, punteggi oggettivi per (a) scegliere quale copia di un duplicato esatto tenere, (b) stimare la qualità tecnica di foto simili.

### 1. Crea `backend/app/services/curation_heuristics.py`

#### 1.1 Punteggio qualità percorso — `score_path_quality(relative_path: str) -> Tuple[int, List[str]]`
Restituisce un punteggio `0..100` (base `50`) e una lista di motivazioni leggibili in italiano.
- Normalizza: `p = relative_path.replace("\\", "/")`, `segments = [s for s in p.split("/") if s]`, `folder_segments = segments[:-1]`, `filename = segments[-1]`.
- **Penalità cartelle "discarica"** (confronto case-insensitive su ogni `folder_segment`, match se il segmento **contiene** la parola):
  ```python
  JUNK_FOLDER_PATTERNS = {
      "download": -20, "downloads": -20, "desktop": -15, "scrivania": -15,
      "temp": -20, "tmp": -20, "cache": -25, "trash": -30, "cestino": -30,
      "whatsapp": -15, "telegram": -15, "copia": -15, "copy": -15,
      "backup": -10, "old": -10, "vecchi": -10, "da sistemare": -10,
      "unsorted": -10, "nuova cartella": -15, "new folder": -15, "untitled": -15,
      "dcim": -8, "100apple": -10, "camera roll": -8, "rullino": -8, "import": -5
  }
  ```
  Applica al massimo **una** penalità per segmento (la più negativa) e somma tra segmenti, con limite inferiore complessivo `-40`.
- **Penalità nome file**:
  - regex `\(\d+\)` (es. `IMG_1234 (1).JPG`) → `-15`, motivo `"Nome con suffisso di copia '(n)'"`.
  - `re.search(r"(?i)(\s-\s)?(copia|copy)(\s\d+)?\.", filename)` → `-15`.
  - UUID `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` → `-10`.
- **Bonus organizzazione**:
  - Un `folder_segment` che contiene un anno `(19|20)\d{2}` → `+10` (una sola volta), motivo `"Cartella organizzata per anno"`.
  - Un `folder_segment` "descrittivo": almeno 4 lettere, contiene `_`, `-` o spazio, e non è in `JUNK_FOLDER_PATTERNS` → `+10` (una sola volta), motivo `"Cartella con nome descrittivo"`.
  - Profondità `2 <= len(folder_segments) <= 5` → `+5`; profondità `> 7` → `-5`.
- Clamp finale `0..100`.

#### 1.2 Scelta copia da tenere — `rank_duplicate_copies(files: List[FileOut], preferred_source_id: Optional[str] = None) -> Dict[str, Any]`
Per un gruppo di **duplicati esatti** (stesso `media_id`):
- Considera solo copie attive (`availability_status not in ("missing", "trashed")`).
- Raggruppa per `source_id`. **Per ogni disco** tieni **una** copia (la regola "tieni 1 per disco" preserva le repliche di backup sane della Fase 7) e proponi il trash delle altre copie **sullo stesso disco**.
- Ordinamento dentro ogni disco (la prima vince): `path_score` desc → `source_id == preferred_source_id` → `len(relative_path)` asc → `first_indexed_at` asc.
- Copie su fonti **offline** non possono essere proposte per il trash (finiscono in `skipped_offline_file_ids`).
- Output:
  ```python
  {
      "media_id": "...",
      "engine": "heuristic",
      "keep_file_ids": ["..."],
      "trash_file_ids": ["..."],
      "skipped_offline_file_ids": ["..."],
      "scores": {"<file_id>": 72},
      "reasons": {"<file_id>": "Conservata: cartella organizzata per anno e nome descrittivo"},
      "confidence": 0.0..1.0   # (score_migliore - score_secondo) / 100, clamp 0.3..0.95
  }
  ```

#### 1.3 Qualità tecnica immagine — `compute_image_quality(media: Media, thumbnail_full_path: Optional[str]) -> Dict[str, Any]`
- **Nitidezza** (solo se la miniatura esiste su disco): apri con Pillow, `convert("L")`, `filter(ImageFilter.FIND_EDGES)`, `ImageStat.Stat(edges).var[0]` → `sharpness_raw`. È un valore **relativo**: va confrontato solo dentro lo stesso cluster.
- **Risoluzione**: `megapixels = (width * height) / 1_000_000` se disponibili.
- **Completezza metadati**: +1 per `captured_at`, +1 per `latitude`, +1 per `make/model` nel `metadata_json` del primo file attivo (gestisci chiavi `make`/`Make`, `model`/`Model`).
- Output: `{"sharpness_raw": float|None, "megapixels": float|None, "metadata_completeness": 0..3, "is_favorite": bool}`.

#### 1.4 Ranking cluster foto simili — `rank_similar_cluster(items: List[Dict]) -> Dict[str, Any]`
- Normalizza `sharpness_raw` dentro il cluster (min-max → `0..1`), idem `megapixels`.
- `quality = 0.55*sharpness_norm + 0.25*megapixels_norm + 0.10*(metadata_completeness/3) + 0.10*is_favorite`.
- Il media con `quality` massimo è il **best**. Un media **preferito** (`is_favorite`) non va mai proposto per il trash (resta in `keep`).
- Output: `{"engine": "heuristic", "best_media_id", "keep_media_ids", "trash_media_ids", "scores": {...}, "reasons": {...}}`.

### 2. Endpoint euristici (nuovo router `backend/app/api/v1/ai.py`, prefisso `/ai`, tag `"AI Advisor"`)
- Registra il router in `backend/app/api/v1/router.py`.
- `POST /api/v1/ai/duplicates/suggest-keep`
  - Body: `{"media_ids": List[str] (max 200), "preferred_source_id": Optional[str]}`.
  - Per ogni media dell'utente (ownership: `Media.user_id == current_user.id`), carica le copie (stesso formato `FileOut` di `list_duplicate_groups`) e restituisce la lista di output di `rank_duplicate_copies`.
  - **Mai** chiamate AI qui.
- `POST /api/v1/ai/similar/rank-heuristic`
  - Body: `{"media_ids": List[str] (2..12)}` → `rank_similar_cluster` sui media dell'utente.

### Verifica Task 9.1
`pytest` + `npm run build`.

---

## TASK 9.2 — LAYER PROVIDER AI, IMPOSTAZIONI, QUOTA GIORNALIERA E CACHE

### 1. Modelli DB (`backend/app/models/entities.py`) — creati via `Base.metadata.create_all`
```python
class AISettings(Base):
    __tablename__ = "ai_settings"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    provider = Column(String(20), nullable=False, default="none")      # none | gemini | ollama
    model_text = Column(String(100), nullable=True)
    model_vision = Column(String(100), nullable=True)
    api_key = Column(Text, nullable=True)                               # solo gemini; MAI restituita dalle API
    ollama_base_url = Column(String(255), nullable=True, default="http://localhost:11434")
    allow_cloud_images = Column(Integer, nullable=False, default=0)
    daily_request_cap = Column(Integer, nullable=False, default=100)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

class AIUsage(Base):
    __tablename__ = "ai_usage"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(String(10), nullable=False)                            # "YYYY-MM-DD"
    provider = Column(String(20), nullable=False)
    requests = Column(Integer, nullable=False, default=0)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint("user_id", "day", "provider", name="uq_ai_usage_day"),)

class AICache(Base):
    __tablename__ = "ai_cache"
    cache_key = Column(String(64), primary_key=True)                    # sha256 hex
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feature = Column(String(40), nullable=False)
    response_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
```

### 2. Configurazione (`backend/app/core/config.py`)
Aggiungi:
```python
GEMINI_API_KEY: str | None = os.environ.get("GEMINI_API_KEY")          # se presente ha priorità sulla chiave in DB
GEMINI_API_BASE: str = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_DEFAULT_MODEL: str = os.environ.get("GEMINI_DEFAULT_MODEL") or "gemini-2.5-flash"
AI_REQUEST_TIMEOUT_SECONDS: int = 60
AI_CACHE_TTL_DAYS: int = 30
```
> Il nome del modello è **configurabile** perché Google rinomina/depreca i modelli. La UI deve permettere di scegliere dal **listing reale** (endpoint `/ai/models`, sotto).

### 3. Crea `backend/app/services/ai_provider.py`

#### 3.1 Interfaccia comune
```python
class AIProviderError(Exception): ...
class AIQuotaExceeded(AIProviderError): ...

@dataclass
class AIResult:
    data: Dict[str, Any]          # JSON già parsato
    input_tokens: int = 0
    output_tokens: int = 0
    provider: str = ""
    model: str = ""

class BaseProvider:
    name: str
    def generate_json(self, system_prompt: str, user_prompt: str, schema: Dict[str, Any],
                      images: Optional[List[Tuple[bytes, str]]] = None) -> AIResult: ...
    def list_models(self) -> List[Dict[str, Any]]: ...
    def health(self) -> Dict[str, Any]: ...
```

#### 3.2 `GeminiProvider` (REST via `httpx.Client(timeout=settings.AI_REQUEST_TIMEOUT_SECONDS)`)
- Endpoint: `POST {GEMINI_API_BASE}/models/{model}:generateContent`, header `x-goog-api-key: <key>` (**non** mettere la chiave in query string, per non finire nei log).
- Body:
  ```json
  {
    "systemInstruction": {"parts": [{"text": "<system_prompt>"}]},
    "contents": [{"role": "user", "parts": [
      {"text": "<user_prompt>"},
      {"inlineData": {"mimeType": "image/webp", "data": "<base64>"}}
    ]}],
    "generationConfig": {
      "temperature": 0.2,
      "responseMimeType": "application/json",
      "responseSchema": <schema>
    }
  }
  ```
- Parsing: testo in `candidates[0].content.parts[0].text` → `json.loads`. Token da `usageMetadata.promptTokenCount` / `candidatesTokenCount`.
- HTTP `429` → `AIQuotaExceeded("Quota gratuita Gemini esaurita, riprova più tardi")`. Altri errori / JSON non valido → `AIProviderError`.
- **Robustezza `responseSchema`**: se la risposta è `400` con messaggio relativo allo schema, riprova **una volta** senza `responseSchema` (solo `responseMimeType`), aggiungendo al prompt lo schema in testo.
- `list_models()`: `GET {GEMINI_API_BASE}/models` (header chiave) → restituisci solo i modelli con `"generateContent"` in `supportedGenerationMethods`: `[{"id": name.removeprefix("models/"), "display_name", "input_token_limit"}]`.

#### 3.3 `OllamaProvider`
- `POST {ollama_base_url}/api/chat` con `{"model", "stream": false, "format": <schema o "json">, "options": {"temperature": 0.2}, "messages": [{"role":"system","content":...},{"role":"user","content":...,"images":[<base64>...]}]}`.
- Parsing: `message.content` → `json.loads`. Token: `prompt_eval_count`, `eval_count`.
- `list_models()`: `GET {ollama_base_url}/api/tags` → `[{"id": m["name"]}]`.
- Errore di connessione → `AIProviderError("Ollama non raggiungibile su <url>")`.

#### 3.4 `FakeProvider` (solo per i test)
Restituisce una risposta predefinita impostata nel costruttore e registra le chiamate ricevute.

#### 3.5 Factory e orchestrazione — `get_provider(db, user_id) -> Optional[BaseProvider]`
- Legge `AISettings` (crea record default se assente). `provider == "none"` → `None`.
- Gemini: chiave = `settings.GEMINI_API_KEY or ai_settings.api_key`; se mancante → `None`.
- Per i test: variabile modulo `_PROVIDER_OVERRIDE: Optional[BaseProvider] = None` + funzione `set_provider_override(p)` usabile con `monkeypatch`.

#### 3.6 Funzione unica di chiamata — `run_ai_json(db, user_id, feature, system_prompt, user_prompt, schema, images=None, cache_input=None) -> Optional[AIResult]`
1. `provider = get_provider(...)`; se `None` → return `None` (il chiamante usa l'euristica).
2. Se `images` e provider è cloud (`gemini`) e `allow_cloud_images == 0` → `AIProviderError("Invio immagini al cloud non autorizzato nelle impostazioni")`.
3. **Cache**: `cache_key = sha256(json.dumps({"feature","provider","model","prompt_version": PROMPT_VERSION, "input": cache_input or user_prompt}, sort_keys=True))`. Se esiste in `AICache` e più recente di `AI_CACHE_TTL_DAYS` → restituisci `AIResult` dalla cache (**non** conta nella quota).
4. **Quota giornaliera**: somma `AIUsage.requests` di oggi per l'utente; se `>= daily_request_cap` → `AIQuotaExceeded("Limite giornaliero AI raggiunto (configurabile in Impostazioni)")`.
5. Chiama `provider.generate_json`, poi upsert `AIUsage` (+1 request, token) e salva in `AICache`. `db.commit()`.
6. Definisci `PROMPT_VERSION = "9.0"` in testa al modulo.

### 4. Endpoint impostazioni AI (in `backend/app/api/v1/ai.py`)
- `GET /api/v1/ai/settings` → `{provider, model_text, model_vision, has_api_key, api_key_hint ("…" + ultime 4 cifre o null), api_key_from_env: bool, ollama_base_url, allow_cloud_images, daily_request_cap, usage_today: {requests, input_tokens, output_tokens}}`. **La chiave non viene mai restituita.**
- `PUT /api/v1/ai/settings` → body con tutti i campi opzionali; `api_key: ""` cancella la chiave; validazione `provider in {"none","gemini","ollama"}`, `1 <= daily_request_cap <= 5000`.
- `GET /api/v1/ai/models` → `provider.list_models()` (se provider `none` → `[]`).
- `POST /api/v1/ai/test` → chiamata minima `generate_json` con schema `{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}` e prompt `"Rispondi con {\"ok\": true}"`; risponde `{"ok": true, "provider", "model", "latency_ms"}` oppure `{"ok": false, "error": "..."}` (HTTP 200 in entrambi i casi, nessun stacktrace).

> ⚠️ Il backup DB (`GET /settings/backup/db`) includerà la chiave salvata in `ai_settings`. Nella UI Impostazioni indica: *"Per non salvare la chiave nel database puoi impostare la variabile d'ambiente `GEMINI_API_KEY`."*

### Verifica Task 9.2
`pytest` + `npm run build`.

---

## TASK 9.3 — FOLDER CLEANUP ADVISOR (REGOLE DI PULIZIA PER CARTELLE)

### Obiettivo
Invece di decidere file per file, individuare le **coppie di cartelle sullo stesso disco** che condividono molti duplicati esatti e proporre regole del tipo *"Tieni `2024/Estate_Puglia`, sposta in `.pmm_trash` le copie in `DCIM/100APPLE`"*, espandibili in una lista concreta di `file_id` da confermare.

### 1. Aggregazione locale — `backend/app/services/folder_advisor_service.py`
`compute_folder_pairs(db, user_id, source_id: Optional[str] = None, limit: int = 30) -> List[Dict]`:
- Carica tutte le copie attive (`availability_status not in ("missing","trashed")`) dei media dell'utente che hanno **≥ 2 copie attive sullo stesso `source_id`**.
- Per ogni `(media_id, source_id)` con copie in cartelle diverse, per ogni coppia non ordinata di cartelle `(dir_a, dir_b)` (`os.path.dirname(relative_path)`, `"."` se root) incrementa:
  - `shared_media_count`, `shared_bytes` (somma `size_bytes` di una copia).
- Arricchisci ogni cartella con: `total_active_files` (nella fonte), `path_score` (`score_path_quality(dir + "/x.jpg")[0]`).
- Ordina per `shared_bytes` desc, tronca a `limit`.
- Output item:
  ```python
  {"pair_id": "<sha1(source_id|dir_a|dir_b)[:12]>", "source_id", "source_name",
   "dir_a": {"path", "total_files", "path_score"}, "dir_b": {...},
   "shared_media_count", "shared_bytes"}
  ```

### 2. Regole euristiche (fallback sempre disponibile)
`heuristic_folder_rules(pairs) -> List[Dict]`: per ogni coppia, `keep_folder` = cartella con `path_score` più alto (pareggio → più file totali → percorso più corto), `trash_folder` = l'altra. `confidence = clamp(abs(score_a - score_b)/50, 0.3, 0.9)`; se `abs(score_a - score_b) < 5` → `confidence = 0.3` e `rationale = "Cartelle equivalenti: verifica manuale consigliata"`.

### 3. Regole AI (opzionali, 1 sola chiamata testo)
- `system_prompt` (italiano): sei un archivista fotografico; l'obiettivo è ridurre i duplicati **sullo stesso disco** mantenendo la copia nella cartella meglio organizzata; non inventare cartelle; usa solo i `pair_id` forniti; se incerto usa `confidence` bassa; mai suggerire di eliminare entrambe.
- `user_prompt`: JSON compatto delle coppie (solo `pair_id`, percorsi cartella, conteggi, `path_score`).
- Schema risposta:
  ```json
  {"type":"object","properties":{"rules":{"type":"array","items":{"type":"object","properties":{
     "pair_id":{"type":"string"},
     "keep_folder":{"type":"string"},
     "trash_folder":{"type":"string"},
     "rationale":{"type":"string"},
     "confidence":{"type":"number"}
   },"required":["pair_id","keep_folder","trash_folder","rationale","confidence"]}}},
   "required":["rules"]}
  ```
- **Validazione obbligatoria del risultato AI**: scarta le regole con `pair_id` sconosciuto, o con `{keep_folder, trash_folder}` diverso dall'insieme `{dir_a.path, dir_b.path}` della coppia. Clamp `confidence` in `0..1`. Le coppie senza regola valida ricevono la regola euristica.
- Ogni regola restituita ha `engine: "gemini" | "ollama" | "heuristic"`.

### 4. Espansione regola → file concreti
`expand_folder_rule(db, user_id, source_id, keep_folder, trash_folder) -> Dict`:
- Per ogni media con copia attiva in `trash_folder` **e** copia attiva in `keep_folder` sullo **stesso** `source_id`: proponi il trash della/e copia/e in `trash_folder` (mai di quelle in `keep_folder`).
- Media che hanno copie solo in `trash_folder` → **non toccati**.
- Escludi fonti offline (`root_path` assente o non esistente) → restituisci errore descrittivo.
- Output: `{"file_ids": [...], "keep_file_ids": [...], "count", "bytes", "sample": [prime 12 righe {file_id, filename, relative_path, size_bytes, media_id, has_thumbnail}]}`.

### 5. Endpoint (`backend/app/api/v1/ai.py`)
- `POST /api/v1/ai/folder-advisor/analyze` — body `{"source_id": Optional[str], "use_ai": bool = true}` → `{"engine_used", "ai_error": Optional[str], "pairs": [...], "rules": [...]}`. Se `use_ai` è true ma l'AI fallisce, `ai_error` contiene il motivo e `rules` sono euristiche.
- `POST /api/v1/ai/folder-advisor/preview` — body `{"source_id","keep_folder","trash_folder"}` → output di `expand_folder_rule`.
- **Nessun endpoint "apply" dedicato**: la UI conferma e chiama l'esistente `POST /api/v1/duplicates/trash` con `file_ids` e `keep_file_ids` della preview (il guardrail "mai orfanare un media" della Fase 8 resta attivo).

### Verifica Task 9.3
`pytest` + `npm run build`.

---

## TASK 9.4 — BEST SHOT PICKER PER FOTO SIMILI (dHash)

### 1. Servizio — `backend/app/services/best_shot_service.py`
`suggest_best_shot(db, user_id, media_ids: List[str], use_ai: bool) -> Dict`:
1. Verifica ownership e `2 <= len(media_ids) <= 8` (altrimenti `400`).
2. Calcola sempre il ranking euristico (`compute_image_quality` + `rank_similar_cluster`).
3. Se `use_ai` e provider configurato con `model_vision` (o `model_text` se è un modello multimodale come Gemini Flash):
   - Carica le miniature WebP da `settings.THUMBNAILS_DIR` (salta i media senza miniatura; se ne restano < 2 → solo euristica).
   - Invia le immagini **nell'ordine** dei `media_ids` con un prompt che le etichetta `Foto 1..N` e include per ciascuna `media_id`, risoluzione, `sharpness_norm` euristica.
   - `system_prompt` (italiano): scegli la foto migliore considerando nitidezza/messa a fuoco, occhi aperti, espressioni, composizione, orizzonte dritto, soggetti non tagliati; non scartare foto che mostrano **contenuti diversi** (es. persone diverse, inquadrature diverse): in quel caso mettile in `keep`.
   - Schema:
     ```json
     {"type":"object","properties":{
       "best_media_id":{"type":"string"},
       "keep_media_ids":{"type":"array","items":{"type":"string"}},
       "trash_media_ids":{"type":"array","items":{"type":"string"}},
       "reasons":{"type":"array","items":{"type":"object","properties":{
          "media_id":{"type":"string"},"reason":{"type":"string"}},"required":["media_id","reason"]}},
       "summary":{"type":"string"}
     },"required":["best_media_id","keep_media_ids","trash_media_ids","reasons","summary"]}
     ```
   - **Validazione**: tutti gli id devono appartenere a `media_ids`; `best_media_id ∈ keep_media_ids`; `keep ∩ trash = ∅`; media **preferiti** forzati in `keep`; id non menzionati → `keep`. Se la validazione fallisce → fallback euristico con `ai_error`.
4. Output: `{"engine", "ai_error", "best_media_id", "keep_media_ids", "trash_media_ids", "reasons": {media_id: str}, "summary", "heuristic_scores": {...}}`.

### 2. Endpoint
- `POST /api/v1/ai/similar/best-shot` — body `{"media_ids": [...], "use_ai": true}`.

### Verifica Task 9.4
`pytest` + `npm run build`.

---

## TASK 9.5 — TRASH DI MEDIA INTERI NEI CLUSTER SIMILI (CON GUARDRAIL DEDICATO)

### Perché serve
Le foto simili sono **media diversi** (SHA-256 diversi). Il guardrail della Fase 8 ("mai orfanare un media") impedisce giustamente di cestinare tutte le copie di un media tramite `/duplicates/trash`. Per scartare uno scatto mosso di una raffica serve quindi un'azione **esplicita e separata**, sempre verso `.pmm_trash`.

### 1. Servizio — aggiungi in `backend/app/services/trash_service.py`
`trash_similar_media(db, user_id, keep_media_id: str, trash_media_ids: List[str], max_distance: int = 10) -> Dict`:
- **Guardrail**:
  1. `keep_media_id` appartiene all'utente e ha **≥ 1 copia attiva**; `keep_media_id not in trash_media_ids`.
  2. Ogni media in `trash_media_ids` appartiene all'utente, ha `dhash` non nullo, e `hamming_distance(dhash, keep.dhash) <= max_distance` (deve essere davvero simile allo scatto conservato); altrimenti `400`.
  3. Nessun media in `trash_media_ids` è **preferito** (`is_favorite == 1`) → `400` con messaggio chiaro.
  4. **Tutte** le copie attive di ciascun media da cestinare devono stare su fonti online (`root_path` esistente). Se anche una sola è offline → `400` per quel media (no cestinamento parziale: una copia resterebbe sul disco scollegato e il catalogo sarebbe incoerente).
  5. Se il media da cestinare è una Live Photo (`live_video_media_id` valorizzato), includi anche il media video collegato **solo se** quel video non è collegato ad altre foto e rispetta le stesse condizioni; altrimenti lascialo intatto.
- Esecuzione: riusa la logica di spostamento esistente (estrai in funzione interna `_move_file_to_trash(db, file_obj, source, media)` il blocco già presente in `trash_duplicate_files`, **senza cambiarne il comportamento**), applicandola a tutte le copie attive dei media da cestinare. Scrivi nel `manifest.jsonl` `"action": "trash_similar"` con `kept_media_id`.
- Il ripristino funziona con l'esistente `POST /duplicates/trash/restore` (file per file).

### 2. Endpoint
- `POST /api/v1/duplicates/trash-similar` — body `{"keep_media_id","trash_media_ids","max_distance": 10}`.

### Verifica Task 9.5
`pytest` + `npm run build` (tutti i test della Fase 8 devono continuare a passare invariati).

---

## TASK 9.6 — SMART ALBUM SUGGESTER (EVENTI PER DATA + LUOGO)

### 1. Clustering locale — `backend/app/services/smart_album_service.py`
`detect_events(db, user_id, min_media: int = 15, gap_hours: int = 36) -> List[Dict]`:
- Media dell'utente con `captured_at` non nullo, ordinati per data, esclusi i `.mov` secondari delle Live Photo (`live_video_media_id` di altri media) e i media senza copie attive.
- Nuovo evento quando il gap tra due media consecutivi supera `gap_hours`.
- Scarta eventi con `< min_media`.
- Per ogni evento: `event_id = sha1(first_media_id|last_media_id)[:12]`, `start`, `end`, `media_count`, `top_places` (top 3 `place_name` con conteggi), `top_folders` (top 3 nomi dell'ultima cartella di `relative_path`), `cover_media_id` (primo con miniatura), `media_ids`.
- Escludi eventi già coperti da un album esistente dell'utente (≥ 80% dei `media_ids` già in uno stesso `Album`).

### 2. Nomi suggeriti
- Euristica: `"{place_principale} — {Mese Anno}"` (es. `"Siracusa — Agosto 2025"`), o `"Evento del {gg Mese Anno}"` se senza luogo; tag suggeriti = città principale in minuscolo senza spazi.
- AI (opzionale, **1 chiamata** per tutti gli eventi, solo testo, massimo 40 eventi): input = `event_id`, date, luoghi, cartelle, conteggi (**nessuna immagine**). Schema `{"albums":[{"event_id","name","description","tags":[string]}]}`. Validazione: `event_id` noti, `name` 3..80 caratteri, max 5 tag da 2..30 caratteri; mancanti → nome euristico.

### 3. Endpoint
- `POST /api/v1/ai/smart-albums/suggest` — body `{"use_ai": true, "min_media": 15}` → `{"engine","ai_error","events":[{...evento, "suggested_name","suggested_description","suggested_tags"}]}`. **Non** restituire `media_ids` completi nella risposta (solo conteggio): la creazione li ricalcola.
- `POST /api/v1/ai/smart-albums/create` — body `{"event_id","name","description","tags":[...]}`:
  - Ricalcola `detect_events`, trova l'evento per `event_id` (`404` se non più valido), crea l'`Album`, aggiunge tutti i media (`AlbumMedia`), crea/riusa i `Tag` per nome e li associa (`MediaTag`, idempotente). Restituisce `{"album_id","added_count","tags_applied"}`.

### Verifica Task 9.6
`pytest` + `npm run build`.

---

## TASK 9.7 — INTERFACCIA UTENTE

### 1. Client API (`frontend/src/services/api.ts`)
Aggiungi i metodi: `getAISettings`, `updateAISettings`, `getAIModels`, `testAI`, `suggestKeepCopies(mediaIds, preferredSourceId?)`, `analyzeFolderAdvisor(sourceId?, useAi)`, `previewFolderRule(sourceId, keepFolder, trashFolder)`, `suggestBestShot(mediaIds, useAi)`, `trashSimilarMedia(keepMediaId, trashMediaIds, maxDistance?)`, `suggestSmartAlbums(useAi, minMedia?)`, `createSmartAlbum(payload)`.

### 2. Impostazioni → nuova card "Assistente AI" (`SettingsView.tsx`)
- Selettore provider: **Nessuno (solo euristica locale)** / **Google Gemini (gratuito con API key di AI Studio)** / **Ollama (locale, offline)**.
- Gemini: campo API key (input `password`, mostra `api_key_hint` se già salvata, pulsante "Rimuovi chiave"), link testuale ad AI Studio, badge "Chiave da variabile d'ambiente" se `api_key_from_env`.
- Ollama: campo URL.
- Pulsante **"Carica modelli disponibili"** (`/ai/models`) → select per `model_text` e `model_vision`.
- Toggle **"Consenti invio miniature al cloud (Best Shot)"** con l'avviso privacy del §0.
- Campo `daily_request_cap` + contatore "Richieste AI oggi: X / cap".
- Pulsante **"Test connessione"** → toast con esito e latenza.

### 3. `DuplicatesView.tsx` — integrazioni
**a) Tab "Doppioni Stesso Disco"**: nuovo pulsante **"🧠 Suggerisci copie da tenere (euristica)"** che chiama `suggestKeepCopies` per i gruppi caricati e:
- popola `selectedForTrash` con i `trash_file_ids` restituiti (stesso stato già usato dalla Fase 8);
- mostra accanto a ogni copia una pillola con `score` e il `reason` (tooltip) e, sulla copia conservata, il badge **"Suggerita"**.
- La conferma finale usa la barra flottante / modale esistente della Fase 8.

**b) Nuovo tab "🧠 Consulente Cartelle"** (`DuplicateTab` += `'folder_advisor'`):
- Selettore fonte (opzionale) + toggle "Usa AI" (disabilitato con tooltip se provider `none`) + pulsante "Analizza".
- Lista regole: `Tieni 📁 keep_folder` → `Sposta in .pmm_trash 📁 trash_folder`, conteggio, MB, `confidence` (barra), `rationale`, badge `engine` (AI/Euristica). Pulsante **"⇄ Inverti"** (scambia keep/trash) e **"Anteprima"** (`previewFolderRule`) che mostra il sample con miniature.
- Pulsante **"Sposta {count} copie in .pmm_trash"** → modale di conferma (stesso testo rassicurante della Fase 8) → `trashDuplicateFiles(file_ids, keep_file_ids)` → toast + ricarica summary e regole.
- Se `ai_error` è presente: banner informativo giallo "AI non disponibile: {ai_error}. Mostro suggerimenti euristici."

**c) Tab "Foto Simili (dHash)"**: su ogni cluster pulsante **"✨ Scegli lo scatto migliore"** (`suggestBestShot` con `useAi` se provider attivo):
- Evidenzia il best con bordo verde e badge "Migliore", gli scatti proposti per lo scarto con bordo rosso tratteggiato, motivazioni sotto ogni miniatura, `summary` in alto.
- L'utente può cambiare manualmente la scelta (click su una miniatura = diventa la migliore; toggle "scarta / tieni" sulle altre).
- Pulsante **"Sposta scarti in .pmm_trash"** → modale che specifica: *"Verranno spostate nel cestino del disco **tutte le copie** degli scatti scartati. Lo scatto migliore resta intatto. Operazione reversibile dal tab Cestino."* → `trashSimilarMedia`.

### 4. Nuova sezione "✨ Album Suggeriti" (`AlbumsView.tsx`)
- In alto nella vista Album & Tag: pulsante "Trova eventi" → lista card (copertina, date, luoghi, conteggio, nome e tag **modificabili** inline, badge engine) con pulsante **"Crea album"** → `createSmartAlbum` → toast e refresh album.

### Verifica Task 9.7
`pytest` + `npm run build`.

---

## TASK 9.8 — SUITE DI TEST (`backend/app/tests/test_phase_9_ai_advisor.py`)

Usa solo fixture isolate (`client`, `auth_headers`, `db`, `tmp_path`, `monkeypatch`) e `FakeProvider` tramite `set_provider_override`. **Nessuna chiamata di rete.**

1. **`test_path_quality_scoring`**: `2024/Estate_Puglia/IMG_1.jpg` ha punteggio > `Downloads/IMG_1 (1).jpg`; `WhatsApp Images/x.jpg` < `Famiglia/Natale-2023/x.jpg`; motivi non vuoti.
2. **`test_suggest_keep_keeps_one_per_disk_and_never_all`**: media con 2 copie su disco A (`DCIM/100APPLE/a.jpg`, `2024/Viaggio_Roma/a.jpg`) + 1 copia su disco B. Atteso: `keep` = copia `2024/Viaggio_Roma` su A **e** la copia su B; `trash` = solo `DCIM/100APPLE/a.jpg`.
3. **`test_ai_settings_never_expose_api_key`**: `PUT /ai/settings` con chiave `"AIzaTEST1234"` → `GET` restituisce `has_api_key: true`, `api_key_hint` che termina con `"1234"`, e la stringa completa non compare nel JSON.
4. **`test_ai_quota_and_cache`**: `daily_request_cap = 1`, `FakeProvider`; prima chiamata ok (usage = 1); seconda chiamata **identica** servita dalla cache (usage resta 1); terza chiamata con input diverso → risposta con fallback euristico e `ai_error` che menziona il limite giornaliero.
5. **`test_folder_advisor_rules_validation_and_expansion`**: dati con 3 media duplicati tra `DCIM/100APPLE` e `2024/Estate` sulla stessa fonte reale (`tmp_path`) + 1 media presente **solo** in `DCIM/100APPLE`. `FakeProvider` restituisce una regola valida e una con `pair_id` inventato. Atteso: la regola inventata è scartata; `preview` restituisce 3 `file_ids` tutti in `DCIM/100APPLE`; il media presente solo in `DCIM` **non** è incluso; applicando `POST /duplicates/trash` i file finiscono in `.pmm_trash` e le copie in `2024/Estate` restano.
6. **`test_folder_advisor_falls_back_to_heuristic_on_provider_error`**: `FakeProvider` che solleva `AIProviderError` → risposta 200 con `engine_used == "heuristic"` e `ai_error` valorizzato.
7. **`test_best_shot_validation_and_favorite_protection`**: cluster di 3 media con miniature reali (immagine nitida vs sfocata generate con Pillow `GaussianBlur`). Senza AI il best euristico è quella nitida. Con `FakeProvider` che propone di scartare un media preferito → il preferito finisce in `keep`.
8. **`test_trash_similar_guardrails`**: rifiuto (`400`) se `keep_media_id` in `trash_media_ids`, se il media da scartare è preferito, se il `dhash` è troppo distante, se una copia è su fonte offline; caso valido → tutte le copie del media scartato in `.pmm_trash`, il best intatto, e `POST /duplicates/trash/restore` le riporta al percorso originale.
9. **`test_smart_album_detection_and_creation`**: 20 media in 3 giorni a "Siracusa" + 20 media un mese dopo a "Milano" (gap > 36h) → 2 eventi; `create` crea album con 20 media e tag; una seconda `suggest` non ripropone l'evento già coperto.

---

## CRITERI DI ACCETTAZIONE FINALI

- [ ] `backend/venv/bin/pytest`: 100% pass (test esistenti + `test_phase_9_ai_advisor.py`), nessuna chiamata di rete, DB reale intatto.
- [ ] `cd frontend && npm run build`: 0 errori.
- [ ] Con provider **Nessuno** tutte le funzioni (suggerimento copie, consulente cartelle, best shot, album suggeriti) funzionano in modalità euristica.
- [ ] Nessun endpoint AI sposta file; ogni spostamento passa da conferma utente e finisce in `.pmm_trash` (reversibile).
- [ ] La chiave API non viene mai restituita dalle API né scritta nei log; le immagini vanno al cloud solo con consenso esplicito.
- [ ] Quota giornaliera e cache attive; con quota esaurita o errore AI la UI mostra il fallback euristico senza bloccarsi.
