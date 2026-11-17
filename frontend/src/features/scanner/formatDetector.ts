import { MediaType } from './types';

export const RAW_EXTENSIONS = new Set([
  'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'raf', 'orf', 'rw2', 'raw', 'pef', 'srw', '3fr', 'fff', 'iiq',
  'x3f', 'rwl', 'erf', 'kdc', 'dcr', 'mos'
]);

export const STANDARD_IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif',
  'heic', 'heif', 'avif', 'jxl', 'jp2', 'j2k', 'psd', 'tga', 'ico', 'svg'
]);

export const IMAGE_EXTENSIONS = new Set([
  ...RAW_EXTENSIONS,
  ...STANDARD_IMAGE_EXTENSIONS
]);

export const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', '3g2',
  'ts', 'mts', 'm2ts', 'mpg', 'mpeg', 'vob', 'insv'
]);

export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'wma', 'aiff'
]);

export function isRawExtension(ext: string): boolean {
  return RAW_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ''));
}

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
  jxl: 'image/jxl',
  dng: 'image/x-adobe-dng',
  cr2: 'image/x-canon-cr2',
  cr3: 'image/x-canon-cr3',
  nef: 'image/x-nikon-nef',
  arw: 'image/x-sony-arw',
  raf: 'image/x-fuji-raf',
  orf: 'image/x-olympus-orf',
  rw2: 'image/x-panasonic-rw2',
  pef: 'image/x-pentax-pef',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
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
