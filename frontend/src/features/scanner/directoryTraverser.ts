import { getFileExtension, isSupportedMedia } from './formatDetector';

export const IGNORED_EXTENSIONS = new Set([
  'aae', 'xmp', 'lrv', 'thm', 'dat', 'ds_store', 'db', 'ini'
]);

export const IGNORED_DIRECTORIES = new Set([
  '.pmm_trash', '.trashes', '.fseventsd', '.spotlight-v100', '__macosx', '$recycle.bin', '.git'
]);

export interface DiscoveredFileItem {
  file: File;
  relativePath: string;
  hasAppleEdits?: boolean;
  hasSidecarXmp?: boolean;
}

export interface BrowserCapabilities {
  hasFileSystemAccess: boolean;
  hasWebkitDirectory: boolean;
  hasWebWorkers: boolean;
  hasWebAssembly: boolean;
  hasMemoryApi: boolean;
  browserName: string;
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  const ua = navigator.userAgent;
  let browserName = 'Unknown Browser';

  if (ua.includes('Edg/')) {
    browserName = 'Microsoft Edge';
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    browserName = 'Google Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browserName = 'Apple Safari';
  } else if (ua.includes('Firefox/')) {
    browserName = 'Mozilla Firefox';
  }

  return {
    hasFileSystemAccess: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    hasWebkitDirectory: typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input'),
    hasWebWorkers: typeof Worker !== 'undefined',
    hasWebAssembly: typeof WebAssembly !== 'undefined',
    hasMemoryApi: typeof performance !== 'undefined' && 'memory' in (performance as unknown as Record<string, unknown>),
    browserName
  };
}

/**
 * Traverses a directory handle asynchronously using File System Access API.
 * Streams files one by one to prevent loading everything in memory upfront.
 */
export async function* traverseDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  currentPath = ''
): AsyncGenerator<DiscoveredFileItem> {
  const filesInDir: FileSystemFileHandle[] = [];
  const subDirs: FileSystemDirectoryHandle[] = [];
  const sidecarNames = new Set<string>();

  // @ts-expect-error - FileSystemDirectoryHandle.values() is standard in Chromium
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const ext = getFileExtension(entry.name);
      if (ext === 'aae' || ext === 'xmp') {
        sidecarNames.add(entry.name.toLowerCase());
      }
      if (!IGNORED_EXTENSIONS.has(ext) && isSupportedMedia(ext)) {
        filesInDir.push(entry as FileSystemFileHandle);
      }
    } else if (entry.kind === 'directory') {
      if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) {
        subDirs.push(entry as FileSystemDirectoryHandle);
      }
    }
  }

  for (const fileHandle of filesInDir) {
    const entryPath = currentPath ? `${currentPath}/${fileHandle.name}` : fileHandle.name;
    try {
      const file = await fileHandle.getFile();
      const dotIdx = fileHandle.name.lastIndexOf('.');
      const baseName = dotIdx !== -1 ? fileHandle.name.substring(0, dotIdx).toLowerCase() : fileHandle.name.toLowerCase();
      const fullNameLower = fileHandle.name.toLowerCase();

      const hasAppleEdits = sidecarNames.has(`${baseName}.aae`) || sidecarNames.has(`${fullNameLower}.aae`);
      const hasSidecarXmp = sidecarNames.has(`${baseName}.xmp`) || sidecarNames.has(`${fullNameLower}.xmp`);

      yield {
        file,
        relativePath: entryPath,
        hasAppleEdits,
        hasSidecarXmp
      };
    } catch (err) {
      console.warn(`Could not read file ${entryPath}:`, err);
    }
  }

  for (const subDirHandle of subDirs) {
    const subPath = currentPath ? `${currentPath}/${subDirHandle.name}` : subDirHandle.name;
    yield* traverseDirectoryHandle(subDirHandle, subPath);
  }
}

/**
 * Parses files from a webkitdirectory FileList input.
 */
export function* traverseFileList(
  fileList: FileList
): Generator<DiscoveredFileItem> {
  // Pre-index sidecars by parent folder
  const sidecarsByDir = new Map<string, Set<string>>();
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const ext = getFileExtension(file.name);
    if (ext === 'aae' || ext === 'xmp') {
      const path = file.webkitRelativePath || file.name;
    const pathLower = path.toLowerCase();
    const segments = pathLower.split('/');
    if (segments.some(seg => IGNORED_DIRECTORIES.has(seg))) continue;
      const slashIdx = path.lastIndexOf('/');
      const parentDir = slashIdx !== -1 ? path.substring(0, slashIdx) : '';
      if (!sidecarsByDir.has(parentDir)) {
        sidecarsByDir.set(parentDir, new Set());
      }
      sidecarsByDir.get(parentDir)!.add(file.name.toLowerCase());
    }
  }

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const ext = getFileExtension(file.name);
    if (IGNORED_EXTENSIONS.has(ext) || !isSupportedMedia(ext)) continue;

    const path = file.webkitRelativePath || file.name;
    const pathLower = path.toLowerCase();
    const segments = pathLower.split('/');
    if (segments.some(seg => IGNORED_DIRECTORIES.has(seg))) continue;
    const slashIdx = path.indexOf('/');
    const relativePath = slashIdx !== -1 ? path.slice(slashIdx + 1) : path;

    const lastSlash = path.lastIndexOf('/');
    const parentDir = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
    const sidecars = sidecarsByDir.get(parentDir);

    const dotIdx = file.name.lastIndexOf('.');
    const baseName = dotIdx !== -1 ? file.name.substring(0, dotIdx).toLowerCase() : file.name.toLowerCase();
    const fullNameLower = file.name.toLowerCase();

    const hasAppleEdits = !!sidecars && (sidecars.has(`${baseName}.aae`) || sidecars.has(`${fullNameLower}.aae`));
    const hasSidecarXmp = !!sidecars && (sidecars.has(`${baseName}.xmp`) || sidecars.has(`${fullNameLower}.xmp`));

    yield {
      file,
      relativePath,
      hasAppleEdits,
      hasSidecarXmp
    };
  }
}
