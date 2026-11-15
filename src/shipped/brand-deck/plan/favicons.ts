import { type Favicons } from '../favicons.js';
import { type Slide } from './types.js';

/** Points a table row, a snippet line and the rest of the files slide take; `fitsUnderTable` and the painter share them. */
export const FAVICON_ROW_PT = 17;
export const FAVICON_HEAD_LINE_PT = 14;
export const FAVICON_HEAD_PT = 10; // the head snippet under the table, in a monospace face whose letters are 0.6 of its size wide
export const FAVICON_HEAD_WIDTH = 420; // and its column, beside the colours: a line of more than FAVICON_HEAD_CHARS letters would be cut
export const FAVICON_HEAD_CHARS = Math.floor(FAVICON_HEAD_WIDTH / (FAVICON_HEAD_PT * 0.6));
const FAVICON_FILES_PT = 350; // from the table's header line down to 70 pt above the slide's foot
const FAVICON_SWATCHES_PT = 84; // the colours, two rows of two beside the snippet

export function fitsUnderTable(rows: number, headLines: number): boolean {
  return 6 + rows * FAVICON_ROW_PT + Math.max(22 + headLines * FAVICON_HEAD_LINE_PT, FAVICON_SWATCHES_PT) <= FAVICON_FILES_PT;
}

/** The Favicons part: a slide for each view the plugin drew, the table of its files and the head snippet. A key an older file lacks leaves that slide out. */
export function faviconSlides(favicons: Favicons): Slide[] {
  const base = `${favicons.folder}/favicons.json`;
  const notes: Record<string, string> = {
    tabs: 'The favicon in a light and a dark browser tab, with the 16 px and 32 px icons enlarged and drawn pixelated.',
    masks: 'The 1024 px master under the iOS and Android masks. Dashed circles: the maskable safe zone (80%) and the Android adaptive safe zone (66 dp).',
    sizes: 'The master at the iOS app-icon sizes, 180 px down to 29 px.',
  };
  const slides: Slide[] = [];
  for (const view of favicons.views ?? []) {
    let note = notes[view.id] ?? null;
    const adaptive = favicons.adaptive;
    if (view.id === 'masks' && adaptive && 'symbolReach' in adaptive && note !== null) {
      note += ` The symbol reaches ${(adaptive.symbolReach * 100).toFixed(1)}% of the Android layer's width from its centre; the adaptive safe zone is ${(adaptive.safeRadius * 100).toFixed(1)}%.`;
    }
    slides.push({ kind: 'favicon-view', title: view.title, base, file: view.file, width: view.width, height: view.height, note });
  }
  const head = favicons.head ? favicons.head.split(/\r?\n/).filter((_, i, all) => !(i === all.length - 1 && all[i] === '')) : null;
  const colors = favicons.colors ?? {};
  const rows = favicons.files ?? [];
  // A snippet of a few lines goes under the table, and a slide of five lines alone is not worth its page.
  // (the snippet is cut at the width of its column, so a snippet with a longer line has the slide's whole width for itself)
  const together = rows.length > 0 && head !== null && fitsUnderTable(rows.length, head.length) && head.every((line) => [...line].length <= FAVICON_HEAD_CHARS);
  if (rows.length > 0) slides.push({ kind: 'favicon-files', title: 'Favicon files', rows, ...(together ? { head: head!, colors } : {}) });
  if (head && !together) slides.push({ kind: 'favicon-head', title: 'Favicon head snippet', head, colors });
  if (slides.length === 0) return slides;
  // Every other part opens with a divider, so the contents entry lands on one.
  return [
    {
      kind: 'page',
      title: 'Favicons',
      description: 'The favicon and app-icon set, drawn from the logo symbol: how it looks in a browser tab and under each platform mask, and the files and tags that ship it.',
      open: [],
    },
    ...slides,
  ];
}
