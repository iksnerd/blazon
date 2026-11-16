// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// The Favicons page and its print chapter. The viewer is static and its data is fixed before the plugins run, so the page
// asks the site for favicons/favicons.json (the copy blazon.favicons leaves there) and exists only when it is found.

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
  delete window.__blazonPrint;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** favicons.json as blazon.favicons writes it, in the fields the page reads */
const FAVICONS = {
  format: 'blazon-favicons',
  version: 1,
  symbol: 'logos/mark',
  colors: { ground: '#2563EB', ink: '#FFFFFF', favicon: '#2563EB', themeColor: '#2563EB' },
  views: [
    { id: 'tabs', title: 'Browser tabs', file: 'favicon-tabs.png', width: 2400, height: 680 },
    { id: 'masks', title: 'App icon masks', file: 'app-icon-masks.png', width: 2400, height: 600 },
    { id: 'sizes', title: 'iOS sizes', file: 'app-icon-sizes.png', width: 2400, height: 600 },
  ],
  adaptive: { safeRadius: 0.3056, symbolReach: 0.2371 },
  files: [
    { file: 'favicon.svg', size: 'vector, 32 x 32 viewBox', use: 'Browser tab icon, any size, transparent' },
    { file: 'icon-192.png', size: '192 x 192', use: 'Web manifest icon, maskable' },
  ],
  head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<meta name="theme-color" content="#2563EB">\n',
};

