import type { Browser } from 'playwright-core';
import { guardNetwork } from '../shared/network.js';

/** The longest side a PNG is drawn at: a larger artwork is drawn smaller (an SVG scales), so no page asks the browser for a huge canvas. */
export const MAX_SIDE = 4096;

/**
 * The SVG as a PNG, on no background, at `scale` times the artwork's size, never more than MAX_SIDE on the longer side. The page is a
 * local string with no network. It waits for the picture to decode and for two frames, so the same SVG is the same bytes every time.
 */
export async function svgToPng(browser: Browser, svg: string, size: { width: number; height: number }, scale: 1 | 2): Promise<Buffer> {
  const fit = Math.min(1, MAX_SIDE / Math.max(size.width * scale, size.height * scale));
  const width = Math.max(1, Math.round(size.width * fit));
  const height = Math.max(1, Math.round(size.height * fit));
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    await guardNetwork(page, { page: 'a logo file' });
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block}</style><img width="${width}" height="${height}" src="${source}">`,
    );
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((image) => image.decode()));
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    });
    return await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}
