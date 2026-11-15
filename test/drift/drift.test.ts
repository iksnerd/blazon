import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDrift } from '../../src/cli/commands/drift.js';
import { compareValues, customProperties, normalizeColor, normalizeDimension } from '../../src/core/drift/compare.js';
import { readCss } from '../../src/core/drift/read.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { checkTokens } from '../../src/core/checker/index.js';
import { tempDir, tempProject } from '../support/project';

// `blazon drift`: tokens that declare the CSS variable they were read from are compared with the live stylesheet.
// No test touches the network: a page and its stylesheet are served from a local server on a free port.

const SHEET = `
/* brand */
:root {
  --brand-primary: #635DFF;
  --brand-short: #F0A;
  --brand-alpha: #11223380;
  --space-md: 1.0rem;
  --radius: 4px;
  --font: Inter, sans-serif;
  --alias: var(--brand-primary);
}
.dark { --brand-primary: #000000; }
`;

const PAGE = `<!doctype html><html><head>
<link rel="stylesheet" href="/site.css">
<link rel="preload" href="/nope.css" as="style">
<link rel="stylesheet" href="ftp://example.com/x.css">
</head><body></body></html>`;

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') return void res.setHeader('content-type', 'text/html').end(PAGE);
    if (req.url === '/site.css') return void res.setHeader('content-type', 'text/css').end(SHEET);
    if (req.url === '/big') return void res.end(Buffer.alloc(5 * 1024 * 1024 + 1, 97));
    if (req.url === '/broken') return void res.end('<link rel="stylesheet" href="/missing.css">');
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
afterEach(() => vi.restoreAllMocks());

const token = (value: unknown, type: string, cssVar?: string) => ({
  $type: type,
  $value: value,
  ...(cssVar && { $extensions: { 'dev.blazon': { source: { doc: 'site', locator: 'css', cssVar } } } }),
});

const project = () =>
  tempProject({
    'tokens/brand.json': {
      color: {
        primary: token('#635dff', 'color', '--brand-primary'),
        short: token('#ff00aa', 'color', '--brand-short'),
        alpha: token('#11223380', 'color', '--brand-alpha'),
        off: token('#ffffff', 'color', '--brand-alpha-not-set'),
        free: token('#000000', 'color'),
      },
      space: { md: token({ value: 1, unit: 'rem' }, 'dimension', '--space-md'), radius: token({ value: 8, unit: 'px' }, 'dimension', '--radius') },
      font: { body: token(['Inter', 'sans-serif'], 'fontFamily', '--font') },
    },
  });

function capture() {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  return lines;
}

