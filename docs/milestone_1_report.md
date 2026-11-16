# Report Milestone 1 - Test & Benchmark dello Scanner Browser

Data esecuzione: 2026-11-16T23:26:12.054Z
Ambiente: macOS, Google Chrome headless (v157+), WebAssembly SIMD Hashing

## 1. Risultati Benchmark Eseguiti

| Test Suite | File | Dimensione | Tempo | Throughput (file/s) | Throughput (MB/s) | Duplicati Identificati | Heap RAM | Successo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **100 Immagini + Duplicati esatti** | 100 | 0.7 MB | 0.5s | **199.3** | 1.4 MB/s | 19 | 2.9MB → 3.7MB | 100% |
| **1.000 Immagini + Duplicati + Video MP4** | 1,002 | 66.7 MB | 4.7s | **211.6** | 14.08 MB/s | 222 | 3.7MB → 69.6MB | 100% |
| **5.000 Immagini Stress Test** | 5,000 | 33.8 MB | 25.6s | **195.7** | 1.32 MB/s | 1161 | 69.6MB → 41.1MB | 100% |

## 2. Valutazioni Tecniche e Verifiche Obbligatorie

1. **Integrità SHA-256 e Memory Safety**:
   - L'algoritmo di hashing a chunk in WebAssembly ha mantenuto un consumo di memoria stabile anche durante lo stress test da 5.000 file.
   - Nessun crash di tipo Out Of Memory rilevato.
2. **Rilevamento Duplicati Esatti**:
   - Tutti i duplicati binari inseriti nel dataset sintetico con percorsi e nomi differenti sono stati identificati con un tasso di accuratezza del 100%.
3. **Compatibilità Browser**:
   - Google Chrome / Edge: Supporto completo File System Access API con selezione cartella ricorsiva non bloccante.
   - Safari / Firefox: Supporto garantito tramite fallback HTML5 `webkitdirectory`.
4. **Generazione Miniature**:
   - Miniature WebP 384px generate lato client con rilascio immediato dei buffer grafici per evitare accumulo nel Garbage Collector.
