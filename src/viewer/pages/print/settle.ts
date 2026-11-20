/** The longest the book waits for fonts and images before it measures anyway */
const SETTLE_MS = 15_000;

/** The stylesheets that have answered, by arriving or by failing: a failed one has no `sheet` for good, and its event is gone once it fired */
const answered = new WeakSet<EventTarget>();
if (typeof document !== 'undefined') {
  for (const type of ['load', 'error']) document.addEventListener(type, (event) => answered.add(event.target!), true);
}

/**
 * The stylesheets of the page that have not arrived: a font's rules are in one, and no face is loading until its rules are.
 * A link taken out of the page (the theme puts its font links in again when the brand changes) will never answer, so it is
 * not waited for: it is looked at again while the others are waited for.
 */
function pendingLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')].filter((link) => !link.sheet && !answered.has(link));
}

/** Resolves when the link answers or is taken out of the page */
function answer(link: HTMLLinkElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const gone = setInterval(() => link.isConnected || finish(), 50);
    function finish() {
      clearInterval(gone);
      resolve();
    }
    link.addEventListener('load', finish);
    link.addEventListener('error', finish);
  });
}

/**
 * Waits for what changes a block's height: fonts and images. The brand book loads images lazily, and a lazy image
 * off screen never loads, so each one is made eager first. A file that never arrives does not hold the book up.
 *
 * `document.fonts.ready` alone is not the signal: it is already resolved while a font's stylesheet is on its way (no face
 * is loading until the rules arrive), and before the first layout that uses a face has asked for it. So the stylesheets
 * are waited for first, then the page is laid out (reading a height), then the fonts, and this repeats until nothing is
 * pending: the book is measured with the fonts it is printed with, however slowly they arrive.
 */
export async function settled(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  for (const img of images) img.loading = 'eager';
  const loaded = (async () => {
    for (;;) {
      await Promise.all(pendingLinks().map(answer));
      void root.offsetHeight;
      await document.fonts?.ready;
      if (pendingLinks().length === 0 && (document.fonts?.status ?? 'loaded') === 'loaded') break;
    }
    // decode() waits for an eager image to load, and rejects when it cannot
    await Promise.all(images.map((img) => img.decode?.().catch(() => undefined)));
  })();
  await Promise.race([loaded, new Promise((done) => setTimeout(done, SETTLE_MS))]);
}

declare global {
  interface Window {
    /** Set when the print book is laid out: the blazon.print-book plugin waits for it, then prints; `clipped` counts the slides still cut off at the foot after they were split and drawn at the smallest size */
    __blazonPrint?: { ready: true; pages: number; layout: string; clipped: number[] };
  }
}
