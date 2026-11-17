import { computeFileSHA256 } from './chunkHasher';
import { DiscoveredFileItem } from './directoryTraverser';
import { detectMediaType, getFileExtension, inferMimeType } from './formatDetector';
import { extractMediaMetadata } from './metadataExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { ScanError, ScannedFile, ScanProgress } from './types';

export interface ScannerEngineOptions {
  concurrency?: number;
  generateThumbnails?: boolean;
  fingerprints?: Record<string, { size_bytes: number; sha256: string; has_thumbnail?: boolean }>;
  onProgress?: (progress: ScanProgress) => void;
  onFileScanned?: (file: ScannedFile) => void;
  onError?: (error: ScanError) => void;
}

export class ScannerEngine {
  private abortController: AbortController | null = null;
  private isPaused = false;
  private seenHashes = new Map<string, string>(); // sha256 -> relativePath
  private stats: ScanProgress = {
    totalDiscovered: 0,
    processed: 0,
    failed: 0,
    duplicatesFound: 0,
    bytesProcessed: 0,
    totalBytesDiscovered: 0,
    startTime: 0,
    elapsedSeconds: 0,
    filesPerSecond: 0,
    mbPerSecond: 0,
    status: 'idle'
  };

  private options: ScannerEngineOptions;

  constructor(options: ScannerEngineOptions = {}) {
    this.options = {
      concurrency: options.concurrency || 3,
      generateThumbnails: options.generateThumbnails ?? true,
      ...options
    };
  }

