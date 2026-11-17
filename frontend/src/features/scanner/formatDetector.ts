import { MediaType } from './types';

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif',
  'heic', 'heif', 'avif', 'svg', 'dng', 'cr2', 'nef', 'arw'
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', 'ts'
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'wma', 'aiff'
]);

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4'
};

export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.slice(idx + 1).toLowerCase() : '';
}

export function detectMediaType(extension: string): MediaType {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'unknown';
}

export function inferMimeType(filename: string, browserMime?: string): string {
  if (browserMime && browserMime !== '' && browserMime !== 'application/octet-stream') {
    return browserMime;
  }
  const ext = getFileExtension(filename);
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function isSupportedMedia(extension: string): boolean {
  const ext = extension.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}
