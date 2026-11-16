import exifr from 'exifr';
import { ExifMetadata, MediaType } from './types';

export interface ExtractedMetadata {
  capturedAt?: string;
  modifiedAt?: string;
  width?: number;
  height?: number;
  duration?: number;
  exif: ExifMetadata;
}

export async function extractMediaMetadata(
  file: File,
  mediaType: MediaType
): Promise<ExtractedMetadata> {
  const result: ExtractedMetadata = {
    modifiedAt: new Date(file.lastModified).toISOString(),
    exif: {}
  };

  if (mediaType === 'image') {
    try {
      // exifr only reads the header blocks (TIFF/EXIF/IPTC/XMP) without reading the entire file
      const rawExif = await exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: false,
        iptc: false,
        icc: false
      });

      if (rawExif) {
        const capturedDate = rawExif.DateTimeOriginal || rawExif.CreateDate || rawExif.ModifyDate;
        const capturedIso = capturedDate instanceof Date 
          ? capturedDate.toISOString() 
          : (typeof capturedDate === 'string' ? new Date(capturedDate).toISOString() : undefined);

        result.capturedAt = capturedIso;
        result.width = rawExif.ImageWidth || rawExif.ExifImageWidth;
        result.height = rawExif.ImageHeight || rawExif.ExifImageHeight;

        result.exif = {
          make: rawExif.Make ? String(rawExif.Make).trim() : undefined,
          model: rawExif.Model ? String(rawExif.Model).trim() : undefined,
          capturedAt: capturedIso,
          orientation: typeof rawExif.Orientation === 'number' ? rawExif.Orientation : undefined,
          width: result.width,
          height: result.height,
          latitude: typeof rawExif.latitude === 'number' ? rawExif.latitude : undefined,
          longitude: typeof rawExif.longitude === 'number' ? rawExif.longitude : undefined,
          fNumber: typeof rawExif.FNumber === 'number' ? rawExif.FNumber : undefined,
          exposureTime: typeof rawExif.ExposureTime === 'number' ? rawExif.ExposureTime : undefined,
          iso: typeof rawExif.ISO === 'number' ? rawExif.ISO : undefined,
          lensModel: rawExif.LensModel ? String(rawExif.LensModel).trim() : undefined
        };
      }
    } catch {
      // Non-fatal: some files (e.g., PNG, WebP or corrupt headers) have no EXIF
    }

    // If width/height still not found, try Image decoding
    if (!result.width || !result.height) {
      try {
        const dims = await getImageDimensions(file);
        result.width = dims.width;
        result.height = dims.height;
      } catch {
        // Not a standard decodable image or corrupt
      }
    }
  } else if (mediaType === 'video') {
    try {
      const videoMeta = await getVideoDimensionsAndDuration(file);
      result.width = videoMeta.width;
      result.height = videoMeta.height;
      result.duration = videoMeta.duration;
    } catch {
      // Video codec not supported by browser
    }
  }

  return result;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // Try createImageBitmap first if available (faster and does not mount to DOM)
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file)
        .then(bmp => {
          const dims = { width: bmp.width, height: bmp.height };
          bmp.close();
          resolve(dims);
        })
        .catch(() => {
          fallbackWithImgElement(file, resolve, reject);
        });
    } else {
      fallbackWithImgElement(file, resolve, reject);
    }
  });
}

function fallbackWithImgElement(
  file: File,
  resolve: (dims: { width: number; height: number }) => void,
  reject: (err: unknown) => void
) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve({ width: img.naturalWidth, height: img.naturalHeight });
  };
  img.onerror = (e) => {
    URL.revokeObjectURL(url);
    reject(e);
  };
  img.src = url;
}

function getVideoDimensionsAndDuration(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanUp = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const res = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration * 100) / 100
      };
      cleanUp();
      resolve(res);
    };

    video.onerror = (err) => {
      cleanUp();
      reject(err);
    };

    // Timeout after 3 seconds so slow or unsupported video formats don't hang the scanner
    setTimeout(() => {
      cleanUp();
      reject(new Error('Video metadata timeout'));
    }, 3000);

    video.src = url;
  });
}
