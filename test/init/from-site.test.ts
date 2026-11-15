import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { runDrift } from '../../src/cli/commands/drift.js';
import { cleanTitle } from '../../src/core/init/from-site/index.js';
import { toHex } from '../../src/core/init/shared/hex.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { REPO } from '../support/paths.js';
import { tempDir } from '../support/project';

// `blazon init --from <url>`: the first colors, fonts and logo come from a live site. No test touches the network:
// the page and its stylesheet are served from a local server on a free port.

const SHEET = `
:root {
  --brand-primary: #635DFF;
  --brand-accent: rgb(0, 200, 120);
  --color-secondary: #112233;
  --surface-page: #fafafa;
  --space-md: 1rem;
  --font-body: 'Inter', system-ui, sans-serif;
}
body { font-family: var(--font-body); }
h1, h2 { font-family: "Fancy Display", Georgia, serif; }
`;

const LOGO = '<svg viewBox="0 0 10 10"><script>alert(1)</script><path onclick="x()" fill="currentColor" d="M0 0h10v10z"/></svg>';

const PAGE = `<!doctype html><html><head>
<title>Acme Corp | Payments for everyone</title>
<link rel="stylesheet" href="/site.css">
<link rel="icon" href="/favicon.png">
</head><body><header><a href="/about">About</a><a href="/">${LOGO}</a></header></body></html>`;

const PAGE_RASTER = `<html><head><title>Raster - tagline</title><link rel="stylesheet" href="/site.css"><link rel="apple-touch-icon" href="/touch.png"></head><body></body></html>`;

const SHEET_NAMED = ':root { --brand-primary: #ff4f40; --brand-accent: #635dff; --brand-blue: #3885ff; --brand-blue-light: #88b6ff; --brand-navy: #0b1120; }';
const PAGE_NAMED = `<html><head><title>Complete Digital Solution for Your Business</title>
<meta property="og:site_name" content="Auth0"><meta name="description" content="Identity and access for apps."><link rel="stylesheet" href="/named.css"></head><body></body></html>`;

const SHEET_BLUE = ':root { --brand-primary: #2563eb; }';
const PAGE_BLUE = `<html><head><title>Blue</title><link rel="stylesheet" href="/blue.css"></head><body></body></html>`;
const SHEET_VARIANT = ':root { --brand-primary: #ff4f40; --brand-primary-hover: #d54438; --color-foreground: #0b1120; --surface-card: #ffffff; }';
const SHEET_NOISE =
  ':root { --brand-primary: #ff4f40; --surface-tint: #ffdcd9; --foreground: #0b1120; --business-blue-foreground: #ffffff; --destructive-foreground: #fafafa; --pm-surface-on-dark: #ffffff0d; --text-on-light: #111111; --brand-glow: rgba(255, 79, 64, 0.4); --brand-wash: rgb(255 79 64 / 20%); }';
const PAGE_NOISE = `<html><head><title>Noise</title><link rel="stylesheet" href="/noise.css"></head><body></body></html>`;
const PAGE_VARIANT = `<html><head><title>Variant</title><link rel="stylesheet" href="/variant.css"></head><body></body></html>`;

const PAGE_MANIFEST = `<html><head><title>Long tagline for the home page</title><link rel="manifest" href="/app.webmanifest"><link rel="stylesheet" href="/named.css"></head><body></body></html>`;

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') return void res.setHeader('content-type', 'text/html').end(PAGE);
    if (req.url === '/raster') return void res.setHeader('content-type', 'text/html').end(PAGE_RASTER);
    if (req.url === '/named') return void res.setHeader('content-type', 'text/html').end(PAGE_NAMED);
    if (req.url === '/noise') return void res.setHeader('content-type', 'text/html').end(PAGE_NOISE);
    if (req.url === '/noise.css') return void res.setHeader('content-type', 'text/css').end(SHEET_NOISE);
    if (req.url === '/blue') return void res.setHeader('content-type', 'text/html').end(PAGE_BLUE);
    if (req.url === '/blue.css') return void res.setHeader('content-type', 'text/css').end(SHEET_BLUE);
    if (req.url === '/variant') return void res.setHeader('content-type', 'text/html').end(PAGE_VARIANT);
    if (req.url === '/variant.css') return void res.setHeader('content-type', 'text/css').end(SHEET_VARIANT);
    if (req.url === '/manifest') return void res.setHeader('content-type', 'text/html').end(PAGE_MANIFEST);
    if (req.url === '/app.webmanifest')
      return void res.setHeader('content-type', 'application/manifest+json').end(JSON.stringify({ name: 'Acme - Everything payments', short_name: 'Acme' }));
    if (req.url === '/named.css') return void res.setHeader('content-type', 'text/css').end(SHEET_NAMED);
    if (req.url === '/site.css') return void res.setHeader('content-type', 'text/css').end(SHEET);
    if (req.url === '/empty') return void res.setHeader('content-type', 'text/html').end('<html><head><title>Empty</title></head><body></body></html>');
    if (req.url === '/touch.png') return void res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
