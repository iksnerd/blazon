import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../../support/spawn';
import { MANIFEST, NAME } from '../../../../src/shipped/logo-geometry/request.js';
import { ROOT_DIR } from '../../support/spec.js';
import { tempDir } from '../../../support/project';

// blazon.logo-geometry, the plugin blazon ships to measure a brand's logos. The measuring is held by the other files here; this runs the entry as
// blazon starts it, on a site that is only the files the plugin reads, and checks what it writes and what it says.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/logo-geometry/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to read a PNG with');
  console.warn('logo-geometry plugin test: PNG tests skipped, no Chrome to read a PNG with (set BLAZON_CHROME)');
}

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${body}</svg>`;
const PLUS = svg('<rect x="15" y="0" width="10" height="40"/><rect x="0" y="15" width="40" height="10"/>');
const L = svg('<rect x="0" y="0" width="10" height="40"/><rect x="10" y="30" width="30" height="10"/>');

const asset = (id: string, format = 'svg') => ({ id, name: id.split('/')[1], category: id.split('/')[0], file: `brand-assets/${id}.${format}`, format });

/** A built site that is only the files the plugin reads, and the brand.json that describes it. */
const world = (files: Record<string, string | Buffer>, assets: object[], theme?: object) => {
  const siteDir = tempDir('blazon-logo-geometry-site-');
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
  for (const [file, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
    fs.writeFileSync(path.join(siteDir, file), data);
  }
  return { siteDir, brand: { format: 'blazon-brand', version: 1, assets, ...(theme && { theme }) } };
};

const plugin = (input: string, env: Record<string, string> = {}, args: string[] = []) => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr };
};

const run = (w: ReturnType<typeof world>, options: object, env: Record<string, string> = {}) => {
  const outDir = tempDir('blazon-logo-geometry-out-');
  const ran = plugin(JSON.stringify({ v: 1, type: 'build', options, brand: w.brand, site_dir: w.siteDir, out_dir: outDir }), env);
  const findings = ran.status === 0 ? (JSON.parse(ran.out).findings as { code: string; severity: string; path: string; message: string }[]) : [];
  return { ran, outDir, findings, files: fs.readdirSync(outDir).sort() };
};

const SITE = () =>
  world({ 'brand-assets/logos/plus.svg': PLUS, 'brand-assets/logos/ell.svg': L, 'brand-assets/marks/plus.svg': PLUS }, [asset('logos/plus'), asset('logos/ell'), asset('marks/plus')]);

describe('the entry, as blazon starts it', () => {
  it('prints its manifest', () => {
    const ran = plugin('', {}, ['--blazon-manifest']);
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.out)).toEqual(MANIFEST);
  });

  it('measures every logo of the logos category, writes a report and a figure for each SVG, and has no finding for a brand that asks for nothing', () => {
    const { ran, findings, files, outDir } = run(SITE(), {});
    expect(ran.status, ran.out).toBe(0);
    expect(findings).toEqual([]);
    expect(files).toEqual(['ell-construction.svg', 'geometry.json', 'plus-construction.svg']);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, 'geometry.json'), 'utf-8'));
    expect(Object.keys(report)).toEqual(['logos/ell', 'logos/plus']);
    expect(report['logos/plus'].axes).toEqual(['mirror-x', 'mirror-y', 'rot180', 'rot90']);
    expect(report['logos/ell'].axes).toEqual([]);
    expect(fs.readFileSync(path.join(outDir, 'plus-construction.svg'), 'utf-8')).toContain('aria-label="logos/plus construction"');
  });

  it('writes the same bytes for the same brand', () => {
    const a = run(SITE(), { grid: 5 });
    const b = run(SITE(), { grid: 5 });
    for (const file of a.files) expect(fs.readFileSync(path.join(a.outDir, file), 'utf-8')).toBe(fs.readFileSync(path.join(b.outDir, file), 'utf-8'));
  });

  it('is a check: an axis the options require and a logo lacks is an error, and a logo that holds it is not', () => {
    const { findings } = run(SITE(), { require: ['mirror-x'] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: `${NAME}/axis-not-held`, severity: 'error', path: 'logos/ell' });
    expect(findings[0]!.message).toMatch(/^logos\/ell lacks mirror-x: its silhouette scores 0\.\d\d and 0\.97 is needed$/);
  });

  it('says rot90 cannot be tested on a logo that is not nearly square', () => {
    const w = world({ 'brand-assets/logos/bar.svg': svg('<rect width="40" height="10"/>') }, [asset('logos/bar')]);
    expect(run(w, { require: ['rot90'] }).findings[0]!.message).toMatch(/cannot be tested for rot90: that axis is measured only on a logo that is nearly square/);
  });

  it('lists the points off a stated grid as a warning, five at most', () => {
    const w = world({ 'brand-assets/logos/odd.svg': svg('<polygon points="1,1 7,1 7,7 1,7 3,3 4,3 5,3 6,3 8,3 9,3"/>') }, [asset('logos/odd')]);
    const [off] = run(w, { grid: 5 }).findings;
    expect(off).toMatchObject({ code: `${NAME}/off-grid`, severity: 'warning', path: 'logos/odd' });
    expect(off!.message).toMatch(/off the grid of 5: \(1, 1\), \(7, 1\), \(7, 7\), \(1, 7\), \(3, 3\) and \d+ more$/);
  });

  it('measures the logos it is named, from any category, and only them', () => {
    const { findings, files } = run(SITE(), { logos: ['marks/plus', { id: 'logos/ell', require: ['mirror-y'] }] });
    expect(files).toEqual(['ell-construction.svg', 'geometry.json', 'plus-construction.svg']);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/axis-not-held`]);
  });

  it('gives a figure its whole id when another logo already has its name', () => {
    const { files } = run(SITE(), { logos: ['logos/plus', 'marks/plus'] });
    expect(files).toEqual(['geometry.json', 'marks-plus-construction.svg', 'plus-construction.svg']);
  });

  it('writes no figure or no report when asked not to', () => {
    expect(run(SITE(), { figures: false }).files).toEqual(['geometry.json']);
    expect(run(SITE(), { report: false }).files).toEqual(['ell-construction.svg', 'plus-construction.svg']);
  });

  it('draws the figure in the brand accent unless the options say another, and never in a color that could close the attribute', () => {
    const w = world({ 'brand-assets/logos/plus.svg': PLUS }, [asset('logos/plus')], { roles: { accent: '#0a1b2c' } });
    const figure = (options: object) => fs.readFileSync(path.join(run(w, options).outDir, 'plus-construction.svg'), 'utf-8');
    expect(figure({})).toContain('stroke="#0a1b2c"');
    expect(figure({ accent: 'teal' })).toContain('stroke="teal"');
    expect(figure({ accent: 'red" onload="x' })).toContain('stroke="#0a1b2c"');
  });

  it('answers a wrong option with a finding and exit 0, and measures the rest', () => {
    const { ran, findings, files } = run(SITE(), { tolerance: 7 });
    expect(ran.status).toBe(0);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/option-invalid`]);
    expect(files).toContain('geometry.json');
  });

  it('warns about a logo it cannot measure, and errors when the logo was named', () => {
    const w = world({ 'brand-assets/logos/words.svg': svg('<text>Acme</text>'), 'brand-assets/logos/plus.svg': PLUS }, [asset('logos/words'), asset('logos/plus')]);
    expect(run(w, {}).findings).toEqual([expect.objectContaining({ code: `${NAME}/not-measured`, severity: 'warning', path: 'logos/words' })]);
    expect(run(w, { logos: ['logos/words'] }).findings).toEqual([expect.objectContaining({ code: `${NAME}/not-measured`, severity: 'error' })]);
    expect(run(w, {}).findings[0]!.message).toMatch(/live text: convert it to outlines/);
  });

  it('says what it did not read in a logo it did measure', () => {
    const w = world({ 'brand-assets/logos/s.svg': svg('<rect width="40" height="40" fill="#000" stroke="#f00"/>') }, [asset('logos/s')]);
    expect(run(w, {}).findings).toEqual([expect.objectContaining({ code: `${NAME}/reading-limited`, severity: 'warning' })]);
  });

  it('reports a file that is not in the site, and does not read a path that leaves it', () => {
    const w = world({}, [asset('logos/gone'), { ...asset('logos/out'), file: '../../etc/passwd' }]);
    const { findings, files } = run(w, {});
    expect(findings.map((f) => [f.code, f.path])).toEqual([[`${NAME}/file-missing`, 'logos/gone'], [`${NAME}/file-missing`, 'logos/out']]);
    expect(files).toEqual([]);
  });

  it('has nothing to do for a brand with no logos, and writes nothing', () => {
    const { ran, findings, files } = run(world({}, []), {});
    expect(ran.status).toBe(0);
    expect(findings).toEqual([]);
    expect(files).toEqual([]);
  });

  it('answers a request that is not for a build, or has no site, with exit 2 and the reason first', () => {
    const outDir = tempDir('blazon-logo-geometry-out-');
    expect(plugin(JSON.stringify({ v: 1, type: 'check', brand: {} }))).toMatchObject({ status: 2, out: expect.stringMatching(/^the request is for the check role; this plugin is a build plugin/) });
    expect(plugin(JSON.stringify({ v: 1, type: 'build', site_dir: '/nonexistent', out_dir: outDir }))).toMatchObject({ status: 2, out: 'site_dir has no index.html' });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });
});

describe.skipIf(!CHROME)('a PNG, read with the browser', () => {
  // A plus drawn as a PNG by the browser itself, so the test needs no image file in the repository
  const png = async () => {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: CHROME });
    try {
      const page = await browser.newPage({ viewport: { width: 80, height: 80 } });
      await page.setContent(`<body style="margin:0;background:transparent"><svg width="80" height="80" viewBox="0 0 40 40"><rect x="15" width="10" height="40"/><rect y="15" width="40" height="10"/></svg></body>`);
      return await page.screenshot({ type: 'png', omitBackground: true });
    } finally {
      await browser.close();
    }
  };

  it('measures it like the vector it was drawn from', async () => {
    const w = world({ 'brand-assets/logos/plus.png': await png() }, [asset('logos/plus', 'png')]);
    const { findings, outDir, files } = run(w, { require: ['mirror-x', 'rot90'] }, { BLAZON_CHROME: CHROME });
    expect(findings).toEqual([]);
    expect(files).toEqual(['geometry.json']);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, 'geometry.json'), 'utf-8'));
    expect(report['logos/plus'].axes).toEqual(['mirror-x', 'mirror-y', 'rot180', 'rot90']);
    expect(report['logos/plus'].grid).toBeNull();
  }, 60_000);

  it('says so when the file is not a picture', async () => {
    const w = world({ 'brand-assets/logos/bad.png': Buffer.from('not a png') }, [asset('logos/bad', 'png')]);
    const { findings } = run(w, {}, { BLAZON_CHROME: CHROME });
    expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/not-measured`, message: expect.stringMatching(/not a picture the browser can decode/) })]);
  }, 60_000);
});

describe('a PNG, with no browser', () => {
  it('is skipped with a warning while the SVGs are still measured', () => {
    const w = world({ 'brand-assets/logos/plus.svg': PLUS, 'brand-assets/logos/p.png': Buffer.from('x') }, [asset('logos/plus'), asset('logos/p', 'png')]);
    const { findings, files } = run(w, {}, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(findings).toEqual([expect.objectContaining({ code: `${NAME}/raster-skipped`, severity: 'warning', path: 'logos/p' })]);
    expect(findings[0]!.message).toMatch(/no browser to read the PNG and WebP logos with/);
    expect(files).toEqual(['geometry.json', 'plus-construction.svg']);
  });
});
