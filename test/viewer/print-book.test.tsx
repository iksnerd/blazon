// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { cleanup, render, waitFor } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The print book (`#print`): the brand book as one document of chapters for a headless browser to print, with no
// sidebar. `#print/essentials` is the short version; `#print/pages=a,b` picks the chapters. The slides themselves are
// measured in a real browser (test/viewer/paginate.test.ts tests their packing; the blazon.print-book plugin tests the PDF).

// The reference brand when a maintainer has it, else blazon's own: a describe that needs the reference is skipped without it
const PRESENT = hasReference('examples/auth0');
const EXAMPLE = PRESENT ? referencePath('examples/auth0') : path.join(REPO, 'examples/blazon');
let data: BlazonData;

beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  window.location.hash = '';
});

function open(hash: string) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}

const chapters = () => [...document.querySelectorAll<HTMLElement>('[data-print-chapter]')].map((c) => c.dataset.printChapter);
const contents = () => [...document.querySelectorAll<HTMLElement>('[data-print-contents] li')].map((li) => li.dataset.chapter);

describe.skipIf(!PRESENT)('the print book', () => {
  it('is the whole brand book without the sidebar: a cover, the contents, then every guideline page', () => {
    open('#print');
    expect(document.querySelector('[data-sidebar]')).toBeNull();
    expect(document.querySelector('[data-print-slide="cover"]')!.textContent).toContain('Auth0 Brand Book');
    expect(chapters()).toEqual([
      'doc/intro',
      'doc/logo',
      'doc/colors',
      'doc/typography',
      'doc/icons',
      'doc/illustration',
      'doc/photography',
      'doc/patterns',
      'doc/3d-graphics',
      'doc/diagrams',
      'doc/motion',
      'doc/layout',
      'doc/social',
      'doc/applications',
    ]);
    expect(contents()).toEqual(chapters());
  });

  it("puts the brand's logo at the top of the cover, the variant made for its dark ground", () => {
    open('#print');
    const logo = document.querySelector<HTMLImageElement>('[data-print-slide="cover"] img[data-print-cover-logo]');
    expect(data.logo!.onDark).toBeTruthy();
    expect(logo?.getAttribute('src')).toBe(data.logo!.onDark);
  });

  it('titles each chapter as the sidebar does', () => {
    open('#print');
    const title = (id: string) => document.querySelector(`[data-print-chapter="${id}"] [data-print-chapter-title]`)!.textContent;
    expect(title('doc/logo')).toBe('Logotype');
  });

  it('keeps to the logo, color and typography pages in the essentials', () => {
    open('#print/essentials');
    expect(chapters()).toEqual(['doc/logo', 'doc/colors', 'doc/typography']);
  });

  it('prints the token pages the brand has as the reference, titled as the sidebar does', () => {
    open('#print/reference');
    // Auth0 has no motion tokens, so the reference, like the sidebar, has no Motion page
    expect(chapters()).toEqual(['tokens/colors', 'tokens/typography', 'tokens/dimensions', 'tokens/effects']);
    expect(document.querySelector('[data-print-chapter="tokens/effects"] [data-print-chapter-title]')!.textContent).toBe('Strokes & effects');
  });

  it('prints the pages it is given, in the order given, and ignores a name it does not know', () => {
    open('#print/pages=tokens/colors,doc/logo,doc/nope');
    expect(chapters()).toEqual(['tokens/colors', 'doc/logo']);
  });
});