afterEach(() => vi.restoreAllMocks());

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const json = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('reading values', () => {
  it('converts rgb() to hex and refuses other colors', () => {
    expect(toHex('#ABC')).toEqual({ hex: '#aabbcc', exact: true });
    expect(toHex('rgb(0, 200, 120)')).toEqual({ hex: '#00c878', exact: false });
    expect(toHex('rgba(0 0 0 / 50%)')?.hex).toBe('#00000080');
    expect(toHex('rgba(0, 0, 0, 0.5)')?.hex).toBe('#00000080');
    expect(toHex('hsl(10, 10%, 10%)')).toBeUndefined();
  });

  it('cuts a tagline from a title', () => {
    expect(cleanTitle('Acme | Payments')).toBe('Acme');
    expect(cleanTitle('Acme - Payments')).toBe('Acme');
    expect(cleanTitle('Acme : Payments')).toBe('Acme');
    expect(cleanTitle('Acme &amp; Sons-Co')).toBe('Acme & Sons-Co');
  });
});

describe('blazon init --from', () => {
  it('writes colors, fonts, logo and title from the site, and blazon drift then finds none', async () => {
    quiet();
    const dir = path.join(tempDir(), 'acme');
    expect(await runInit(dir, { from: `${base}/` })).toBe(0);

    const colors = json(dir, 'tokens/colors.json');
    const brand = colors.color.brand;
    expect(brand.primary.$value).toBe('#635dff');
    expect(brand.primary.$extensions['dev.blazon'].source).toMatchObject({ cssVar: '--brand-primary', doc: expect.stringContaining(`${base}/ stylesheet, read `) });
    expect(brand.$extensions['dev.blazon'].review.status).toBe('needs-review');
    expect(brand.$extensions['dev.blazon'].review.note).toContain(`Read from ${base}/ on `);
    expect(colors.color.secondary.$value).toBe('#112233');
    expect(colors.color.secondary.$extensions['dev.blazon'].source.cssVar).toBe('--color-secondary');
    expect(colors.color.surface.page.$value).toBe('#fafafa');
    // rgb() is converted, and cannot be compared by drift, so it names no cssVar
    expect(brand.accent.$value).toBe('#00c878');
    expect(brand.accent.$extensions['dev.blazon'].source.cssVar).toBeUndefined();
    // the site's primary is the brand's signal: interactive.primary points at it, and the starter's orange and yellow go
    expect(colors.interactive.primary.$value).toBe('{color.brand.primary}');
    expect(colors.interactive.primary.$extensions['dev.blazon'].source.cssVar).toBe('--brand-primary');
    expect(colors.interactive.primary.$extensions['dev.blazon'].review.status).toBe('needs-review');
    expect(colors.color.signal).toBeUndefined();
    // blazon's other vocabulary is not replaced by names the site does not have
    expect(colors.brand).toBeUndefined();
    expect(colors.gradient).toBeUndefined();

    const type = json(dir, 'tokens/typography.json');
    expect(type.font.family.body.$value).toEqual(['Inter', 'sans-serif']);
    expect(type.font.family.body.$extensions['dev.blazon'].source).toMatchObject({ locator: 'body { font-family }, from --font-body' });
    expect(type.font.family.body.$extensions['dev.blazon'].source.cssVar).toBeUndefined();
    expect(type.font.family.display.$value).toEqual(['Fancy Display', 'serif']);
    expect(type.font.family.display.$extensions['dev.blazon'].review.note).toContain('Fancy Display must be added to fonts');
    // the site names no monospace font: blazon's stays, and says so
    expect(type.font.family.mono.$extensions['dev.blazon'].review.note).toContain("Still blazon's mono font");

    const dark = fs.readFileSync(path.join(dir, 'assets/logos/site.svg'), 'utf8');
    expect(dark).toContain('fill="#111111"');
    expect(dark).not.toMatch(/script|onclick/);
    expect(fs.readFileSync(path.join(dir, 'assets/logos/site-white.svg'), 'utf8')).toContain('fill="#ffffff"');
    const sidecar = json(dir, 'assets/logos/site-white.json');
    expect(sidecar).toMatchObject({ background: 'dark', review: { status: 'needs-review' } });

    const config = fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8');
    expect(config).toContain('title: "Acme Corp"');
    expect(config).toContain('logo: { onLight: "./assets/logos/site.svg", onDark: "./assets/logos/site-white.svg" }');
    // the site's stylesheet replaces the starter's, and the starter's own font file (the mono family the tokens still name) stays listed
    expect(config).toContain(
      "fonts: [\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap\", { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-Regular-latin.woff2', weight: 400 }, { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-SemiBold-latin.woff2', weight: 600 }]",
    );
    expect(config).toContain("fontDisplay: 'font.family.display'"); // the theme already names the display family

    // the project still loads, and every token that names a variable matches the site
    const data = await compileBlazonData(await loadConfig(dir), dir);
    expect(data.tokens.items.some((t) => t.blazon.source?.cssVar === '--brand-primary')).toBe(true);
    expect(await runDrift(`${base}/`, { cwd: dir })).toBe(0);
  });

  it('does not take foreground, on-dark or on-light values or translucent colors for brand colors', async () => {
    quiet();
    const dir = tempDir();
    expect(await runInit(dir, { from: `${base}/noise` })).toBe(0);
    const color = json(dir, 'tokens/colors.json').color;
    expect(color.brand.primary.$value).toBe('#ff4f40');
    expect(color.surface.tint.$value).toBe('#ffdcd9');
    expect(color.foreground.$value).toBe('#0b1120');
    const written = JSON.stringify(color);
    for (const noise of ['business', 'destructive', 'on-dark', 'pm', 'glow', 'wash']) expect(Object.keys(color)).not.toContain(noise);
    for (const hex of ['#ffffff0d', '#fafafa', '#ff4f4066', '#ff4f4033']) expect(written).not.toContain(hex);
    expect(color.text).toBeUndefined();
  });

  it('saves a raster icon when there is no SVG, and says so', async () => {
    quiet();
    const log = vi.mocked(console.log);
    const dir = path.join(tempDir(), 'r');
    expect(await runInit(dir, { from: `${base}/raster` })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'assets/logos/site.png')).length).toBe(4);
    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8')).toContain('logo: "./assets/logos/site.png"');
    expect(log.mock.calls.flat().join('\n')).toMatch(/raster icon/);
  });

  it('exits 2 and leaves the starter copy when the site cannot be read', async () => {
    quiet();
    const dir = path.join(tempDir(), 'x');
    expect(await runInit(dir, { from: `${base}/missing` })).toBe(2);
    expect(fs.existsSync(path.join(dir, 'tokens/colors.json'))).toBe(true);
    expect(json(dir, 'tokens/colors.json').color.signal.orange.$value).toBe('#FF5A1F');
    expect(fs.existsSync(path.join(dir, 'assets/logos/site.svg'))).toBe(false);
  });

  it('says nothing was read when the site gives no color, font or logo, and tells the user to add a logo', async () => {
    quiet();
    const log = vi.mocked(console.log);
    const dir = path.join(tempDir(), 'e');
    expect(await runInit(dir, { from: `${base}/empty` })).toBe(0);
    const intro = fs.readFileSync(path.join(dir, 'docs/01-principles.md'), 'utf8');
    expect(intro).toContain('Nothing could be read from');
    expect(intro).toContain("still blazon's own starter");
    expect(intro).not.toContain('were read from');
    const out = log.mock.calls.flat().join('\n');
    expect(out).toMatch(/Add your logo: the book still shows blazon's own/);
  });

  it('names only what it read on the intro page, and what is still the starter', async () => {
    quiet();
    const dir = path.join(tempDir(), 'p');
    expect(await runInit(dir, { from: `${base}/blue` })).toBe(0);
    const intro = fs.readFileSync(path.join(dir, 'docs/01-principles.md'), 'utf8');
    expect(intro).toMatch(/The colors in this brand book were read from/);
    expect(intro).toMatch(/The fonts and logo were not found, so they are still blazon's own starter: replace them/);
  });

  it('prints no next steps after a site that could not be read, and says how to start from it', async () => {
    quiet();
    const err = vi.mocked(console.error);
    const log = vi.mocked(console.log);
    const dir = path.join(tempDir(), 'u');
    expect(await runInit(dir, { from: `${base}/missing` })).toBe(2);
    expect(log.mock.calls.flat().join('\n')).not.toContain('Next steps');
    expect(err.mock.calls.flat().join('\n')).toMatch(/run blazon init again with --from in a new folder/);
  });

  it('refuses an address that is not http(s) before writing anything', async () => {
    quiet();
    const dir = path.join(tempDir(), 'f');
    expect(await runInit(dir, { from: 'file:///etc/passwd' })).toBe(2);
    expect(await runInit(dir, { from: 'ftp://example.com' })).toBe(2);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('only changes files it just created', async () => {
    quiet();
    const dir = path.join(tempDir(), 'e');
    fs.mkdirSync(path.join(dir, 'tokens'), { recursive: true });
    const mine = '{"color":{"$type":"color","mine":{"$value":"#010203"}}}';
    fs.writeFileSync(path.join(dir, 'tokens/colors.json'), mine);
    fs.writeFileSync(path.join(dir, 'blazon.config.ts'), "export default { title: 'Mine', logo: './x.svg' };\n");
    expect(await runInit(dir, { from: `${base}/` })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'tokens/colors.json'), 'utf8')).toBe(mine);
    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8')).toContain("title: 'Mine'");
    expect(json(dir, 'tokens/typography.json').font.family.body.$value).toEqual(['Inter', 'sans-serif']);
  });

  it('keeps an existing logo sidecar, and does not write the image beside it', async () => {
    quiet();
    const dir = path.join(tempDir(), 'sidecar');
    fs.mkdirSync(path.join(dir, 'assets/logos'), { recursive: true });
    const mine = '{"title":"My own notes"}';
    fs.writeFileSync(path.join(dir, 'assets/logos/site.json'), mine);
    expect(await runInit(dir, { from: `${base}/` })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'assets/logos/site.json'), 'utf8')).toBe(mine);
    expect(fs.existsSync(path.join(dir, 'assets/logos/site.svg'))).toBe(false);
  });

  it("names the book after the site's own name, takes its description, and points interactive.primary at its primary", async () => {
    quiet();
    const dir = path.join(tempDir(), 'auth0-brand');
    expect(await runInit(dir, { from: `${base}/named` })).toBe(0);
    const config = fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8');
    expect(config).toContain('title: "Auth0"');
    expect(config).toContain('description: "Identity and access for apps."');
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.interactive.primary.$value).toMatch(/^\{color\.brand\.primary/);
    // the other brand colors the site names are kept as primitives, nothing aliases them
    expect(colors.color.brand.accent.$value).toBe('#635dff');
    expect(colors.color.brand.blue).toBeDefined();
  });

  it("takes the name from the site's web manifest when the page does not state one", async () => {
    quiet();
    const dir = path.join(tempDir(), 'any-folder');
    expect(await runInit(dir, { from: `${base}/manifest` })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8')).toContain('title: "Acme"');
  });

  describe('starter leftovers', () => {
    const errors = async (dir: string) => (await compileBlazonData(await loadConfig(dir), dir)).findings.filter((f) => f.severity === 'error');

    it("leaves no dangling alias, removes blazon's unused signal colors and says so", async () => {
      quiet();
      const log = vi.mocked(console.log);
      const dir = path.join(tempDir(), 'auth0-brand');
      expect(await runInit(dir, { from: `${base}/named` })).toBe(0);
      expect(await errors(dir)).toEqual([]);
      const colors = json(dir, 'tokens/colors.json');
      expect(colors.color.signal).toBeUndefined();
      expect(colors.color.ink.graphite).toBeDefined(); // text.primary and the rules still use it
      const out = log.mock.calls.flat().join('\n');
      expect(out).toMatch(/Removed color\.signal\.orange/);
      expect(out).toMatch(/Re-pointed interactive\.primary/);
    });

    it("re-points text and surface tokens at the site's foreground and card, and leaves a role the site has no color for", async () => {
      quiet();
      const dir = path.join(tempDir(), 'v');
      expect(await runInit(dir, { from: `${base}/variant` })).toBe(0);
      const colors = json(dir, 'tokens/colors.json');
      expect(colors.text.primary.$value).toBe('{color.foreground}');
      expect(colors.surface.canvas.$value).toBe('{color.surface.card}');
      expect(colors.surface.background.$value).toBe('{color.base.bone}'); // the site has no background color: left as it was
      expect(await errors(dir)).toEqual([]);
    });

    it("gives the label on the site's primary the ink that reads, and the contrast pair follows the primary", async () => {
      quiet();
      const dark = path.join(tempDir(), 'dark');
      expect(await runInit(dark, { from: `${base}/blue` })).toBe(0); // #2563eb: graphite is under AA on it, bone is not
      const colors = json(dark, 'tokens/colors.json');
      expect(colors.text.onSignal.$value).toBe('{color.base.bone}');
      const pair = colors.text.$extensions['dev.blazon'].pairs.find((p: { fg: string }) => p.fg === '{text.onSignal}');
      expect(pair.bg).toBe('{color.brand.primary}');
      expect(await errors(dark)).toEqual([]);

      const light = path.join(tempDir(), 'light');
      expect(await runInit(light, { from: `${base}/named` })).toBe(0); // #ff4f40: graphite reaches AA
      const kept = json(light, 'tokens/colors.json');
      expect(kept.text.onSignal.$value).toBe('{color.ink.graphite}');
      expect(kept.text.$extensions['dev.blazon'].pairs.find((p: { fg: string }) => p.fg === '{text.onSignal}').bg).toBe('{color.brand.primary}');
    });

    it("deletes blazon's logo when the site's logo was written, and keeps it when none was", async () => {
      quiet();
      const dir = path.join(tempDir(), 'a');
      expect(await runInit(dir, { from: `${base}/` })).toBe(0);
      for (const name of ['blazon-graphite', 'blazon-bone', 'blazon-mark']) {
        expect(fs.existsSync(path.join(dir, `assets/logos/${name}.svg`))).toBe(false);
        expect(fs.existsSync(path.join(dir, `assets/logos/${name}.json`))).toBe(false);
      }
      // the site's #635dff is under AA with both of blazon's inks: init said so, and blazon check reports exactly that
      expect((await errors(dir)).map((f) => f.code)).toEqual(['contrast']);

      const bare = path.join(tempDir(), 'b');
      expect(await runInit(bare, { from: `${base}/named` })).toBe(0);
      expect(fs.existsSync(path.join(bare, 'assets/logos/blazon-graphite.svg'))).toBe(true);
      expect(fs.existsSync(path.join(bare, 'assets/logos/blazon-graphite.json'))).toBe(true);
      expect(fs.existsSync(path.join(bare, 'assets/logos/blazon-mark.svg'))).toBe(true);
    });

    it('rewrites the intro page with the name, the description, the address and the date', async () => {
      quiet();
      const dir = path.join(tempDir(), 'i');
      expect(await runInit(dir, { from: `${base}/named` })).toBe(0);
      const intro = fs.readFileSync(path.join(dir, 'docs/01-principles.md'), 'utf8');
      expect(intro).toContain('# Auth0');
      expect(intro).toContain('Identity and access for apps.');
      expect(intro).toContain(`${base}/named`);
      expect(intro).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(intro).toMatch(/brand owner/);
      expect(intro).not.toContain('Built to spec');
      // The other pages stay blazon's text. The only change is a directive that names tokens the site does not have, which loses them
      const starter = fs.readFileSync(path.join(REPO, 'examples/blazon/docs/03-color.md'), 'utf8');
      const color = fs.readFileSync(path.join(dir, 'docs/03-color.md'), 'utf8');
      expect(color.replace(/<!-- blazon:tokens[^>]*-->\n/, '')).toBe(starter.replace(/<!-- blazon:tokens[^>]*-->\n/, ''));
      expect(color).not.toMatch(/blazon:tokens[^>]*color\.signal/);
    });
  });
});
