import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Browser, Route } from 'playwright-core';
import { launchBrowser } from '../../support/chrome';
import { tempDir } from '../../support/project';
import { refusedAddress, type Network } from '../../../src/core/drift/fetch.js';
import { MAX_REMOTE_BYTES, MAX_REMOTE_REQUESTS, guardHandler, guardNetwork, originOf, takeBlocked } from '../../../src/shipped/shared/network.js';
import { drawCards } from '../../../src/shipped/social-cards/render.js';
import { jobFor as cardsJobFor } from '../../../src/shipped/social-cards/request.js';
import { parseOptions as parseCardOptions } from '../../../src/shipped/social-cards/options.js';
import { readBrand as readCardsBrand } from '../../../src/shipped/social-cards/brand.js';
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
/** The network the tests give blazon's fetch: no real DNS is ever asked (an unknown name does not resolve), and the loopback is refused as in production. */
const strict: Network = {
  resolve: async (host) => {
    throw new Error(`getaddrinfo ENOTFOUND ${host}`);
  },
  refused: refusedAddress,
};
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
    const route = { request: () => ({ url: () => url, resourceType: () => 'image' }), continue: async () => void seen.push('continue'), abort: async () => void seen.push('abort'), fulfill: async () => void seen.push('fulfill') };
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
    const printed = await printBook(browser, job, 20, Date.now() + 60_000, strict);
    expect(printed.pages).toBe(1);
    expect(hits).toBe(0);
    const blocked = takeBlocked(PRINT_BOOK);
    expect(blocked.map((f) => f.message.split(' ')[0])).toEqual(expect.arrayContaining([originOf(loopback), 'http://assets.acme-fonts.test']));
    expect(blocked.every((f) => f.path === `${job.name}.pdf`)).toBe(true);
  }, 90_000);

  it('social-cards: a font stylesheet that names remote files makes no request, and the finding says which', () => {
    const w = cardsWorld();
    // Only literal addresses: the entry runs as its own process, so a name would go to the real resolver
    (w.brand as { theme: { fonts: string[] } }).theme.fonts = [`${loopback}/a.css`, ...PRIVATE];
    const { ran, findings, outDir } = runCards(w, { cards: [cardOf()] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'launch.png'))).toBe(true);
    const blocked = findings.filter((f) => f.code === `${SOCIAL_CARDS}/network-blocked`);
    expect(blocked.map((f) => f.message.split(' ')[0])).toEqual(expect.arrayContaining([originOf(loopback), 'http://169.254.169.254', 'http://10.0.0.1']));
    expect(blocked.every((f) => f.severity === 'warning' && f.path === 'launch.png' && !/secret|\?/.test(f.message))).toBe(true);
  }, 120_000);
});

// A brand that lists a Google Fonts stylesheet keeps its fonts: blazon, not the browser, reads the stylesheet and the font files it names,
// under the address policy of `init --from`. A local server stands in for the public hosts, and the test network says made-up names resolve to
// it and that its loopback address may be used; every other address stays refused as in production, so a private address makes no connection.

