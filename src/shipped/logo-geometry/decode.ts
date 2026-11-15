import type { Browser } from 'playwright-core';
import { Unsupported, type Box } from './geometry.js';

// A PNG or WebP as RGBA pixels. Node has no decoder for either, so the browser the other plugins draw with does it: the file is decoded as
// an image on a local page with no network, optionally cut to `crop` (in pixels), and drawn no larger than MAX_SIDE on its longer side,
// so a big picture is not sent across in full. The grid is made from these pixels (labels.ts).

/** The longest side the pixels are returned at. The grid is 256 cells, so this leaves the averaging plenty to work with. */
const MAX_SIDE = 1024;
/** Pictures larger than this many pixels are refused before the browser is asked to hold one. */
const MAX_PIXELS = 40_000_000;

const MEDIA: Record<string, string> = { png: 'image/png', webp: 'image/webp' };

export interface Pixels {
  rgba: Uint8Array;
  width: number;
  height: number;
}

export async function decodeRaster(browser: Browser, bytes: Buffer, format: string, crop?: Box): Promise<Pixels> {
  const media = MEDIA[format];
  if (!media) throw new Unsupported(`${format} is not a format this plugin reads; use SVG, PNG or WebP`);
  const page = await browser.newPage();
  try {
    await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    await page.setContent('<!doctype html><meta charset="utf-8">');
    const result = await page.evaluate(
      async ({ source, region, max, limit }) => {
        const image = new Image();
        image.src = source;
        try {
          await image.decode();
        } catch {
          return { error: 'the file is not a picture the browser can decode' };
        }
        const [natW, natH] = [image.naturalWidth, image.naturalHeight];
        if (natW * natH > limit) return { error: `the picture is ${natW} by ${natH} pixels, over the ${limit} this plugin will decode` };
        const [cx, cy, cw, ch] = region ?? [0, 0, natW, natH];
        const [sx, sy] = [Math.max(0, Math.min(natW - 1, Math.round(cx))), Math.max(0, Math.min(natH - 1, Math.round(cy)))];
        const [sw, sh] = [Math.max(1, Math.min(natW - sx, Math.round(cw))), Math.max(1, Math.min(natH - sy, Math.round(ch)))];
        const fit = Math.min(1, max / Math.max(sw, sh));
        const [w, h] = [Math.max(1, Math.round(sw * fit)), Math.max(1, Math.round(sh * fit))];
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
        const data = context.getImageData(0, 0, w, h).data;
        let binary = '';
        for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return { width: w, height: h, data: btoa(binary) };
      },
      { source: `data:${media};base64,${bytes.toString('base64')}`, region: crop ?? null, max: MAX_SIDE, limit: MAX_PIXELS },
    );
    if ('error' in result) throw new Unsupported(result.error);
    return { width: result.width, height: result.height, rgba: new Uint8Array(Buffer.from(result.data, 'base64')) };
  } finally {
    await page.close();
  }
}
