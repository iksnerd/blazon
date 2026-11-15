import type { Browser, Page } from 'playwright-core';

/**
 * Gets the page ready for its picture. Chrome draws an image shown smaller than it is in two steps, a first raster and a
 * later one of better quality, and a picture taken in between, or after, differs in a few edge pixels (about 1 render in 25;
 * waiting longer only moved which of the two it caught). So each such image is drawn once by script, at the size it takes on
 * the screen, into a canvas of its own; an image shown at its own size or larger, such as the pixelated 16 px icon, is left
 * as it is. Then two frames pass, so the page has painted.
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const images = [...document.images];
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
    const scale = window.devicePixelRatio;
    for (const image of images) {
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      if (!image.naturalWidth || image.naturalWidth <= width) continue;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      canvas.style.cssText = `${image.style.cssText};width:${image.width}px;height:${image.height}px`;
      image.replaceWith(canvas);
    }
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });

/**
 * A square SVG drawn by the browser at its own size, as a PNG. The page is a local string with no network, so the logo
 * goes nowhere. `transparent` leaves the canvas see-through; otherwise it is white behind whatever the SVG draws.
 */
export async function png(browser: Browser, svg: string, size: number, transparent: boolean): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  try {
    // Offline, so nothing in the markup could be fetched
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${transparent ? 'transparent' : '#fff'}}svg{display:block}</style>${svg}`);
    await settle(page);
    return await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  } finally {
    await page.close();
  }
}

/** A page of HTML drawn at `width` x `height` CSS px and twice that in pixels, as a PNG. Offline, like `png`. */
export async function sheet(browser: Browser, html: string, width: number, height: number, style: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  try {
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${style}</style>${html}`);
    await settle(page);
    return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

/**
 * How far from the centre of a square PNG its drawing reaches, as a share of its width: the farthest pixel that is more
 * than half opaque, read from the real pixels by the browser's own decoder.
 */
export async function reach(browser: Browser, image: Buffer, size: number): Promise<number> {
  const page = await browser.newPage();
  try {
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><meta charset="utf-8">');
    return await page.evaluate(
      async ({ uri, side }) => {
        const img = new Image();
        img.src = uri;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext('2d')!;
        context.drawImage(img, 0, 0);
        const { data } = context.getImageData(0, 0, side, side);
        let far = 0;
        for (let y = 0; y < side; y++) {
          for (let x = 0; x < side; x++) {
            if (data[(y * side + x) * 4 + 3]! > 128) far = Math.max(far, Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2));
          }
        }
        return far / side;
      },
      { uri: `data:image/png;base64,${image.toString('base64')}`, side: size },
    );
  } finally {
    await page.close();
  }
}

/** An ICO file holding PNG images, one per entry, smallest first (Windows Vista and every browser read this form). */
export function ico(images: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png: data }, i) => {
    const at = 6 + 16 * i;
    head[at] = size >= 256 ? 0 : size;
    head[at + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((image) => image.png)]);
}
