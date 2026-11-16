/** The longest the book waits for fonts and images before it measures anyway */
const SETTLE_MS = 15_000;

/**
 * Waits for what changes a block's height: fonts and images. The brand book loads images lazily, and a lazy image
 * off screen never loads, so each one is made eager first. A file that never arrives does not hold the book up.
 */
export async function settled(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  for (const img of images) img.loading = 'eager';
  const loaded = Promise.all([
    document.fonts?.ready,
    // decode() waits for an eager image to load, and rejects when it cannot
    ...images.map((img) => img.decode?.().catch(() => undefined)),
  ]);
  await Promise.race([loaded, new Promise((done) => setTimeout(done, SETTLE_MS))]);
}

declare global {
  interface Window {
    /** Set when the print book is laid out: the blazon.print-book plugin waits for it, then prints; `clipped` counts the slides still cut off at the foot after they were split and drawn at the smallest size */
    __blazonPrint?: { ready: true; pages: number; layout: string; clipped: number[] };
  }
}
