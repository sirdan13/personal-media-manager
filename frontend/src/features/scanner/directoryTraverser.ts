import { getFileExtension, isSupportedMedia } from './formatDetector';

export interface DiscoveredFileItem {
  file: File;
  relativePath: string;
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
  // @ts-expect-error - FileSystemDirectoryHandle.values() is standard in Chromium
  for await (const entry of dirHandle.values()) {
    const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      const ext = getFileExtension(entry.name);
      if (isSupportedMedia(ext)) {
        const fileHandle = entry as FileSystemFileHandle;
        try {
          const file = await fileHandle.getFile();
          yield {
            file,
            relativePath: entryPath
          };
        } catch (err) {
          console.warn(`Could not read file ${entryPath}:`, err);
        }
      }
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      yield* traverseDirectoryHandle(subDirHandle, entryPath);
    }
  }
}

/**
 * Parses files from a webkitdirectory FileList input.
 */
export function* traverseFileList(
  fileList: FileList
): Generator<DiscoveredFileItem> {
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const ext = getFileExtension(file.name);
    if (!isSupportedMedia(ext)) continue;

    const path = file.webkitRelativePath || file.name;
    // Strip root folder name from relative path if present for clean uniformity
    const slashIdx = path.indexOf('/');
    const relativePath = slashIdx !== -1 ? path.slice(slashIdx + 1) : path;

    yield {
      file,
      relativePath
    };
  }
}
