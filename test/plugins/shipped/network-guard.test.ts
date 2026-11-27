import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Browser, Route } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { tempDir } from '../../support/project';
import { guardHandler, guardNetwork, originOf, takeBlocked } from '../../../src/shipped/shared/network.js';
import { png as faviconPng, sheet as faviconSheet } from '../../../src/shipped/favicons/raster.js';
import { svgToPng } from '../../../src/shipped/logo-kit/render.js';
import { decodeRaster } from '../../../src/shipped/logo-geometry/decode.js';
import { drawPdf } from '../../../src/shipped/press-kit/pdf.js';
import { printBook } from '../../../src/shipped/print-book/print.js';
import { jobFor } from '../../../src/shipped/print-book/request.js';
import { NAME as FAVICONS } from '../../../src/shipped/favicons/request.js';
import { NAME as PRESS_KIT } from '../../../src/shipped/press-kit/request.js';
import { NAME as PRINT_BOOK } from '../../../src/shipped/print-book/request.js';
import { NAME as SOCIAL_CARDS } from '../../../src/shipped/social-cards/request.js';
import { CHROME, cardOf, run as runCards, world as cardsWorld } from './social-cards/helpers.js';

// A page a plugin draws loads only what the plugin serves itself. A brand's CSS, font, SVG or image that names a remote address must
// make no request: not to a made-up host over http or https, not to the metadata address 169.254.169.254, not to the private 10.0.0.1,
// and not to a loopback port that the plugin does not serve. A local listener stands in for "the network": it counts connections.

const PRIVATE = ['http://169.254.169.254/latest/x?token=secret', 'http://10.0.0.1/a.css'];
const MADE_UP = ['http://assets.acme-fonts.test/a.png?key=secret', 'https://assets.acme-fonts.test/b.woff2'];

let listener: net.Server;
let hits = 0;
let loopback = '';
let browser: Browser;

beforeAll(async () => {
  listener = net.createServer((socket) => {
    hits++;
    socket.destroy();
  });
  await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
  loopback = `http://127.0.0.1:${(listener.address() as net.AddressInfo).port}`;
  if (CHROME) browser = await launchBrowser(CHROME);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => listener.close(() => done()));
});

beforeEach(() => {
  hits = 0;
  takeBlocked('x');
});

