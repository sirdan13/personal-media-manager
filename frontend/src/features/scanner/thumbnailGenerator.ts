import exifr from 'exifr';
import { MediaType } from './types';
import { isRawExtension, getFileExtension } from './formatDetector';

const MAX_THUMBNAIL_EDGE = 320;
const THUMBNAIL_QUALITY = 0.65;

export interface GeneratedThumbnail {
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
}

async function extractRawPreviewBlob(file: File): Promise<Blob | null> {
  try {
    const thumbBytes = await exifr.thumbnail(file);
    if (thumbBytes && thumbBytes.byteLength > 4096) {
      return new Blob([thumbBytes], { type: 'image/jpeg' });
    }
  } catch {
    // Continue to embedded JPEG scan fallback
  }

  try {
    const maxRead = Math.min(file.size, 8 * 1024 * 1024);
    const buf = new Uint8Array(await file.slice(0, maxRead).arrayBuffer());
    let bestStart = -1;
    let bestEnd = -1;
    let maxLen = 0;

    let i = 0;
    while (i < buf.length - 3) {
      // Look for JPEG SOI: 0xFF, 0xD8, 0xFF
      if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
        const start = i;
        let j = start + 3;
        while (j < buf.length - 1) {
          if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
            const len = (j + 2) - start;
            if (len > 8192 && len > maxLen) {
              maxLen = len;
              bestStart = start;
              bestEnd = j + 2;
            }
            break;
          }
          j++;
        }
        i = j + 2;
      } else {
        i++;
      }
    }

    if (bestStart !== -1 && maxLen > 8192) {
      const slice = buf.subarray(bestStart, bestEnd);
      return new Blob([slice], { type: 'image/jpeg' });
    }
  } catch {
    // Ignore error
  }

  return null;
}

export async function generateThumbnail(
  file: File,
  mediaType: MediaType,
  orientation?: number
): Promise<GeneratedThumbnail | undefined> {
  if (mediaType === 'image') {
    return generateImageThumbnail(file, orientation);
  } else if (mediaType === 'video') {
    return generateVideoThumbnail(file);
  }
  return undefined;
}

async function generateImageThumbnail(
  file: File,
  orientation?: number
): Promise<GeneratedThumbnail | undefined> {
  try {
    let sourceBlob: Blob | File = file;
    const ext = getFileExtension(file.name);
    if (isRawExtension(ext)) {
      const previewBlob = await extractRawPreviewBlob(file);
      if (previewBlob) {
        sourceBlob = previewBlob;
      }
    }

    // Attempt createImageBitmap with resize options if supported (most efficient)
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(sourceBlob);
        const { targetWidth, targetHeight } = calculateTargetDimensions(
          bmp.width,
          bmp.height,
          MAX_THUMBNAIL_EDGE
        );

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          bmp.close();
          return undefined;
        }

        applyOrientationTransform(ctx, targetWidth, targetHeight, orientation);
        ctx.drawImage(bmp, 0, 0, targetWidth, targetHeight);
        bmp.close();

        return canvasToThumbnail(canvas, targetWidth, targetHeight);
      } catch {
        // Fallback to standard Image element if createImageBitmap fails (e.g. SVG or certain WebP/HEIC)
      }
    }

    return new Promise((resolve) => {
      const url = URL.createObjectURL(sourceBlob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        const { targetWidth, targetHeight } = calculateTargetDimensions(
          img.naturalWidth,
          img.naturalHeight,
          MAX_THUMBNAIL_EDGE
        );

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(undefined);
          return;
        }

        applyOrientationTransform(ctx, targetWidth, targetHeight, orientation);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvasToThumbnail(canvas, targetWidth, targetHeight)
          .then(resolve)
          .catch(() => resolve(undefined));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };

      img.src = url;
    });
  } catch {
    return undefined;
  }
}

async function generateVideoThumbnail(file: File): Promise<GeneratedThumbnail | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      // Seek to 0.5s or 10% of duration to capture a representative frame
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const targetTime = Math.min(0.5, dur * 0.1);
      try {
        video.currentTime = targetTime;
      } catch {
        // Fallback for browsers that don't allow seeking before loadeddata
      }
    };

    video.onloadeddata = () => {
      if (video.currentTime === 0) {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        video.currentTime = Math.min(0.5, dur * 0.1);
      }
    };

    video.onseeked = () => {
      const { targetWidth, targetHeight } = calculateTargetDimensions(
        video.videoWidth || 320,
        video.videoHeight || 240,
        MAX_THUMBNAIL_EDGE
      );

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        cleanup();
        resolve(undefined);
        return;
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      cleanup();

      canvasToThumbnail(canvas, targetWidth, targetHeight)
        .then(resolve)
        .catch(() => resolve(undefined));
    };

    video.onerror = () => {
      cleanup();
      resolve(undefined);
    };

    // Timeout after 6s to not block scanner
    setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, 6000);

    video.src = url;
  });
}

function calculateTargetDimensions(
  origW: number,
  origH: number,
  maxEdge: number
): { targetWidth: number; targetHeight: number } {
  if (origW <= 0 || origH <= 0) {
    return { targetWidth: maxEdge, targetHeight: maxEdge };
  }
  const ratio = origW / origH;
  if (origW > origH) {
    const w = Math.min(origW, maxEdge);
    return { targetWidth: Math.round(w), targetHeight: Math.round(w / ratio) };
  } else {
    const h = Math.min(origH, maxEdge);
    return { targetWidth: Math.round(h * ratio), targetHeight: Math.round(h) };
  }
}

function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  orientation?: number
) {
  if (!orientation || orientation <= 1) return;

  switch (orientation) {
    case 2: // Horizontal flip
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // 180 rotate
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4: // Vertical flip
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5: // Vertical flip + 90 rotate
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // 90 rotate CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7: // Horizontal flip + 90 rotate
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8: // 90 rotate CCW
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
  }
}

async function canvasToThumbnail(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<GeneratedThumbnail> {
  // Prefer WebP with fallback to JPEG if WebP falls back to PNG (e.g. Safari/macOS WebKit)
  let dataUrl = canvas.toDataURL('image/webp', THUMBNAIL_QUALITY);
  if (dataUrl.startsWith('data:image/png')) {
    dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  }
  return {
    dataUrl,
    width,
    height
  };
}
