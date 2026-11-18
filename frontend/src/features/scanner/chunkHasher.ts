import { createSHA256, IHasher } from 'hash-wasm';

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Object pool of stateful WASM hashers safe for concurrent workers
const hasherPool: IHasher[] = [];

async function acquireHasher(): Promise<IHasher> {
  const existing = hasherPool.pop();
  if (existing) {
    return existing;
  }
  return createSHA256();
}

function releaseHasher(hasher: IHasher): void {
  hasherPool.push(hasher);
}

/**
 * Computes SHA-256 hash in streaming chunks to keep RAM usage minimal
 * even for massive video files or raw photo archives.
 * Thread/concurrency-safe across multiple parallel async workers.
 */
export async function computeFileSHA256(
  file: File,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress?: (bytesProcessed: number, totalBytes: number) => void
): Promise<string> {
  const hasher = await acquireHasher();
  try {
    hasher.init();

    const fileSize = file.size;

    // Use stream if supported
    if (typeof file.stream === 'function') {
      const stream = file.stream();
      const reader = stream.getReader();
      let bytesRead = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          hasher.update(value);
          bytesRead += value.byteLength;
          if (onProgress) {
            onProgress(bytesRead, fileSize);
          }
        }
      }

      const hex = hasher.digest('hex');
      if (fileSize > 0 && (hex === EMPTY_SHA256 || bytesRead === 0)) {
        throw new Error('Stream returned 0 bytes for non-empty file');
      }
      return hex;
    }

    // Fallback: chunked slice with FileReader or arrayBuffer
    let offset = 0;
    while (offset < fileSize) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      hasher.update(uint8);
      offset += buffer.byteLength;
      if (onProgress) {
        onProgress(offset, fileSize);
      }
    }

    const hex = hasher.digest('hex');
    if (fileSize > 0 && hex === EMPTY_SHA256) {
      throw new Error('Slice hashing produced empty SHA-256 for non-empty file');
    }
    return hex;
  } catch (err) {
    // If WebAssembly or stream fails, fallback to Web Crypto for files <= 100MB
    if (file.size <= 100 * 1024 * 1024 && window.crypto?.subtle) {
      const buffer = await file.arrayBuffer();
      const digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    throw new Error(`Failed to compute SHA-256 hash for ${file.name}: ${(err as Error).message}`);
  } finally {
    releaseHasher(hasher);
  }
}
