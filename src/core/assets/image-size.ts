import { imageSize as readSize } from 'image-size';
import type { AssetFormat } from '../../types/index.js';

export interface PixelSize {
  width: number;
  height: number;
}

/** Bytes read from the start of a file; enough for every header image-size reads, except a JPEG with large metadata. */
export const HEADER_BYTES = 64 * 1024;

/** Pixel size from a raster file's header (PNG, GIF, JPEG, WebP, AVIF), or undefined when the header cannot be read. */
export function imageSize(format: AssetFormat, header: Buffer): PixelSize | undefined {
  if (format === 'svg') return undefined;
  try {
    const { width, height } = readSize(header);
    return width && height ? { width, height } : undefined;
  } catch {
    return undefined;
  }
}
