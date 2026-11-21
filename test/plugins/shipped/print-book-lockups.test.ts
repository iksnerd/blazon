import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { starterProject, tempDir } from '../../support/project';

// A page of prose followed by a long list of lockup cards, in a real browser. The list is taller than a slide and was
// one block, so a slide was drawn smaller and wider to fit it; a card's height does not shrink with its width, the
// loop that measured again shrank it to a hundredth, and the slide printed nothing but a rule. The jsdom tests cannot
// see it (they measure every block as 0px high).

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book lockups test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><rect width="400" height="120" fill="${fill}"/></svg>`;
const KINDS = ['horizontal', 'stacked', 'mark', 'wordmark'];
const NAMES = Array.from({ length: 8 }, (_, i) => `direction-${i + 1}`);

let site: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  if (!CHROME) return;
  const root = await starterProject();
  const dir = path.join(root, 'assets/experiments');
  fs.mkdirSync(dir, { recursive: true });
  NAMES.forEach((name, i) => {
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg('#36c'));
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ title: `Direction ${i + 1}`, description: 'A try that is not adopted.', lockup: KINDS[i % KINDS.length], background: 'light' }));
  });
  fs.writeFileSync(
    path.join(root, 'docs/09-directions.md'),
    [
      '---\ntitle: Directions\nsection: overview\norder: 9\n---\n',
      '## Wordmark directions\n',
      'The five below are alternatives, kept so the team can compare them and so a rejected idea is not drawn twice.\n',
      'None of these follow the guidelines, on purpose. They are experiments, never for use.\n',
      '- The first two keep the existing letters.\n- The others redraw them.\n',
      '<!-- blazon:logo-lockups experiments -->\n',
    ].join('\n'),
  );
  const out = tempDir('blazon-lockups-');
  // The fixture brand is made to print one thing, not to pass blazon check: it builds although it has findings
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  site = await serve(out);
  browser = await launchBrowser(CHROME);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
}, 30_000);

/** The slides of the page: the zoom each was drawn at, its text, and how many lockup cards it holds and shows. */
async function slides(): Promise<{ zoom: number; text: string; cards: number; clipped: number }[]> {
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html#print/pages=doc/directions`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 30_000 });
    return await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-print-deck] [data-print-slide="content"]')].map((slide) => {
        const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
        const box = body.getBoundingClientRect();
        const cards = [...slide.querySelectorAll<HTMLElement>('[data-logo-lockup]')];
        return {
          zoom: Number(body.style.zoom || 1),
          text: body.innerText,
          cards: cards.length,
          // a card is cut off when its foot is below the body, which clips what does not fit
          clipped: cards.filter((card) => card.getBoundingClientRect().bottom > box.bottom + 1).length,
        };
      }),
    );
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('a page of prose and a long list of lockups, printed', () => {
  it('prints the heading and the text, drawn at a size that can be read', async () => {
    const all = await slides();
    const first = all.find((s) => s.text.includes('Wordmark directions'));
    expect(first, 'the heading is on a slide').toBeDefined();
    expect(first!.text).toContain('so the team can compare them');
    expect(first!.text).toContain('The others redraw them.');
    for (const slide of all) expect(slide.zoom).toBeGreaterThanOrEqual(0.25);
  });

  it('prints every lockup card, whole, none cut off at the foot of its slide', async () => {
    const all = await slides();
    expect(all.reduce((n, s) => n + s.cards, 0)).toBe(NAMES.length);
    expect(all.reduce((n, s) => n + s.clipped, 0)).toBe(0);
    for (const name of NAMES) expect(all.some((s) => s.text.includes(`Direction ${name.slice(-1)}`)), name).toBe(true);
  });
});