  public abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.stats.status = 'idle';
    this.notifyProgress();
  }

  public pause() {
    this.isPaused = true;
    this.stats.status = 'paused';
    this.notifyProgress();
  }

  public resume() {
    this.isPaused = false;
    this.stats.status = 'scanning';
    this.notifyProgress();
  }

  public getStats(): ScanProgress {
    return { ...this.stats };
  }

  /**
   * Main scan execution pipeline from an iterable or generator of files.
   */
  public async scan(
    filesSource: AsyncIterable<DiscoveredFileItem> | Iterable<DiscoveredFileItem>
  ): Promise<{ files: ScannedFile[]; stats: ScanProgress; errors: ScanError[] }> {
    this.abortController = new AbortController();
    this.isPaused = false;
    this.seenHashes.clear();

    const startTime = performance.now();
    this.stats = {
      totalDiscovered: 0,
      processed: 0,
      failed: 0,
      duplicatesFound: 0,
      bytesProcessed: 0,
      totalBytesDiscovered: 0,
      startTime,
      elapsedSeconds: 0,
      filesPerSecond: 0,
      mbPerSecond: 0,
      status: 'scanning'
    };

    const scannedFiles: ScannedFile[] = [];
    const scanErrors: ScanError[] = [];

    // Worker queue with controlled concurrency
    const queue: DiscoveredFileItem[] = [];
    let activeWorkers = 0;
    let streamFinished = false;

    return new Promise((resolve) => {
      const processNext = async () => {
        if (this.abortController?.signal.aborted) {
          resolve({ files: scannedFiles, stats: this.stats, errors: scanErrors });
          return;
        }

        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 200));
          if (this.abortController?.signal.aborted) {
            resolve({ files: scannedFiles, stats: this.stats, errors: scanErrors });
            return;
          }
        }

        if (queue.length === 0) {
          if (streamFinished && activeWorkers === 0) {
            this.stats.status = 'completed';
            this.stats.elapsedSeconds = Math.round((performance.now() - startTime) / 1000 * 10) / 10;
            this.notifyProgress();
            resolve({ files: scannedFiles, stats: this.stats, errors: scanErrors });
          }
          return;
        }

        const item = queue.shift()!;
        activeWorkers++;
        this.stats.currentFile = item.relativePath;

        try {
          const result = await this.processSingleFile(item);
          scannedFiles.push(result);
          this.stats.processed++;
          this.stats.bytesProcessed += item.file.size;

          if (result.isDuplicateOf) {
            this.stats.duplicatesFound++;
          }

          if (this.options.onFileScanned) {
            this.options.onFileScanned(result);
          }
        } catch (err) {
          this.stats.failed++;
          const scanError: ScanError = {
            path: item.relativePath,
            filename: item.file.name,
            error: (err as Error).message || 'Unknown processing error',
            phase: 'hashing',
            timestamp: new Date().toISOString()
          };
          scanErrors.push(scanError);
          if (this.options.onError) {
            this.options.onError(scanError);
          }
        } finally {
          activeWorkers--;
          this.updateMetrics(startTime);
          this.notifyProgress();
          // Dispatch next task in queue
          processNext();
        }
      };

      // Ingestion runner that fills the queue from the iterator
      (async () => {
        try {
          for await (const item of filesSource) {
            if (this.abortController?.signal.aborted) break;

            this.stats.totalDiscovered++;
            this.stats.totalBytesDiscovered += item.file.size;
            queue.push(item);
            this.notifyProgress();

            // Start workers up to concurrency limit
            if (activeWorkers < (this.options.concurrency || 3)) {
              processNext();
            }

            // Yield event loop periodically so browser UI remains smooth
            if (this.stats.totalDiscovered % 50 === 0) {
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        } catch (err) {
          console.error('Error during directory traversal:', err);
        } finally {
          streamFinished = true;
          // Trigger any idle workers to finish the remaining queue
          while (activeWorkers < (this.options.concurrency || 3) && queue.length > 0) {
            processNext();
          }
          if (queue.length === 0 && activeWorkers === 0) {
            this.stats.status = 'completed';
            this.stats.elapsedSeconds = Math.round((performance.now() - startTime) / 1000 * 10) / 10;
            this.notifyProgress();
            resolve({ files: scannedFiles, stats: this.stats, errors: scanErrors });
          }
        }
      })();
    });
  }

  private async processSingleFile(item: DiscoveredFileItem): Promise<ScannedFile> {
    const { file, relativePath } = item;
    const ext = getFileExtension(file.name);
    const mediaType = detectMediaType(ext);
    const mimeType = inferMimeType(file.name, file.type);

    // 1. Incremental skip check: if file is known and size matches, reuse known hash
    const known = this.options.fingerprints?.[relativePath];
    let sha256: string;
    let isIncrementalSkip = false;
    const needsThumbnailBackfill = !!known && known.has_thumbnail === false;

    if (known && known.size_bytes === file.size && known.sha256) {
      sha256 = known.sha256;
      isIncrementalSkip = true;
    } else {
      sha256 = await computeFileSHA256(file);
    }

    // 2. Check for duplicate hash
    let isDuplicateOf: string | undefined = undefined;
    if (this.seenHashes.has(sha256)) {
      isDuplicateOf = this.seenHashes.get(sha256);
    } else {
      this.seenHashes.set(sha256, relativePath);
    }

    // 3. Extract metadata (can skip deep parsing if incremental skip AND not backfilling)
    const shouldExtractDetails = !isIncrementalSkip || needsThumbnailBackfill;
    const metadataResult = shouldExtractDetails
      ? await extractMediaMetadata(file, mediaType)
      : { capturedAt: undefined, modifiedAt: new Date(file.lastModified).toISOString(), width: undefined, height: undefined, duration: undefined, exif: {} };

    if (item.hasAppleEdits) {
      metadataResult.exif.has_apple_edits = true;
    }
    if (item.hasSidecarXmp) {
      (metadataResult.exif as any).has_xmp_sidecar = true;
    }

    // 4. Generate thumbnail if requested and media is supported (generate even if incremental skip when needsThumbnailBackfill is true!)
    let thumbnailDataUrl: string | undefined = undefined;
    if (this.options.generateThumbnails && (!isIncrementalSkip || needsThumbnailBackfill)) {
      const thumb = await generateThumbnail(file, mediaType, metadataResult.exif.orientation);
      if (thumb) {
        thumbnailDataUrl = thumb.dataUrl;
      }
    }

    return {
      id: `${sha256.slice(0, 12)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      relativePath,
      extension: ext,
      mimeType,
      size: file.size,
      mediaType,
      sha256,
      capturedAt: metadataResult.capturedAt,
      modifiedAt: metadataResult.modifiedAt,
      width: metadataResult.width,
      height: metadataResult.height,
      duration: metadataResult.duration,
      metadata: metadataResult.exif as unknown as Record<string, unknown>,
      thumbnailDataUrl,
      isDuplicateOf
    };
  }

  private updateMetrics(startTime: number) {
    const elapsedMs = performance.now() - startTime;
    const elapsedSeconds = Math.max(elapsedMs / 1000, 0.001);
    this.stats.elapsedSeconds = Math.round(elapsedSeconds * 10) / 10;
    this.stats.filesPerSecond = Math.round((this.stats.processed / elapsedSeconds) * 10) / 10;
    this.stats.mbPerSecond = Math.round(((this.stats.bytesProcessed / (1024 * 1024)) / elapsedSeconds) * 100) / 100;

    // Check heap memory if Chrome/Edge performance.memory is available
    // @ts-expect-error - performance.memory is non-standard but available in Chromium
    if (typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize) {
      // @ts-expect-error - Chromium API
      this.stats.heapUsedMb = Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
    }
  }

  private notifyProgress() {
    if (this.options.onProgress) {
      this.options.onProgress({ ...this.stats });
    }
  }
}