describe('normalizing values', () => {
  it('colors compare as lowercase hex, 3-digit expanded, 8-digit alpha kept', () => {
    expect(normalizeColor('#635DFF')).toBe('#635dff');
    expect(normalizeColor('#F0A')).toBe('#ff00aa');
    expect(normalizeColor('#F0A8')).toBe('#ff00aa88');
    expect(normalizeColor(' #11223380 ')).toBe('#11223380');
    expect(normalizeColor('RGB(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });

  it('dimensions compare as number and unit', () => {
    expect(normalizeDimension('1.0rem')).toBe('1rem');
    expect(normalizeDimension('16PX')).toBe('16px');
    expect(normalizeDimension('.5rem')).toBe('0.5rem');
    expect(normalizeDimension('1rem')).not.toBe(normalizeDimension('16px'));
  });

  it('other types compare as trimmed lowercase strings', () => {
    expect(compareValues('fontFamily', 'Inter, sans-serif', '  inter,  sans-serif ')).toBe(true);
    expect(compareValues('fontFamily', 'Inter', 'Roboto')).toBe(false);
    expect(compareValues('number', '1.5', '1.5')).toBe(true);
  });
});

describe('reading custom properties', () => {
  it('takes the last declaration of a name, ignores comments, and follows var()', () => {
    const vars = customProperties(`/* --x: #111; */ a { --x: #222; } b { --x: #333 } c { --y: var(--x); --z: var(--none, red); --self: var(--self); }`);
    expect(vars.get('--x')).toBe('#333');
    expect(vars.get('--y')).toBe('#333');
    expect(vars.get('--z')).toBe('var(--none, red)');
    expect(vars.get('--self')).toBe('var(--self)');
  });

  it('prefers a declaration in a :root or html rule over a later one elsewhere', () => {
    const vars = customProperties(`:root { --a: #111; --b: #111; } .dark { --a: #222; --c: #222; } html { --b: #333; } :root { --b: #444; }`);
    expect(vars.get('--a')).toBe('#111');
    expect(vars.get('--b')).toBe('#444');
    expect(vars.get('--c')).toBe('#222');
  });
});

describe('reading the CSS to compare with', () => {
  it('reads the stylesheets a page links, resolved against the page, and skips what is not http(s) or not a stylesheet', async () => {
    const { css, sources } = await readCss(`${base}/`);
    expect(sources).toEqual([`${base}/site.css`]);
    expect(css).toContain('--brand-primary');
  });

  it('reads a local file', async () => {
    const file = path.join(tempDir(), 'site.css');
    fs.writeFileSync(file, SHEET);
    const { css, sources } = await readCss(file);
    expect(sources).toEqual([file]);
    expect(css).toBe(SHEET);
  });

  it('fails on a missing file, a 404 page, a failing stylesheet and an oversize stylesheet', async () => {
    await expect(readCss(path.join(tempDir(), 'none.css'))).rejects.toThrow(/none\.css/);
    await expect(readCss(`${base}/gone`)).rejects.toThrow(/404/);
    await expect(readCss(`${base}/broken`)).rejects.toThrow(/missing\.css.*404|404.*missing\.css/);
    await expect(readCss(`${base}/big`)).rejects.toThrow(/5 MB/);
    await expect(readCss('ftp://example.com/x.css')).rejects.toThrow(/http/);
  });
});

describe('blazon drift', () => {
  it('prints ok, drift and missing, and exits 1', async () => {
    const lines = capture();
    const code = await runDrift(`${base}/`, { cwd: project() });
    const out = lines.join('\n');
    expect(code).toBe(1);
    expect(out).toMatch(/ok\s+color\.primary/);
    expect(out).toMatch(/ok\s+color\.short/);
    expect(out).toMatch(/ok\s+color\.alpha/);
    expect(out).toMatch(/ok\s+space\.md/);
    expect(out).toMatch(/ok\s+font\.body/);
    expect(out).toMatch(/drift\s+space\.radius.*8px.*4px/);
    expect(out).toMatch(/missing\s+color\.off.*--brand-alpha-not-set/);
    expect(out).not.toContain('color.free');
    expect(out).toMatch(/5 ok, 1 drifted, 1 missing/);
  });

  it('exits 0 when nothing drifted, from a local file', async () => {
    const root = tempProject({ 'tokens/brand.json': { color: { primary: token('#635dff', 'color', '--brand-primary') } } });
    const file = path.join(tempDir(), 'site.css');
    fs.writeFileSync(file, SHEET);
    const lines = capture();
    expect(await runDrift(file, { cwd: root })).toBe(0);
    expect(lines.join('\n')).toMatch(/1 ok, 0 drifted, 0 missing/);
  });

  it('prints the findings as JSON', async () => {
    const lines = capture();
    const code = await runDrift(`${base}/`, { cwd: project(), json: true });
    const report = JSON.parse(lines.join('\n'));
    expect(code).toBe(1);
    expect(report.summary).toEqual({ ok: 5, drift: 1, missing: 1 });
    expect(report.sources).toEqual([`${base}/site.css`]);
    expect(report.tokens).toContainEqual({ path: 'space.radius', cssVar: '--radius', status: 'drift', expected: '8px', actual: '4px' });
    expect(report.tokens).toContainEqual({ path: 'color.off', cssVar: '--brand-alpha-not-set', status: 'missing', expected: '#ffffff' });
  });

  it('reads the tokens from --tokens', async () => {
    const root = tempProject({ 'elsewhere/brand.json': { color: { primary: token('#111111', 'color', '--brand-primary') } } });
    const file = path.join(tempDir(), 'site.css');
    fs.writeFileSync(file, SHEET);
    const lines = capture();
    expect(await runDrift(file, { cwd: root, tokens: 'elsewhere' })).toBe(1);
    expect(lines.join('\n')).toMatch(/drift\s+color\.primary.*#111111.*#635dff/);
  });

  it('exits 2 and says so when no token declares a cssVar, because a gate that compares nothing passes for the wrong reason', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = tempProject({ 'tokens/brand.json': { color: { free: token('#000000', 'color') } } });
    expect(await runDrift(`${base}/`, { cwd: root })).toBe(2);
    expect(err.mock.calls.join('\n')).toMatch(/no token declares a source\.cssVar/i);
  });

  it('exits 2 for a missing argument and for a fetch error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runDrift(undefined, { cwd: project() })).toBe(2);
    expect(await runDrift(`${base}/gone`, { cwd: project() })).toBe(2);
    expect(err).toHaveBeenCalledTimes(2);
  });
});

describe('the cssVar field', () => {
  it('is an error when it is not a custom property name', async () => {
    const root = tempProject({ 'tokens/brand.json': { color: { a: token('#000000', 'color', 'brand-primary') } } });
    const data = await compileBlazonData(await loadConfig(root), root);
    const found = checkTokens(data).errors.filter((f) => f.code === 'source-css-var-invalid');
    expect(found.map((f) => f.path)).toEqual(['color.a']);
  });

  it('passes when it starts with two hyphens', async () => {
    const root = tempProject({ 'tokens/brand.json': { color: { a: token('#000000', 'color', '--brand-primary') } } });
    const data = await compileBlazonData(await loadConfig(root), root);
    expect(checkTokens(data).all).toEqual([]);
  });
});
