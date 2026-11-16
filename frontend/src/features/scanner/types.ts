export type MediaType = 'image' | 'video' | 'audio' | 'unknown';

export interface ExifMetadata {
  make?: string;
  model?: string;
  capturedAt?: string;
  orientation?: number;
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
  fNumber?: number;
  exposureTime?: number;
  iso?: number;
  lensModel?: string;
  raw?: Record<string, unknown>;
}

export interface ScannedFile {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  size: number;
  mediaType: MediaType;
  sha256: string;
  capturedAt?: string;
  modifiedAt?: string;
  width?: number;
  height?: number;
  duration?: number;
  metadata: Record<string, unknown>;
  thumbnailDataUrl?: string;
  error?: string;
  isDuplicateOf?: string; // ID or hash of previously seen identical file
}

export interface ScanError {
  path: string;
  filename: string;
  error: string;
  phase: 'discovery' | 'hashing' | 'metadata' | 'thumbnail';
  timestamp: string;
}

export interface ScanProgress {
  totalDiscovered: number;
  processed: number;
  failed: number;
  duplicatesFound: number;
  bytesProcessed: number;
  totalBytesDiscovered: number;
  startTime: number;
  elapsedSeconds: number;
  filesPerSecond: number;
  mbPerSecond: number;
  currentFile?: string;
  heapUsedMb?: number;
  status: 'idle' | 'discovering' | 'scanning' | 'paused' | 'completed' | 'error';
}

export interface BenchmarkResult {
  fileCount: number;
  totalSizeMb: number;
  elapsedSeconds: number;
  filesPerSecond: number;
  mbPerSecond: number;
  successRatePercent: number;
  duplicatesCount: number;
  heapUsedStartMb?: number;
  heapUsedEndMb?: number;
  browserName: string;
}
