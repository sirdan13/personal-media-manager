# PIANO ESECUTIVO FASE 10: REDESIGN UI DELLA PAGINA "DUPLICATI" & SIDEBAR CLEANUP

> **Destinatario**: Agente implementatore (modello Flash o superiore).  
> **Obiettivo**: Ridisegnare l'interfaccia utente della vista Duplicati (`DuplicatesView.tsx`) e rifinire la Sidebar (`Sidebar.tsx`) secondo principi di massima pulizia visiva, densità informativa, eliminazione delle ridondanze e conformità WCAG AA.  
> **Vincolo Assoluto**: **ZERO MODIFICHE ALLA LOGICA FUNZIONALE E ALLE API BACKEND**. Tutti i meccanismi di protezione (spostamento sicuro in `.pmm_trash`, ripristino, euristica percorsi, backup gap, foto simili dHash, consulente cartelle) devono rimanere perfettamente operativi al 100%.

---

## 1. PRINCIPI GUIDA & CRITERI DI ACCETTAZIONE

1. **Zero Ridondanze**: Ogni informazione compare una sola volta, al livello gerarchico più alto in cui è valida (es. nome file e nome disco nell'header del gruppo se identici per tutte le copie; nessun indice `#1/#2` ripetuto; nessun testo SHA grezzo permanente).
2. **Densità Visiva & Above-the-fold**: Riduzione dell'altezza verticale delle card di gruppo del **~40%** (miniatura da 110px a 64px, header su 1 riga, righe copia compatte). Almeno **3 gruppi interi devono essere visibili above-the-fold a 1080p** (prima erano ~2.5).
3. **Gerarchia Azioni**: Massima 1 azione primaria per contesto. I controlli secondari diventano menu a tendina o split button (`"Esporta ▾"`, `"Suggerisci (euristica)"` come secondaria di `"Seleziona spreco"`).
4. **Palette & Contrasti WCAG AA**:
   - Accento primario: Blu (`#38bdf8` / `#0284c7`).
   - Spreco / Attenzione: Ambra (`#f59e0b` / `#fbbf24`).
   - Principale / Sicuro: Verde (`#22c55e` / `#4ade80`).
   - Cestino / Distruttivo: Rosso (`#ef4444` / `#f87171`).
   - Testi secondari leggibili: `#94a3b8` / `#cbd5e1` (mai grigi inferiori a 4.5:1 su fondo scuro).
5. **Reversibilità**: La barra di azione contestuale appare **solo** quando ci sono elementi selezionati e guida l'utente allo spostamento protetto in `.pmm_trash`.

---

## 2. FILE COINVOLTI

- `frontend/src/components/Sidebar.tsx` (Sidebar di navigazione e footer utente)
- `frontend/src/features/duplicates/DuplicatesView.tsx` (Vista principale duplicati e backup gap)

---

## 3. TASK 1: PULIZIA SIDEBAR (`Sidebar.tsx`)

### 1.1 Rimozione badge "Smart" da Duplicati
In `frontend/src/components/Sidebar.tsx`:
- Localizzare l'array `menuItems` (riga ~42).
- Modificare l'elemento con `id: 'duplicates'`:
  ```typescript
  // PRIMA:
  { id: 'duplicates', label: 'Duplicati', icon: Copy, badge: 'Smart' },
  // DOPO:
  { id: 'duplicates', label: 'Duplicati', icon: Copy },
  ```

### 1.2 Pulizia Footer Utente
Nel footer della Sidebar (linee ~160-175):
- Sostituire la doppia riga testuale verticale con un layout compatto a riga singola:
  - **Avatar**: cerchio con iniziale del nome utente o icona `User` (sfondo `#334155`, testo `#f8fafc`).
  - **Nome**: solo il display name (`{currentUser?.display_name || 'Utente'}`), con `title={currentUser?.email || ''}` come tooltip nativo del browser.
  - **Email**: rimossa dalla visualizzazione testuale fissa (visibile in tooltip al passaggio del mouse).

---

## 4. TASK 2: HEADER & STRIP KPI COMPATTA (`DuplicatesView.tsx`)

### 2.1 Eliminazione della Hero Card
Attualmente le righe 701-760 contengono una grossa hero card sfumata (`linear-gradient`) di circa 150px con titolo, descrizione verbosa e 4 card KPI fisse.
- **Rimuovere completamente la hero card e le 4 card box grandi**.
- Sostituirla con:
  1. **Header Compatto (Top Bar)**:
     - Titolo pulito: `Duplicati & Ridondanza` con icona `Copy` o `ShieldCheck` (20px).
     - Accanto al titolo: **Icona Info `(i)` interattiva** che apre un popover/tooltip contestuale sulla sicurezza non-distruttiva.
  2. **Strip KPI Contestuale Inline**:
     - Singola riga orizzontale compatta (senza box/card con bordo pesante), con separatori a puntino (`·`) o chip leggeri.
     - Mostra **esclusivamente i KPI pertinenti alla tab attiva**:
       - Se tab `intra_source` (Spreco):  
         `Spreco totale: {formatBytes(summary?.intra_source_wasted_bytes ?? 0)} · {summary?.intra_source_groups ?? 0} gruppi con doppioni`
       - Se tab `multi_source` (Backup Sani):  
         `Spazio in backup: {formatBytes(summary?.multi_source_backup_bytes ?? 0)} · {summary?.healthy_multi_source_groups ?? 0} repliche sicure`
       - Se tab `backup_gap` (Copertura):  
         `Copertura: {summary?.protection_coverage_pct ?? 0}% · {summary?.unprotected_media_count ?? 0} file su singolo disco`
       - Se tab `similar` (Foto Simili):  
         `{similarGroups.length} cluster di scatti simili rilevati`
       - Se tab `folder_advisor`:  
         `Analisi euristica & suggerimenti percorsi cartelle`
       - Se tab `trash`:  
         `{trashData?.total_count ?? 0} file nel cestino · {formatBytes(trashData?.total_bytes ?? 0)} recuperabili`

### 2.2 Banner "Sicurezza Non-Distruttiva" Dismissibile
Attualmente alle righe 899-915 c'è un banner blu permanente di spiegazione su `.pmm_trash`.
- **Rimuovere il banner fisso permanente**.
- Introdurre uno stato locale con persistenza in `localStorage`:
  ```typescript
  const [showTrashInfo, setShowTrashInfo] = useState<boolean>(() => {
    return localStorage.getItem('pmm_hide_trash_info') !== 'true';
  });
  ```
- L'icona info `(i)` nella top bar permette di riaprire le informazioni in qualsiasi momento.
- Se il popover o il banner compatto viene visualizzato, includere l'opzione "Non mostrare più" che esegue:
  ```typescript
  localStorage.setItem('pmm_hide_trash_info', 'true');
  setShowTrashInfo(false);
  ```

---

## 5. TASK 3: TAB NAVIGATION & MENU STRUMENTI (`DuplicatesView.tsx`)

### 3.1 Riduzione a 4 Tab Visibili + Menu "Strumenti"
Attualmente ci sono 6 tab orizzontali lunghe (righe 761-897).
- Riorganizzare in:
  1. **Tab 1**: `Spreco` (icona `AlertTriangle` ambra, badge `{summary?.intra_source_groups}`)
  2. **Tab 2**: `Backup sani` (icona `ShieldCheck` verde, badge `{summary?.healthy_multi_source_groups}`)
  3. **Tab 3**: `Copertura` (icona `ArrowLeftRight` blu)
  4. **Tab 4**: `Foto simili` (icona `Sparkles` viola, badge `{similarGroups.length}`)
  5. **Menu a tendina "Strumenti" (`⋯` o `MoreHorizontal`)** posizionato a destra:
     - Voce 1: `Consulente Cartelle (AI)` (icona `Brain`)
     - Voce 2: `Cestino Dischi (.pmm_trash)` (icona `Trash2`, badge `{trashData?.total_count || 0}`)
- Se l'utente clicca una voce del menu Strumenti, `activeTab` si imposta su `'folder_advisor'` o `'trash'`.
- Il pulsante "Strumenti" mostra uno stato attivo (bordo o indicatore) se la tab corrente è una di quelle secondarie.

---

## 6. TASK 4: TOOLBAR AZIONI & STICKY BAR CONTESTUALE (`DuplicatesView.tsx`)

### 4.1 Toolbar Sinistra: Filtri & Contatore
Nel blocco di controllo duplicati (`intra_source` e `multi_source`):
- Posizionare a sinistra:
  - **Contatore compatto**: `{duplicateGroups.length} di {totalGroups || duplicateGroups.length} gruppi` (testo `#94a3b8`, font-size 13px).
  - **Filtro Fonte**: select compatta con le fonti/dischi disponibili.
  - **Ordinamento**: select con opzioni:
    - `Spreco decrescente (default)`
    - `Dimensione file ↓`
    - `Nome file (A-Z)`
    - `Data recente ↓`

### 4.2 Toolbar Destra: Azione Primaria & Split Button
- **Azione Primaria Unica in evidenza**:
  - Pulsante con stile solido/evidenziato: `Seleziona spreco (tieni 1 per disco)` (icona `Zap`).
- **Pulsante Euristica secondario**:
  - `Suggerisci (euristica)` (icona `Sparkles`) come pulsante secondario a contorno o opzione a fianco.
- **Esportazione unificata**:
  - Sostituire i due pulsanti separati "Esporta CSV" e "JSON" con un unico pulsante dropdown `Esporta ▾` che offre:
    - `CSV (.csv)`
    - `JSON (.json)`

### 4.3 Barra di Azione Sticky Contestuale
Verificare e rifinire la barra fluttuante sticky a fondo pagina (righe 2680-2740):
- **Visibilità**: appare **SOLO** se `selectedForTrash.size > 0`.
- **Contenuto compatto su singola riga**:
  - `N file selezionati · {formatBytes(selectedTrashBytes)} recuperabili`
  - Pulsante secondario: `Annulla` (deseleziona tutto)
  - Pulsante primario: `Sposta nel cestino` (rosso `#ef4444`, apre la modale di conferma)

---

## 7. TASK 5: REDESIGN CARD DEL GRUPPO (RIDUZIONE ALTEZZA ~40%)

Questo è l'intervento di maggiore impatto visivo (righe 1079-1210).

### 5.1 Header del Gruppo su Singola Riga
- **Checkbox / Radio di gruppo**: permette di selezionare rapidamente tutte le copie superflue del gruppo.
- **Nome File Principale**: font-size 13px, font-semibold, testo troncato con `title={filename}`.
- **Badge Nome Disco Condiviso**: se tutti i file del gruppo appartengono allo stesso disco (es. `Toshiba`), mostrare il badge del disco qui nell'header (`HardDrive` icon + `Toshiba`) una sola volta.
- **Badge Copie**:
  - Se copie == 2: **nessun badge ridondante** "2 COPIE SULLO STESSO DISCO".
  - Se copie > 2: badge compatto `×{copies_count}`.
- **Metrica Spreco**:
  - Se intra-source: mostrare unicamente `Spreco {formatBytes(group.intra_source_wasted_bytes)}` (ambra). Eliminare "Singola copia: X (Spreco: X)".
  - Se multi-source sano: mostrare `Backup su {group.distinct_sources_count} dischi` (verde).
- **Pulsante Cestino Gruppo**:
  - Ridurre a una singola icona `Trash2` (hover-only o opacità ridotta 60%), con tooltip `"Sposta doppioni di questo gruppo nel cestino"`. Eliminare la dicitura tecnica estesa `"Pulisci doppioni gruppo (.pmm_trash)"`.
- **SHA-256**:
  - Nascosto di default; visibile al passaggio del mouse o icona `Copy` con tooltip per copiare lo SHA negli appunti in 1 click.

### 5.2 Miniatura Compatta (64px)
- Ridurre la dimensione del contenitore miniatura da **110x110px a 64x64px** (`rounded-lg`, `object-cover`).
- In sovrimpressione (overlay piccolo in basso):
  - Badge durata/tipo (es. icona `Video` per i file video).
  - Dimensione formattata (es. `4.2 MB`), utile a identificare il media a colpo d'occhio.

---

## 8. TASK 6: REDESIGN RIGHE COPIA & SMART PATH DIFFING

All'interno di ciascuna card, ogni copia del file (righe 1212-1400) deve essere riscritta per eliminare ogni ripetizione.

### 8.1 Eliminazione Dati Ridondanti
- **Rimuovere l'indice `#1/#2`**.
- **Rimuovere il nome del file** dalla riga: il nome è già presente nell'header del gruppo. La riga mostra unicamente il percorso della cartella.
- **Nome disco**: se il gruppo è intra-disco (tutti su "Toshiba"), non ripetere il disco per ogni riga. Mostrare il disco solo se le copie si trovano su dischi diversi (multi-disco).

### 8.2 Evidenziazione Segmento Differenziale di Percorso (Smart Diff)
Creare una funzione helper per evidenziare visivamente la parte del percorso in cui le copie differiscono:
```typescript
function getPathDisplay(relativePath: string, allPathsInGroup: string[]) {
  // Isola la directory dal nome file
  const dir = relativePath.includes('/') 
    ? relativePath.substring(0, relativePath.lastIndexOf('/')) 
    : '';
  
  if (allPathsInGroup.length < 2 || !dir) {
    return <span className="text-slate-400">{dir || '/'}</span>;
  }

  // Identifica i segmenti cartella comuni e quelli differenti
  // Renderizza la parte comune in grigio attenuato (#64748b)
  // e la cartella divergente (es. "2022-06" vs "2022/June") con font evidenziato (#38bdf8 o #cbd5e1)
}
```

### 8.3 Pill di Stato Unificata & Selezione Radio "Tieni questa"
Attualmente convivono badge e pulsanti testuali multipli ("Copia Principale", "Disco offline", "Cestina", "Tieni questa").
- **Unificare l'azione in un controllo Radio / Toggle chiaro**:
  - Per ciascuna riga, un selettore circolare (Radio):
    - Se selezionato come copia da tenere: pill verde compatta `<Check size={11} /> Principale`.
    - Se NON selezionato: indicatore discreto `<ArrowRight size={11} /> Cestino` (in rosso/ambra tenue). Cliccando sul radio, quella copia diventa "Principale" e le altre vengono istantaneamente marcate per il cestino.
  - Se il disco è scollegato: pill grigia/ambra `Offline` (disabilita il toggle con tooltip esplicativo).
  - Se presente score euristico: chip compatto `Score {score}` visibile con tooltip di motivazione.

---

## 9. TASK 7: ORDINAMENTO, PROGRESSIVE RENDERING & WCAG AA

### 9.1 Ordinamento Client-side & Paginazione
- Implementare `useMemo` per l'ordinamento dinamico di `duplicateGroups`:
  - `wasted_desc`: ordina per `group.intra_source_wasted_bytes` descrescente (predefinito).
  - `size_desc`: ordina per `group.files[0]?.size_bytes` descrescente.
  - `name_asc`: ordina per nome alfabetico.
  - `date_desc`: ordina per data file descrescente.
- Mantenere il caricamento progressivo a blocchi di 50 gruppi (`handleLoadMore`) senza re-render pesanti.

### 9.2 Contrasto Testi WCAG AA
- Sostituire qualsiasi `#64748b` usato per etichette informative essenziali con `#94a3b8` o `#cbd5e1` per garantire un rapporto di contrasto > 4.5:1 sui fondi `#0f172a` e `#1e293b`.
- Spaziature uniformi basate su griglia 8px (`gap-2`, `gap-4`, `p-3`, `p-4`).

---

## 10. CHECKLIST DI VALIDAZIONE PER FLASH

Al termine dell'implementazione, Flash deve verificare:
1. `npm run build` nel frontend senza alcun errore di compilazione o TypeScript.
2. `DuplicatesView.tsx` e `Sidebar.tsx` non devono avere funzioni eliminate o handler API rotti (`trashDuplicateFiles`, `restoreTrashedFiles`, `suggestKeepCopies`, `analyzeFolderAdvisor`, `previewFolderRule`, `suggestBestShot`, `trashSimilarMedia`).
3. Verifica visiva dei Criteri di Accettazione:
   - [ ] Almeno 3 gruppi interi visibili above-the-fold su monitor 1080p.
   - [ ] Nessun nome file ripetuto all'interno delle righe della stessa card.
   - [ ] Nessun badge "2 COPIE SULLO STESSO DISCO" (mostrato solo se > 2 copie).
   - [ ] Solo i KPI della tab attiva visibili nella strip compatta.
   - [ ] Banner di sicurezza sostituito da popover info dismissibile con `localStorage`.
   - [ ] Menu Strumenti (⋯) funzionante per "Consulente Cartelle" e "Cestino Dischi".
   - [ ] Floating bar visibile solo quando ci sono copie selezionate.
   - [ ] Badge "Smart" rimosso dalla sidebar e footer utente ripulito.