describe.skipIf(!CHROME)('a remote stylesheet, font or image, read by blazon under the address policy', () => {
  let server: http.Server;
  let port = 0;
  let served: string[] = [];
  let lab: Network;
  const FONT = fs.readFileSync(path.join(__dirname, '../../../examples/blazon/fonts/IBMPlexMono-Regular-latin.woff2'));
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const BIG = Buffer.alloc(4 * 1024 * 1024, 1);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      served.push(`${req.headers.host?.split(':')[0]}${url.pathname}`);
      const send = (type: string, body: Buffer | string) => res.writeHead(200, { 'content-type': type }).end(body);
      if (url.pathname === '/x.css') return send('text/css; charset=utf-8', `@font-face{font-family:"Acme Mono";src:url(http://static.acme.test:${port}/f.woff2) format("woff2")}`);
      if (url.pathname === '/f.woff2') return send('font/woff2', FONT);
      if (url.pathname === '/wrong.woff2') return send('text/html', '<p>not a font</p>');
      if (url.pathname.startsWith('/big/')) return send('image/png', BIG);
      if (url.pathname.startsWith('/img/')) return send('image/png', PIXEL);
      res.writeHead(404).end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as net.AddressInfo).port;
    lab = {
      resolve: async (host) => {
        if (host.endsWith('.acme.test')) return [{ address: '127.0.0.1', family: 4 }];
        throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      },
      refused: (address) => (address === '127.0.0.1' ? undefined : refusedAddress(address)),
    };
  });
  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });
  beforeEach(() => {
    served = [];
  });

  type PageOf = import('playwright-core').Page;
  /** A page with the guard in policy mode, `html` set in it, and the page given to `then` while it is open. */
  async function inPage<T>(html: string, then: (page: PageOf) => Promise<T>, network: unknown = lab): Promise<T> {
    const page = await browser.newPage();
    try {
      await guardNetwork(page, { page: 'acme.pdf', remote: 'policy', network });
      await page.setContent(html);
      return await then(page);
    } finally {
      await page.close();
    }
  }
  const settle = (page: PageOf) => page.evaluate(() => new Promise((done) => setTimeout(done, 400)));

  it('loads a stylesheet and the font it names: the page reads the font as loaded, and no warning is raised', async () => {
    const loaded = await inPage(`<style>@import url(http://fonts.acme.test:${port}/x.css);</style><p style="font-family:'Acme Mono'">Acme</p>`, async (page) => {
      await page.evaluate(() => document.fonts.load('16px "Acme Mono"'));
      return page.evaluate(() => ({ check: document.fonts.check('16px "Acme Mono"'), faces: [...document.fonts].filter((f) => f.family.includes('Acme Mono') && f.status === 'loaded').length }));
    });
    expect(loaded).toEqual({ check: true, faces: 1 });
    expect(served).toEqual(['fonts.acme.test/x.css', 'static.acme.test/f.woff2']);
    expect(takeBlocked('blazon.print-book')).toEqual([]);
  }, 60_000);

  it('makes no connection for a private or metadata address, and warns once for each', async () => {
    await inPage(`<link rel="stylesheet" href="http://10.0.0.1/a.css?token=secret"><img src="http://169.254.169.254/x?token=secret"><img src="http://169.254.169.254/y">`, settle);
    expect(hits).toBe(0);
    expect(served).toEqual([]);
    const found = takeBlocked('blazon.print-book');
    expect(found.map((f) => f.message.split(' ')[0])).toEqual(['http://10.0.0.1', 'http://169.254.169.254']);
    for (const f of found) {
      expect(f.message).toMatch(/private address|metadata address/);
      expect(f.message).not.toMatch(/secret|token|\?/);
    }
  }, 60_000);

  it('refuses a name that resolves to a private address, with no connection', async () => {
    const rebinding: Network = { resolve: async () => [{ address: '10.0.0.1', family: 4 }], refused: refusedAddress };
    await inPage(`<img src="http://static.acme.test:${port}/img/a.png">`, settle, rebinding);
    expect(served).toEqual([]);
    expect(takeBlocked('x').map((f) => f.message.split(' ')[0])).toEqual([`http://static.acme.test:${port}`]);
  }, 60_000);

  it('aborts a font request that is answered as text/html, and warns', async () => {
    await inPage(`<style>@font-face{font-family:"Acme Bad";src:url(http://static.acme.test:${port}/wrong.woff2?key=secret)}</style><p style="font-family:'Acme Bad'">A</p>`, async (page) => {
      await page.evaluate(() => document.fonts.load('16px "Acme Bad"').catch(() => undefined));
      expect(await page.evaluate(() => document.fonts.check('16px "Acme Bad"', 'A'))).toBe(false);
    });
    expect(served).toEqual(['static.acme.test/wrong.woff2']);
    const [found, ...more] = takeBlocked('x');
    expect(more).toEqual([]);
    expect(found!.message).toMatch(/blazon wanted a font file, and the server says it is text\/html/);
    expect(found!.message).not.toMatch(/secret|\?/);
  }, 60_000);

  it('aborts what a page does not need to be drawn: a fetch from a script is never read', async () => {
    await inPage(`<script>fetch('http://static.acme.test:${port}/img/a.png').catch(() => 0)</script>`, settle);
    expect(served).toEqual([]);
    expect(takeBlocked('x')[0]!.message).toMatch(/fetch request is not something a page needs/);
  }, 60_000);

  it('reads at most the request cap and the byte cap, then warns', async () => {
    const images = Array.from({ length: MAX_REMOTE_REQUESTS + 5 }, (_, i) => `<img src="http://static.acme.test:${port}/img/${i}.png">`).join('');
    await inPage(images, settle);
    expect(served.length).toBe(MAX_REMOTE_REQUESTS);
    expect(takeBlocked('x')[0]!.message).toContain(`more than ${MAX_REMOTE_REQUESTS} remote requests`);
    served = [];
    const big = Array.from({ length: Math.ceil(MAX_REMOTE_BYTES / BIG.length) + 2 }, (_, i) => `<img src="http://static.acme.test:${port}/big/${i}.png">`).join('');
    await inPage(big, settle);
    expect(served.length).toBeLessThanOrEqual(Math.ceil(MAX_REMOTE_BYTES / BIG.length) + 1);
    expect(takeBlocked('x')[0]!.message).toMatch(/more than 20 MB/);
  }, 120_000);

  it('warns that the host could not be reached when the fetch fails, as the machine does offline', async () => {
    const offline: Network = {
      resolve: async () => {
        throw new Error('getaddrinfo ENOTFOUND fonts.acme.test');
      },
      refused: refusedAddress,
    };
    await inPage(`<link rel="stylesheet" href="http://fonts.acme.test/x.css">`, settle, offline);
    const [found] = takeBlocked('x');
    expect(found!.message.split(' ')[0]).toBe('http://fonts.acme.test');
    expect(found!.message).toContain('the host could not be reached');
  }, 60_000);

  it("a plugin that asks for remote: 'none' reads nothing remote, even from an origin the network would allow", async () => {
    const page = await browser.newPage();
    try {
      await guardNetwork(page, { page: 'a.png', remote: 'none', network: lab });
      await page.setContent(`<img src="http://static.acme.test:${port}/img/a.png">`);
      await settle(page);
    } finally {
      await page.close();
    }
    expect(served).toEqual([]);
    expect(takeBlocked('x')).toHaveLength(1);
  }, 60_000);

  it('takes its network only as a parameter: a value that is not a network, from anywhere, is the public one that refuses the loopback', async () => {
    for (const given of ['loopback-ok', { resolve: 'x' }, { refused: () => undefined }, null, 7]) {
      await inPage(`<img src="http://127.0.0.1:${port}/img/a.png">`, settle, given);
    }
    expect(served).toEqual([]);
    expect(takeBlocked('x')).toHaveLength(1);
    // The plugins are separate processes, so nothing in a request, an option or the environment can name a network: the helper reads none of them
    const source = fs.readFileSync(path.join(__dirname, '../../../src/shipped/shared/network.ts'), 'utf-8');
    expect(source).not.toMatch(/process\.env|JSON\.parse|readFileSync/);
  }, 60_000);

  it('print-book: a Google Fonts-style stylesheet and font reach the printed page through blazon', async () => {
    const siteDir = tempDir('blazon-guard-fonts-');
    fs.writeFileSync(
      path.join(siteDir, 'index.html'),
      `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="http://fonts.acme.test:${port}/x.css"><div data-print-slide style="font-family:'Acme Mono'">Acme</div><script>document.fonts.load('16px "Acme Mono"').then(()=>{window.__blazonPrint={ready:true,pages:1,clipped:[]}})</script>`,
    );
    const job = jobFor(JSON.stringify({ v: 2, type: 'build', options: {}, brand: {}, site_dir: siteDir, out_dir: tempDir('blazon-guard-out-') }));
    const printed = await printBook(browser, job, 20, Date.now() + 60_000, lab);
    expect(printed.pages).toBe(1);
    expect(served).toEqual(['fonts.acme.test/x.css', 'static.acme.test/f.woff2']);
    expect(takeBlocked(PRINT_BOOK)).toEqual([]);
  }, 90_000);

  it('social-cards: a font stylesheet named by the brand reaches the card through blazon, and a private address does not', async () => {
    const w = cardsWorld();
    (w.brand as { theme: { fonts: string[] } }).theme.fonts = [`http://fonts.acme.test:${port}/x.css`, ...PRIVATE];
    const job = cardsJobFor(JSON.stringify({ v: 2, type: 'build', options: { cards: [cardOf()] }, brand: w.brand, site_dir: w.siteDir, out_dir: tempDir('blazon-cards-out-') }));
    const brand = readCardsBrand(job.brand);
    const known = { formats: new Set(brand.formats.keys()), backgrounds: new Set(['backgrounds/dark']), colors: new Set<string>() };
    const { cards, scale } = parseCardOptions(job.options, known);
    const drawn = await drawCards(browser, job, brand, cards, scale, lab);
    expect(drawn).toHaveLength(1);
    expect(served).toContain('fonts.acme.test/x.css');
    const blocked = takeBlocked(SOCIAL_CARDS);
    expect(blocked.map((f) => f.message.split(' ')[0])).toEqual(['http://10.0.0.1', 'http://169.254.169.254']);
    expect(blocked.every((f) => f.path === 'launch.png')).toBe(true);
  }, 120_000);

  it('the manual names the network-blocked warning', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../../docs/manual/14-shipped-plugins.md'), 'utf-8')).toContain('network-blocked');
  });
});
