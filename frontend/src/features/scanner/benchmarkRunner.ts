import { ScannerEngine } from './scannerEngine';
import { DiscoveredFileItem } from './directoryTraverser';
import { BenchmarkResult } from './types';
import { detectBrowserCapabilities } from './directoryTraverser';

/**
 * Creates a valid synthetic JPEG image blob of specified dimensions
 * with customizable binary content for testing.
 */
function createSyntheticImageFile(
  filename: string,
  relativePath: string,
  width: number,
  height: number,
  color: string,
  seed = 0
): DiscoveredFileItem {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // Draw some patterns so the binary hash is unique unless seed is identical
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText(`${filename} [${width}x${height}] #${seed}`, 10, 30);
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Convert canvas to real binary blob synchronously via base64 dataURL
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const binaryStr = atob(dataUrl.split(',')[1]);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // If we want no EXIF, the standard canvas.toDataURL produces standard JFIF without full EXIF tags
  // which perfectly simulates files without EXIF!
  const file = new File([bytes], filename, {
    type: 'image/jpeg',
    lastModified: Date.now() - seed * 60000
  });

  return {
    file,
    relativePath
  };
}

/**
 * Creates synthetic video dummy file of specified size in MB
 */
function createSyntheticVideoFile(
  filename: string,
  relativePath: string,
  sizeMb: number,
  seed = 0
): DiscoveredFileItem {
  // Create byte chunk and repeat without taking huge RAM
  const chunkSizeBytes = 1024 * 1024; // 1MB pattern
  const pattern = new Uint8Array(chunkSizeBytes);
  for (let i = 0; i < chunkSizeBytes; i++) {
    pattern[i] = (i + seed) % 256;
  }

  const parts: BlobPart[] = [];
  for (let i = 0; i < sizeMb; i++) {
    parts.push(pattern.buffer.slice(0) as ArrayBuffer);
  }

  const file = new File(parts, filename, {
    type: 'video/mp4',
    lastModified: Date.now() - 3600000
  });

  return { file, relativePath };
}

export interface BenchmarkOptions {
  count: number;
  includeDuplicates?: boolean;
  includeVideos?: boolean;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Runs a standardized stress benchmark to measure scanning speed,
 * memory stability and duplicate grouping under controlled conditions.
 */
export async function runBenchmark(
  options: BenchmarkOptions
): Promise<{ result: BenchmarkResult; errors: number }> {
  const { count, includeDuplicates = true, includeVideos = false, concurrency = 4 } = options;
  const capabilities = detectBrowserCapabilities();

  // @ts-expect-error - Chromium API
  const heapStart = typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize
    // @ts-expect-error - Chromium API
    ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024) * 10) / 10
    : undefined;

  const items: DiscoveredFileItem[] = [];
  const colors = ['#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0d9488'];

  // Generate dataset
  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    const width = 200 + (i % 5) * 150;
    const height = 150 + (i % 4) * 120;
    const folder = `Folder_${Math.floor(i / 100)}`;

    if (includeDuplicates && i > 0 && i % 10 === 0) {
      // Create exact duplicate with different filename and different path
      const original = items[i - 10];
      const dupFile = new File([original.file], `DUPLICATE_OF_${original.file.name}`, {
        type: original.file.type,
        lastModified: original.file.lastModified
      });
      items.push({
        file: dupFile,
        relativePath: `Backup_Drive/${original.relativePath}`
      });
    } else {
      const filename = `IMG_${String(i).padStart(5, '0')}.jpg`;
      const relativePath = `${folder}/${filename}`;
      items.push(
        createSyntheticImageFile(filename, relativePath, width, height, color, i)
      );
    }
  }

  // Include video files if requested
  if (includeVideos) {
    items.push(createSyntheticVideoFile('vacation_clip_1080p.mp4', 'Videos/vacation_clip_1080p.mp4', 15, 1));
    items.push(createSyntheticVideoFile('drone_shot_4k.mp4', 'Videos/drone_shot_4k.mp4', 45, 2));
  }

  const engine = new ScannerEngine({
    concurrency,
    generateThumbnails: true
  });

  const startTime = performance.now();
  const scanResult = await engine.scan(items);
  const elapsedSeconds = Math.max((performance.now() - startTime) / 1000, 0.001);

  // @ts-expect-error - Chromium API
  const heapEnd = typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize
    // @ts-expect-error - Chromium API
    ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024) * 10) / 10
    : undefined;

  const totalBytes = items.reduce((acc, it) => acc + it.file.size, 0);
  const totalSizeMb = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
  const filesPerSecond = Math.round((scanResult.files.length / elapsedSeconds) * 10) / 10;
  const mbPerSecond = Math.round((totalSizeMb / elapsedSeconds) * 100) / 100;
  const duplicatesCount = scanResult.files.filter(f => f.isDuplicateOf).length;
  const successRate = Math.round((scanResult.files.length / items.length) * 1000) / 10;

  const result: BenchmarkResult = {
    fileCount: items.length,
    totalSizeMb,
    elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
    filesPerSecond,
    mbPerSecond,
    successRatePercent: successRate,
    duplicatesCount,
    heapUsedStartMb: heapStart,
    heapUsedEndMb: heapEnd,
    browserName: capabilities.browserName
  };

  return { result, errors: scanResult.errors.length };
}