// jsdom measures every block as 0px high, so here the slides follow the structure alone: a chapter's opener (its title
// band) is a slide of its own, and its sections share the slides after it, so a chapter is two slides at 0px.
describe.skipIf(!PRESENT)('the print book as slides', () => {
  it('lays each asset of a section out as a block of its own', async () => {
    open('#print/pages=doc/photography');
    await waitFor(() => expect((window as unknown as { __blazonPrint?: unknown }).__blazonPrint).toBeDefined());
    const { printBlocks } = await import('../../src/viewer/pages/print');
    const assets = printBlocks(document.querySelector('[data-print-chapter]')!).filter((b) => b.el.hasAttribute('data-section-asset'));
    expect(assets.length).toBe(document.querySelectorAll('[data-print-chapter] [data-section-asset]').length);
    expect(assets.length).toBeGreaterThan(1);
  });

  it('lays the Markdown between directives out block by block, so a heading in it can move to the next slide with its block', async () => {
    open('#print');
    await waitFor(() => expect((window as unknown as { __blazonPrint?: unknown }).__blazonPrint).toBeDefined());
    const { printBlocks } = await import('../../src/viewer/pages/print');
    const placed = [...document.querySelectorAll('[data-print-chapter]')].flatMap((chapter) => printBlocks(chapter));
    // a heading inside a block that is laid out whole (not an asset's own text, nor a lockup group, which is its heading and its cards) cannot be kept with what follows
    const buried = placed.filter(
      (b) =>
        !b.el.hasAttribute('data-section-asset') &&
        !b.el.hasAttribute('data-lockup-group') &&
        b.el.querySelector(':scope > h2, :scope > h3, :scope > h4') &&
        !/^H[2-6]$/.test(b.el.tagName),
    );
    expect(buried.map((b) => b.el.textContent!.slice(0, 40))).toEqual([]);
    expect(placed.filter((b) => b.kind === 'heading').length).toBeGreaterThan(0);
    expect(placed.some((b) => b.lead)).toBe(true);
    expect(placed.some((b) => b.table)).toBe(true);
  });

  const numbers = () => [...document.querySelectorAll<HTMLElement>('[data-print-contents] li')].map((li) => [li.dataset.chapter, li.querySelector('[data-page]')?.textContent]);

  it('numbers the contents from the slides each chapter takes, after the cover and the contents', async () => {
    open('#print/pages=doc/motion,doc/colors');
    await waitFor(() =>
      expect(numbers()).toEqual([
        ['doc/motion', '3'],
        ['doc/colors', '5'],
      ]),
    );
  });

  it('tells the printer it is laid out, and how many pages it has', async () => {
    open('#print/pages=doc/motion,doc/colors');
    await waitFor(() => expect((window as unknown as { __blazonPrint?: unknown }).__blazonPrint).toEqual({ ready: true, pages: 6 }));
  });

  const slides = () => [...document.querySelectorAll<HTMLElement>('[data-print-slide]')];

  it("builds one frame per slide: the cover, the contents, then each chapter's opener and its sections", async () => {
    open('#print/pages=doc/motion');
    await waitFor(() => expect(slides()).toHaveLength(4));
    expect(slides().map((s) => s.dataset.printSlide)).toEqual(['cover', 'contents', 'opener', 'content']);
    expect(slides()[2]!.textContent).toMatch(/^System elements\s*Motion/);
    expect(slides()[3]!.textContent).toMatch(/^Movement/);
  });

  it('prints the frames and not the copy it measured', () => {
    open('#print');
    const css = document.querySelector('[data-print-book] style')!.textContent!;
    // measured, so laid out in print too, but in a box of no height off the page
    expect(css).toMatch(/\[data-print-flow\]\s*\{[^}]*height:\s*0;\s*overflow:\s*hidden/);
  });

  it("prints the cover on the brand's inverse ground: the frames' own background does not reach it", () => {
    open('#print');
    const css = document.querySelector('[data-print-book] style')!.textContent!;
    expect(css).toMatch(/\[data-print-slide="cover"\]\s*\{[^}]*background:\s*var\(--blazon-inverse\)/);
    // and keeps its own margin: the title does not touch the page's edge
    const zeroPadding = [...css.matchAll(/([^{}]+)\{[^}]*\bpadding:\s*0;/g)].map((m) => m[1]!);
    expect(zeroPadding.filter((s) => s.includes('[data-print-slide="cover"]'))).toEqual([]);
    const framesGround = [...css.matchAll(/([^{}]+)\{[^}]*background:\s*var\(--background\)/g)].map((m) => m[1]!.trim());
    for (const selector of framesGround.filter((s) => s.includes('[data-print-slide]'))) expect(selector).toContain(':not([data-print-slide="cover"])');
  });

  it("keeps an opener's section label and brand mark inside the slide's margin, as its title is", async () => {
    open('#print/pages=doc/motion');
    await waitFor(() => expect(slides()).toHaveLength(4));
    const opener = slides()[2]!;
    expect(opener.querySelector('[data-opener-label]')!.textContent).toBe('System elements');
    expect(opener.querySelector('[data-opener-mark]')).not.toBeNull();
    const css = document.querySelector('[data-print-book] style')!.textContent!;
    expect(css).toMatch(/\[data-opener-label\]\s*\{[^}]*top:\s*72px/);
    expect(css).toMatch(/\[data-opener-mark\]\s*\{[^}]*bottom:\s*72px/);
  });

  it('prints each frame as a whole 16:9 page, with no page margin of its own', () => {
    open('#print');
    const css = document.querySelector('[data-print-book] style')!.textContent!;
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*1280px 720px;\s*margin:\s*0/);
  });

  it('draws the footer in each content frame: the brand and the page number, so a screenshot of a frame is the page', async () => {
    open('#print/pages=doc/motion');
    await waitFor(() => expect(slides()).toHaveLength(4));
    const footers = slides().map((s) => s.querySelector('[data-print-footer]')?.textContent ?? null);
    // the cover and an opener are full-bleed and have none
    expect(footers).toEqual([null, 'Auth0 Brand Book2', null, 'Auth0 Brand Book4']);
  });
});
