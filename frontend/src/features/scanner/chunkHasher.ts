import { createSHA256, IHasher } from 'hash-wasm';

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks

let sharedHasherPromise: Promise<IHasher> | null = null;

async function getHasher(): Promise<IHasher> {
  if (!sharedHasherPromise) {
    sharedHasherPromise = createSHA256();
  }
  return sharedHasherPromise;
}

/**
 * Computes SHA-256 hash in streaming chunks to keep RAM usage minimal
 * even for massive video files or raw photo archives.
 */
export async function computeFileSHA256(
  file: File,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress?: (bytesProcessed: number, totalBytes: number) => void
): Promise<string> {
  try {
    const hasher = await getHasher();
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
        if (value) {
          hasher.update(value);
          bytesRead += value.length;
          if (onProgress) {
            onProgress(bytesRead, fileSize);
          }
        }
      }

      return hasher.digest('hex');
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

    return hasher.digest('hex');
  } catch (err) {
    // If WebAssembly fails for any reason, fallback to Web Crypto for files < 100MB
    if (file.size <= 100 * 1024 * 1024 && window.crypto?.subtle) {
      const buffer = await file.arrayBuffer();
      const digest = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    throw new Error(`Failed to compute SHA-256 hash for ${file.name}: ${(err as Error).message}`);
  }
}
