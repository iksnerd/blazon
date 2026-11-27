import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { tempDir } from '../support/project';

// `blazon init --minimal` with the options that edit the files a minimal book does not have: the fonts, the pages, the dark theme and the
// resolver. Each edit tolerates their absence and leaves a project that compiles with no error.

const SHEET = ':root { --brand-primary: #e00000; } body { font-family: "Inter", sans-serif; }';
const PAGE = '<html><head><title>Acme | Payments</title><meta name="description" content="Payments for all."><link rel="stylesheet" href="/s.css"></head><body></body></html>';
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') return void res.setHeader('content-type', 'text/html').end(PAGE);
    if (req.url === '/s.css') return void res.setHeader('content-type', 'text/css').end(SHEET);
    res.statusCode = 404;
    res.end();
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
const errors = async (dir: string) => (await compileBlazonData(await loadConfig(dir), dir)).findings.filter((f) => f.severity === 'error');
const SVG = '<svg viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10z"/></svg>';

describe('blazon init --minimal with answers', () => {
  it('sets the name, color, font and logo, adds a font stylesheet to a config that had none, and compiles clean', async () => {
    quiet();
    const dir = path.join(tempDir(), 'acme');
    const logo = path.join(tempDir(), 'acme.svg');
    fs.writeFileSync(logo, SVG);
    expect(await runInit(dir, { minimal: true, name: 'Acme', color: '#e00000', font: 'Inter', logo })).toBe(0);
    const config = json(dir, 'blazon.json');
    expect(config.title).toBe('Acme');
    expect(config.logo).toBe('./assets/logos/acme.svg');
    expect(config.fonts).toEqual([expect.stringContaining('family=Inter')]);
    expect(config.sections).toEqual([]);
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.text.onSignal.$value).toBe('{color.base.white}');
    expect(json(dir, 'tokens/typography.json').font.family.body.$value).toEqual(['Inter', 'sans-serif']);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-mark.svg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'docs'))).toBe(false);
    expect(await errors(dir)).toEqual([]);
  });
});

describe('blazon init --minimal --from', () => {
  it("writes the site's colors, fonts and logo over the four token files, with no page to rewrite, and compiles clean", async () => {
    quiet();
    const dir = path.join(tempDir(), 'site');
    expect(await runInit(dir, { minimal: true, from: `${base}/` })).toBe(0);
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.color.brand.primary.$value).toBe('#e00000');
    expect(colors.interactive.primary.$value).toBe('{color.brand.primary}');
    expect(colors.text.onSignal.$value).toBe('{color.base.white}');
    expect(json(dir, 'blazon.json').title).toBe('Acme');
    expect(fs.existsSync(path.join(dir, 'docs'))).toBe(false);
    expect(await errors(dir)).toEqual([]);
  });
});