/** Every address a hostile brand can name, in the forms a page can ask for it. */
const hostile = () => [...PRIVATE, ...MADE_UP, `${loopback}/probe?q=secret`];
const asSvg = (inner = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40"><style>@import url(${hostile()[0]});</style>${hostile()
    .map((url) => `<image href="${url}" width="10" height="10"/>`)
    .join('')}${inner}<rect width="40" height="40" fill="#123456"/></svg>`;
const asHtml = () =>
  `<link rel="stylesheet" href="${hostile()[0]}"><style>@import url(${hostile()[1]!});body{background:url(${loopback}/bg)}</style>${hostile().map((url) => `<img src="${url}">`).join('')}`;

/** The origins named in the findings of one plugin, in order. */
const origins = (plugin: string) => takeBlocked(plugin).map((f) => f.message.split(' ')[0]);

describe('the guard of a drawn page', () => {
  const fake = (url: string) => {
    const seen: string[] = [];
    const route = { request: () => ({ url: () => url }), continue: async () => void seen.push('continue'), abort: async () => void seen.push('abort'), fulfill: async () => void seen.push('fulfill') };
    return { route: route as unknown as Route, seen };
  };

  it('passes data:, blob:, about: and the origins it serves, and aborts every other request', async () => {
    const served: string[] = [];
    const handle = guardHandler({ page: 'a.pdf', origins: ['http://deck.local'], serve: (url, route) => {
        served.push(url.pathname);
        return route.fulfill({ body: '' });
      } });
    const outcome = async (url: string) => {
      const { route, seen } = fake(url);
      await handle(route);
      return seen[0];
    };
    for (const ok of ['data:text/css,a{}', 'blob:null/abc', 'about:blank']) expect(await outcome(ok)).toBe('continue');
    expect(await outcome('http://deck.local/deck.html')).toBe('fulfill');
    expect(served).toEqual(['/deck.html']);
    for (const bad of [...hostile(), 'http://deck.local.evil.test/x', 'file:///etc/passwd', 'ftp://acme.test/x', 'not a url']) expect(await outcome(bad), bad).toBe('abort');
  });

  it('continues a request to an origin it serves when it has no handler for it', async () => {
    const { route, seen } = fake('http://127.0.0.1:9/index.html');
    await guardHandler({ page: 'a.pdf', origins: ['http://127.0.0.1:9'] })(route);
    expect(seen).toEqual(['continue']);
  });

  it('reports one finding per blocked origin with the page, and never a path or a query string', async () => {
    const handle = guardHandler({ page: 'acme-book.pdf' });
    for (const url of [...hostile(), 'http://assets.acme-fonts.test/again.png?key=other']) await handle(fake(url).route);
    const findings = takeBlocked('blazon.print-book');
    expect(findings.map((f) => f.code)).toEqual(Array(findings.length).fill('blazon.print-book/network-blocked'));
    expect(findings.map((f) => f.message.split(' ')[0])).toEqual([...new Set(hostile().map((url) => originOf(url)))].sort());
    for (const f of findings) {
      expect(f.severity).toBe('warning');
      expect(f.path).toBe('acme-book.pdf');
      expect(f.message).not.toMatch(/secret|token|\?|\/latest|\/probe/);
      expect(f.message).toContain('fonts config');
    }
    expect(takeBlocked('blazon.print-book')).toEqual([]);
  });
});

describe.skipIf(!CHROME)('a page of each plugin, in a real browser', () => {
  it('the guard lets a served origin answer and blocks the rest, as the deck uses it', async () => {
    const page = await browser.newPage();
    try {
      await guardNetwork(page, { page: 'deck.pdf', origins: ['http://deck.local'], serve: (url, route) => route.fulfill({ contentType: 'text/html', body: `<p>${url.pathname}</p>` }) });
      await page.goto('http://deck.local/deck.html');
      expect(await page.textContent('p')).toBe('/deck.html');
      await page.setContent(asHtml());
      await page.waitForTimeout(300);
    } finally {
      await page.close();
    }
    expect(hits).toBe(0);
    expect(origins('blazon.brand-deck')).toContain('http://assets.acme-fonts.test');
  });

  it('favicons: a logo that names remote images makes no request, and the finding says which origins', async () => {
    await faviconPng(browser, asSvg(), 32, true);
    await faviconSheet(browser, asHtml(), 200, 100, 'body{margin:0}');
    expect(hits).toBe(0);
    const blocked = origins(FAVICONS);
    expect(blocked).toEqual(expect.arrayContaining([originOf(loopback), 'http://assets.acme-fonts.test', 'https://assets.acme-fonts.test']));
  }, 60_000);

  it('logo-kit: an SVG that names remote images makes no request', async () => {
    await svgToPng(browser, asSvg(), { width: 40, height: 40 }, 1);
    expect(hits).toBe(0);
  }, 60_000);

  it('logo-geometry: decoding a picture makes no request', async () => {
    const page = await browser.newPage();
    const pixel = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    await page.close();
    const decoded = await decodeRaster(browser, Buffer.from(pixel, 'base64'), 'png');
    expect(decoded.width).toBe(2);
    expect(hits).toBe(0);
  }, 60_000);

  it('press-kit: an embedded stylesheet that names remote files makes no request, and the finding says which', async () => {
    const data = (css: string) => `data:text/css;base64,${Buffer.from(css).toString('base64')}`;
    const sheets = [data(`@import url(${hostile()[0]});`), data(`@font-face{font-family:"Acme";src:url(${MADE_UP[1]})}body,h1{font-family:Acme;background:url(${loopback}/bg)}`)];
    const pdf = await drawPdf(
      {
        brand: { title: 'Acme', description: '', roles: {}, stylesheets: sheets } as never,
        colors: [],
      },
      { BLAZON_CHROME: CHROME },
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(hits).toBe(0);
    expect(origins(PRESS_KIT)).toEqual(expect.arrayContaining([originOf(loopback), 'http://169.254.169.254']));
  }, 60_000);

  it('print-book: a site page that names remote files makes no request, and the finding says which', async () => {
    const siteDir = tempDir('blazon-guard-site-');
    fs.writeFileSync(
      path.join(siteDir, 'index.html'),
      `<!doctype html><meta charset="utf-8">${asHtml()}<div data-print-slide>Acme</div><script>window.__blazonPrint={ready:true,pages:1,clipped:[]}</script>`,
    );
    const job = jobFor(JSON.stringify({ v: 2, type: 'build', options: {}, brand: {}, site_dir: siteDir, out_dir: tempDir('blazon-guard-out-') }));
    const printed = await printBook(browser, job, 20);
    expect(printed.pages).toBe(1);
    expect(hits).toBe(0);
    const blocked = takeBlocked(PRINT_BOOK);
    expect(blocked.map((f) => f.message.split(' ')[0])).toEqual(expect.arrayContaining([originOf(loopback), 'http://assets.acme-fonts.test']));
    expect(blocked.every((f) => f.path === `${job.name}.pdf`)).toBe(true);
  }, 90_000);

  it('social-cards: a font stylesheet that names remote files makes no request, and the finding says which', () => {
    const w = cardsWorld();
    (w.brand as { theme: { fonts: string[] } }).theme.fonts = [`${loopback}/a.css`, ...MADE_UP, ...PRIVATE];
    const { ran, findings, outDir } = runCards(w, { cards: [cardOf()] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
    const blocked = findings.filter((f) => f.code === `${SOCIAL_CARDS}/network-blocked`);
    expect(blocked.map((f) => f.message.split(' ')[0])).toEqual(
      expect.arrayContaining([originOf(loopback), 'http://assets.acme-fonts.test', 'https://assets.acme-fonts.test']),
    );
    expect(blocked.every((f) => f.severity === 'warning' && f.path === 'launch.png' && !/secret|\?/.test(f.message))).toBe(true);
  }, 120_000);
});