/** fetch as a static server answers it: the copy at favicons/favicons.json, or what `answer` says for any path */
const serveFavicons = (answer: Response | (() => Promise<Response>)) => {
  const fetch = vi.fn(async (url: string) => {
    expect(url).toBe('favicons/favicons.json');
    return typeof answer === 'function' ? answer() : answer.clone();
  });
  // The "Connect your agent" panel asks the site for its own file; a static site has none, so it answers 404 and is not counted here
  vi.stubGlobal('fetch', (url: string) => (url === '__blazon/mcp-config' ? Promise.resolve(new Response('', { status: 404 })) : fetch(url)));
  return fetch;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function open(hash: string) {
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', data), 'text/html').head.innerHTML;
  window.location.hash = hash;
  return render(<App />);
}
const sidebarLinks = () =>
  within(screen.getByRole('navigation', { name: 'Brand book' }))
    .getAllByRole('link')
    .map((a) => a.textContent);
const chapters = () => [...document.querySelectorAll<HTMLElement>('[data-print-chapter]')].map((c) => c.dataset.printChapter);

describe('the Favicons page', () => {
  it("lists Favicons under Assets once the site has the plugin's copy, and opens it", async () => {
    const fetch = serveFavicons(json(FAVICONS));
    open('#favicons');
    await screen.findByRole('heading', { name: 'Favicons', level: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const link = within(screen.getByRole('navigation', { name: 'Brand book' })).getByRole('link', { name: 'Favicons' });
    expect(link.getAttribute('href')).toBe('#favicons');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('main').textContent).toContain('logos/mark');
  });

  it("shows a block for each view, from the site's favicons/ folder, with what it shows", async () => {
    serveFavicons(json(FAVICONS));
    open('#favicons');
    await screen.findByRole('heading', { name: 'Favicons', level: 1 });
    const views = [...document.querySelectorAll<HTMLElement>('[data-favicons-view]')];
    expect(views.map((v) => [v.dataset.faviconsView, v.querySelector('img')!.getAttribute('src')])).toEqual([
      ['tabs', 'favicons/favicon-tabs.png'],
      ['masks', 'favicons/app-icon-masks.png'],
      ['sizes', 'favicons/app-icon-sizes.png'],
    ]);
    // the masks note says how far the symbol reaches, as measured by the plugin
    expect(screen.getByRole('main').textContent).toContain("The symbol reaches 23.7% of the Android layer's width from its centre; the adaptive safe zone is 30.6%.");
  });

  it('tabulates the files, and shows the head snippet with the colors of the set', async () => {
    serveFavicons(json(FAVICONS));
    open('#favicons');
    await screen.findByRole('heading', { name: 'Favicons', level: 1 });
    const rows = [...document.querySelectorAll('[data-favicons-files] tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(rows).toEqual(FAVICONS.files.map((f) => [f.file, f.size, f.use]));
    expect(document.body.textContent).toContain('<meta name="theme-color" content="#2563EB">');
    expect([...document.querySelectorAll('[data-favicons-colors] li')].map((li) => li.textContent)).toEqual([
      'Ground#2563EB',
      'Ink#FFFFFF',
      'Favicon#2563EB',
      'Theme color#2563EB',
    ]);
  });

  it('leaves out what an older file does not have, and fills a swatch only with a hex color', async () => {
    serveFavicons(json({ format: 'blazon-favicons', version: 1, colors: { ground: 'url(https://example.test/x)' }, head: '<link rel="icon" href="/favicon.svg">\n' }));
    open('#favicons');
    await screen.findByRole('heading', { name: 'Favicons', level: 1 });
    expect(document.querySelector('[data-favicons-view]')).toBeNull();
    expect(document.querySelector('[data-favicons-files]')).toBeNull();
    const swatch = document.querySelector<HTMLElement>('[data-favicons-colors] li span')!;
    expect(swatch.getAttribute('style')).toBeNull();
  });
});

describe("a site without the plugin's copy", () => {
  /** What the viewer does for each way the file can be missing or wrong: nothing, and nothing in the console */
  const answers: [string, () => Response | Promise<Response>][] = [
    ['a 404', () => new Response('', { status: 404 })],
    ['the page itself for any path (blazon dev)', () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['a file that is not JSON', () => new Response('{ nope', { status: 200 })],
    ['JSON of another format', () => json({ format: 'blazon-brand', version: 2 })],
    ['JSON that is null', () => new Response('null', { status: 200 })],
    ['a request that fails', () => Promise.reject(new TypeError('Failed to fetch'))],
  ];
  it.each(answers)('shows no entry and no page, and says nothing, for %s', async (_, answer) => {
    const log = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
    const fetch = serveFavicons(async () => answer());
    open('#favicons');
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(sidebarLinks()).not.toContain('Favicons');
    expect(screen.getByRole('main').textContent).toContain('Not found');
    for (const spy of log) expect(spy).not.toHaveBeenCalled();
  });

  it('is the same sidebar as before: Favicons is the only entry the copy adds', async () => {
    serveFavicons(new Response('', { status: 404 }));
    open('');
    await act(async () => {});
    const without = sidebarLinks();
    cleanup();
    serveFavicons(json(FAVICONS));
    open('');
    await waitFor(() => expect(sidebarLinks()).toContain('Favicons'));
    expect(sidebarLinks().filter((label) => label !== 'Favicons')).toEqual(without);
  });

  it('warns once, and has no page, for a version it does not read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    serveFavicons(json({ ...FAVICONS, version: 2 }));
    open('#favicons');
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]![0]).toContain('version 2');
    expect(sidebarLinks()).not.toContain('Favicons');
  });

  it('shows nothing, not "Not found", at #favicons while the file is still being asked for', async () => {
    let answer!: (response: Response) => void;
    serveFavicons(() => new Promise<Response>((done) => (answer = done)));
    open('#favicons');
    await act(async () => {});
    expect(screen.getByRole('main').textContent).not.toContain('Not found');
    await act(async () => answer(json(FAVICONS)));
    await screen.findByRole('heading', { name: 'Favicons', level: 1 });
  });
});

describe.skipIf(!PRESENT)('the Favicons chapter of the print book', () => {
  it('ends the full book, and is in its contents', async () => {
    serveFavicons(json(FAVICONS));
    open('#print');
    await waitFor(() => expect(chapters().at(-1)).toBe('favicons'));
    expect(document.querySelector('[data-print-chapter="favicons"] [data-print-chapter-title]')!.textContent).toBe('Favicons');
    expect([...document.querySelectorAll<HTMLElement>('[data-print-contents] li')].at(-1)!.dataset.chapter).toBe('favicons');
    expect(document.querySelector('[data-print-chapter="favicons"] [data-favicons-view]')).not.toBeNull();
  });

  it('is not in the essentials or the reference, and is chosen by name in pages', async () => {
    serveFavicons(json(FAVICONS));
    open('#print/essentials');
    await act(async () => {});
    expect(chapters()).toEqual(['doc/logo', 'doc/colors', 'doc/typography']);
    cleanup();
    open('#print/reference');
    await act(async () => {});
    expect(chapters()).not.toContain('favicons');
    cleanup();
    open('#print/pages=favicons,doc/logo');
    await waitFor(() => expect(chapters()).toEqual(['favicons', 'doc/logo']));
  });

  it('is not in a book of a site without the copy, which is then the book it was', async () => {
    serveFavicons(new Response('', { status: 404 }));
    open('#print');
    await waitFor(() => expect(window.__blazonPrint?.ready).toBe(true));
    expect(chapters()).not.toContain('favicons');
    expect(chapters()).toEqual(data.docs.map((doc) => `doc/${doc.slug}`));
  });

  it('is not laid out, and does not say it is ready, until the site has answered', async () => {
    let answer!: (response: Response) => void;
    serveFavicons(() => new Promise<Response>((done) => (answer = done)));
    open('#print');
    await act(async () => {});
    await new Promise((done) => setTimeout(done, 50));
    expect(window.__blazonPrint).toBeUndefined();
    expect(document.querySelector('[data-print-slide]:not([data-print-slide="cover"]):not([data-print-slide="contents"])')).toBeNull();
    await act(async () => answer(json(FAVICONS)));
    await waitFor(() => expect(window.__blazonPrint?.ready).toBe(true));
    expect(chapters().at(-1)).toBe('favicons');
  });
});
