import { describe, it, expect } from 'vitest';
import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { printBook, waitFor } from '../../../src/shipped/print-book/print.js';
import { jobFor, MANIFEST } from '../../../src/shipped/print-book/request.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { EXTERNAL } from '../../../scripts/plugin-externals.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// blazon.print-book, the plugin blazon ships to print a brand book to a PDF of 16:9 slides and a PowerPoint file of the
// same slides, in TypeScript on npm packages (playwright-core, pptxgenjs, pdf-lib): no Python, no uv. Seams: the request
// (what a build request asks it to print), and the entry, run as blazon runs it, in a real browser.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/print-book/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const PPTX_INFO = path.join(ROOT_DIR, 'test/deck/python/pptx_info.py');
const NAME = 'blazon.print-book';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
// No browser skips the browser tests and says so; a machine that has one sets BLAZON_REQUIRE_CHROME=1 to make that a failure
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book plugin test: browser tests skipped, no Chrome to print with (set BLAZON_CHROME)');
}


interface Ran {
  status: number | null;
  out: string;
  err: string;
}
/** The entry, started as blazon starts a plugin: one request on standard input and only the variables it is given. */
const plugin = (input: string, env: Record<string, string> = {}, args: string[] = []): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const cannot = (ran: Ran, reason: RegExp | string): void => {
  expect(ran.status, ran.out + ran.err).toBe(2);
  expect(ran.out.split('\n')[0]).toMatch(reason instanceof RegExp ? reason : new RegExp(`^${reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
};

/**
 * A site that plays the viewer: on `#print…` it lays out `slides` frames of 1280x720 ([data-print-slide]), each saying its
 * number, the hash it was loaded with and whether print media was on, then (if `ready`) sets window.__blazonPrint with
 * `claim` pages and the page numbers it says it `clipped`, after `delay` milliseconds.
 */
const site = (slides = 3, { claim = slides, ready = true, delay = 300, clipped = [] }: { claim?: number; ready?: boolean; delay?: number; clipped?: number[] } = {}): string => {
  const dir = tempDir('blazon-print-site-');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html><head><meta charset="utf-8"><title>fake viewer</title>
<style>
  @page { size: 1280px 720px; margin: 0 }
  html, body { margin: 0 }
  [data-print-slide] { width: 1280px; height: 720px; overflow: hidden; break-after: page; font: 40px sans-serif; background: #123456; color: #fff }
  [data-print-slide]:last-child { break-after: auto }
</style></head>
<body><main id="app">live viewer</main>
<script>
  const media = matchMedia('print').matches ? 'media print' : 'media screen';
  if (location.hash.startsWith('#print')) {
    setTimeout(() => {
      const app = document.getElementById('app');
      app.textContent = '';
      for (let i = 1; i <= ${slides}; i++) {
        const slide = document.createElement('div');
        slide.setAttribute('data-print-slide', 'content');
        slide.textContent = 'slide ' + i + ' hash ' + location.hash + ' ' + media;
        app.appendChild(slide);
      }
      if (${ready}) window.__blazonPrint = { ready: true, pages: ${claim}, clipped: ${JSON.stringify(clipped)} };
    }, ${delay});
  }
</script></body></html>
`,
  );
  return dir;
};

const request = (siteDir: string, options: object = {}, extra: object = {}): { text: string; outDir: string } => {
  const outDir = tempDir('blazon-print-out-');
  return { text: JSON.stringify({ v: 1, type: 'build', options, brand: { format: 'blazon-brand', version: 1 }, site_dir: siteDir, out_dir: outDir, ...extra }), outDir };
};
const pageCount = async (pdf: string): Promise<number> => (await PDFDocument.load(fs.readFileSync(pdf))).getPageCount();
const pptx = (file: string): { slides: number; size: string } => JSON.parse(spawnSync('python3', ['-I', PPTX_INFO, file], { encoding: 'utf-8' }).stdout);
const browser = { BLAZON_CHROME: CHROME };

describe('the print-book plugin: what a request asks it to print', () => {
  const req = (options: unknown, extra: object = {}) => JSON.stringify({ v: 1, type: 'build', options, brand: {}, site_dir: site(1), out_dir: tempDir('blazon-print-out-'), ...extra });

  it.each([
    ['no options', {}, '#print', 'brand-book'],
    ['the full preset', { preset: 'full' }, '#print', 'brand-book'],
    ['the essentials preset', { preset: 'essentials' }, '#print/essentials', 'brand-book-essentials'],
    ['the reference preset', { preset: 'reference' }, '#print/reference', 'brand-book-reference'],
    ['chosen pages', { pages: ['doc/logo', 'tokens/colors'] }, '#print/pages=doc/logo,tokens/colors', 'brand-book-pages'],
    ['a title', { title: 'Acme Logo' }, '#print?title=Acme%20Logo', 'brand-book'],
    ['a preset with a title and subtitle', { preset: 'essentials', title: 'A', subtitle: 'B' }, '#print/essentials?title=A&subtitle=B', 'brand-book-essentials'],
    [
      'a title with markup, a quote, an ampersand and Bulgarian letters',
      { pages: ['doc/logo'], title: `Q&A <b> "x" Бранд` },
      `#print/pages=doc/logo?title=${encodeURIComponent('Q&A <b> "x" Бранд')}`,
      'brand-book-pages',
    ],
  ])('prints %s', (_, options, hash, name) => {
    const job = jobFor(req(options));
    expect([job.hash, job.name]).toEqual([hash, name]);
  });

  it.each([
    ['not JSON', '{ nope', 'the request is not JSON'],
    ['not an object', '[]', 'the request is not a JSON object'],
    ['another version', JSON.stringify({ v: 2, type: 'build' }), 'the request is version 2; this plugin speaks version 1'],
    ['another role', JSON.stringify({ v: 1, type: 'check' }), 'the request is for the check role; this plugin is a build plugin'],
  ])('refuses a request that is %s', (_, text, reason) => {
    expect(() => jobFor(text)).toThrow(reason);
  });

  it.each([
    ['options that are not an object', [], 'options must be an object'],
    ['an unknown preset', { preset: 'all' }, 'preset must be full, essentials or reference'],
    ['pages that are not a list of ids', { pages: 'doc/logo' }, 'pages must be a non-empty list of chapter ids'],
    ['an empty list of pages', { pages: [] }, 'pages must be a non-empty list of chapter ids'],
    ['a page id with a comma', { pages: ['doc/a,doc/b'] }, 'pages must be a non-empty list of chapter ids'],
    ['an empty title', { title: '' }, 'title must be a non-empty string of at most 120 characters with no control character'],
    ['a title that is not a string', { title: 7 }, 'title must be a non-empty string of at most 120 characters with no control character'],
    ['a title of 121 characters', { title: 'x'.repeat(121) }, 'title must be a non-empty string of at most 120 characters'],
    ['a title with a newline', { title: 'one\ntwo' }, 'title must be a non-empty string'],
    ['a title with a control character', { title: 'one\u0007two' }, 'title must be a non-empty string'],
    ['an empty subtitle', { subtitle: '' }, 'subtitle must be a non-empty string of at most 200 characters with no control character'],
    ['a subtitle of 201 characters', { subtitle: 'x'.repeat(201) }, 'subtitle must be a non-empty string of at most 200 characters'],
    ['a subtitle that is not a string', { subtitle: ['a'] }, 'subtitle must be a non-empty string'],
    ['a subtitle with a tab', { subtitle: 'a\tb' }, 'subtitle must be a non-empty string'],
    ['an unknown option', { heading: 'x' }, 'unknown option "heading"'],
    ['a page id with a question mark', { pages: ['doc/a?b'] }, 'pages must be a non-empty list of chapter ids'],
    ['a preset and pages together', { preset: 'full', pages: ['doc/logo'] }, 'give a preset or pages, not both'],
  ])('refuses %s', (_, options, reason) => {
    expect(() => jobFor(req(options))).toThrow(reason);
  });

  it('takes a title of exactly 120 characters and a subtitle of exactly 200', () => {
    const job = jobFor(req({ title: 'x'.repeat(120), subtitle: 'y'.repeat(200) }));
    expect(job.hash).toBe(`#print?title=${'x'.repeat(120)}&subtitle=${'y'.repeat(200)}`);
  });

  it('refuses a site_dir with no index.html, or an out_dir that is not a folder', () => {
    expect(() => jobFor(JSON.stringify({ v: 1, type: 'build', options: {}, site_dir: tempDir('blazon-empty-'), out_dir: tempDir('o-') }))).toThrow('site_dir has no index.html');
    expect(() => jobFor(JSON.stringify({ v: 1, type: 'build', options: {}, site_dir: site(1), out_dir: '/nonexistent/out' }))).toThrow('out_dir is not a folder');
  });

  it('declares the build role, a version and the one variable it reads', () => {
    expect(MANIFEST).toEqual({ v: 2, roles: ['build'], title: 'Print book', description: expect.any(String), version: '2.0.0', timeout_ms: 60000, env: ['BLAZON_CHROME'] });
    expect(MANIFEST.description.length).toBeLessThanOrEqual(160);
  });
});

describe('the print-book plugin, shipped in blazon\'s package', () => {
  const program = path.join(ROOT_DIR, 'plugins/blazon.print-book/bin/blazon-blazon.print-book.🔌');

  it('is in the files the package publishes, with a program that node runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    expect(pkg.files).toContain('plugins');
    expect(fs.statSync(program).mode & 0o111).toBe(0o111);
    expect(fs.readFileSync(program, 'utf-8').split('\n')[0]).toBe('#!/usr/bin/env node');
  });

  it('starts, as the package lays it out, with no dist/ beside it: the program holds the code built from src/shipped/print-book/main.ts', () => {
    // the package's layout in a folder of its own: plugins/ and node_modules, and no dist/
    const pkg = tempDir('blazon-print-pkg-');
    fs.cpSync(path.join(ROOT_DIR, 'plugins'), path.join(pkg, 'plugins'), { recursive: true });
    fs.copyFileSync(path.join(ROOT_DIR, 'package.json'), path.join(pkg, 'package.json'));
    fs.symlinkSync(path.join(ROOT_DIR, 'node_modules'), path.join(pkg, 'node_modules'));
    expect(fs.existsSync(path.join(pkg, 'dist'))).toBe(false);
    const ran = spawnSync(process.execPath, [path.join(pkg, 'plugins/blazon.print-book/bin/blazon-blazon.print-book.🔌'), '--blazon-manifest'], { encoding: 'utf-8', env: { PATH: '/usr/bin:/bin' } });
    expect(ran.status, ran.stderr).toBe(0);
    expect(JSON.parse(ran.stdout)).toEqual(MANIFEST);
  }, 60_000);

  it('keeps its npm libraries out of the bundle, so they come from blazon\'s dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    const code = fs.readFileSync(program, 'utf-8');
    for (const lib of EXTERNAL) {
      expect(code).toContain(`require("${lib}")`);
      expect(Object.keys(pkg.dependencies)).toContain(lib);
    }
  });

  it('bundles pptxgenjs, so a consumer does not install its old image-size (an override in blazon\'s package.json reaches only blazon\'s own install)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    expect(fs.readFileSync(program, 'utf-8')).not.toMatch(/require\(["']pptxgenjs/);
    expect(Object.keys(pkg.dependencies)).not.toContain('pptxgenjs');
    expect(Object.keys(pkg.devDependencies)).toContain('pptxgenjs');
  });
});

describe('the print-book plugin, as blazon starts it', () => {
  it('prints its manifest', () => {
    const ran = plugin('', {}, ['--blazon-manifest']);
    expect(ran.status, ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual(MANIFEST);
  });

  it('exits 2 with the reason on its first line, and writes nothing, when the request is bad', () => {
    const { outDir } = request(site(1));
    cannot(plugin('{ nope'), 'the request is not JSON');
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('answers a wrong option with an option-invalid finding and exit 0, writes nothing and needs no browser', () => {
    const { text, outDir } = request(site(1), { preset: 'all' });
    const ran = plugin(text, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out).findings).toEqual([{ code: `${NAME}/option-invalid`, severity: 'error', path: 'options', message: 'preset must be full, essentials or reference' }]);
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('exits 2 with the install hint when BLAZON_CHROME names no program', () => {
    const { text } = request(site(1));
    cannot(plugin(text, { BLAZON_CHROME: '/nonexistent/chrome' }), /^no browser to print with: BLAZON_CHROME names \/nonexistent\/chrome, which is not a program/);
  });
});

describe('the print-book plugin: its time', () => {
  const job = { siteDir: tempDir('blazon-time-'), outDir: tempDir('blazon-time-out-'), hash: '#print', name: 'brand-book' };

  it('stops with the reason before it starts, when the time blazon gives a call is already spent, without touching the browser', async () => {
    await expect(printBook({} as never, job, 30, Date.now() - 1)).rejects.toThrow(/did not finish in 55 seconds/);
  });

  it('never gives the page longer than what is left of the call', () => {
    expect(waitFor(30, Date.now() + 10_000)).toBeLessThanOrEqual(10_000);
    expect(waitFor(30, Date.now() + 120_000)).toBe(30_000);
    expect(waitFor(5, Date.now() + 120_000)).toBe(5000);
  });
});

describe.skipIf(!CHROME)('the print-book plugin, in a real browser', () => {
  it('prints the full book: a PDF and a PowerPoint file of the same slides, and no findings', async () => {
    const { text, outDir } = request(site(3));
    const ran = plugin(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual({ findings: [] });
    expect(fs.readdirSync(outDir)).toEqual(['brand-book.pdf', 'brand-book.pptx']);
    expect(await pageCount(path.join(outDir, 'brand-book.pdf'))).toBe(3);
    // 13.333 x 7.5 in, PowerPoint's widescreen, in EMU
    expect(pptx(path.join(outDir, 'brand-book.pptx'))).toEqual({ slides: 3, size: '12192000x6858000' });
  }, 120_000);

  it('prints each preset into its own files', () => {
    for (const [options, name] of [[{ preset: 'essentials' }, 'brand-book-essentials'], [{ preset: 'reference' }, 'brand-book-reference'], [{ pages: ['doc/logo'] }, 'brand-book-pages']] as const) {
      const { text, outDir } = request(site(2), options);
      expect(plugin(text, browser).status).toBe(0);
      expect(fs.readdirSync(outDir)).toEqual([`${name}.pdf`, `${name}.pptx`]);
    }
  }, 180_000);

  it('turns print media on before the page lays out, and loads the hash asked for', () => {
    const { text, outDir } = request(site(1), { preset: 'essentials' });
    expect(plugin(text, browser).status).toBe(0);
    const words = spawnSync('pdftotext', [path.join(outDir, 'brand-book-essentials.pdf'), '-'], { encoding: 'utf-8' });
    expect(words.status, 'pdftotext (poppler) reads the PDF').toBe(0);
    expect(words.stdout).toContain('slide 1 hash #print/essentials media print');
  }, 120_000);

  it('exits 2 and writes nothing when the page never says it is laid out', () => {
    const { text, outDir } = request(site(2, { ready: false }));
    cannot(plugin(text, { ...browser, BLAZON_PRINT_SECONDS: '2' }), 'the page did not set window.__blazonPrint.ready in 2 seconds');
    expect(fs.readdirSync(outDir)).toEqual([]);
  }, 120_000);

  it('warns, and still writes the book, when the PDF has another number of pages than the page laid out', async () => {
    const { text, outDir } = request(site(2, { claim: 3 }));
    const ran = plugin(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual({
      findings: [{ code: `${NAME}/page-count`, severity: 'warning', path: 'brand-book.pdf', message: 'the page laid out 3 slides, and the PDF has 2 pages' }],
    });
    expect(await pageCount(path.join(outDir, 'brand-book.pdf'))).toBe(2);
  }, 120_000);

  it('warns, naming the pages, when the page says slides are cut off at the foot, and still writes the book', async () => {
    const { text, outDir } = request(site(2, { clipped: [3, 4] }));
    const ran = plugin(text, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const { findings } = JSON.parse(ran.out);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: `${NAME}/slide-clipped`, severity: 'warning', path: 'brand-book.pdf' });
    expect(findings[0].message).toContain('pages 3, 4 of the PDF are cut off');
    expect(findings[0].message).toContain('shorten it or split it');
    expect(await pageCount(path.join(outDir, 'brand-book.pdf'))).toBe(2);
  }, 120_000);

  describe('when blazon.favicons has a folder beside it', () => {
    /** out_dir as blazon makes it, <tokensOutDir>/blazon.print-book, with blazon.favicons' folder (and a favicons.json in it) beside it */
    const withFaviconsFolder = (siteDir: string) => {
      const tokens = tempDir('blazon-print-tokens-');
      fs.mkdirSync(path.join(tokens, 'blazon.favicons'));
      fs.writeFileSync(path.join(tokens, 'blazon.favicons/favicons.json'), '{}');
      const outDir = path.join(tokens, 'blazon.print-book');
      fs.mkdirSync(outDir);
      return { text: request(siteDir, {}, { out_dir: outDir }).text };
    };

    it('warns that the site has no copy of it, so the book has no Favicons chapter, and still prints', () => {
      const ran = plugin(withFaviconsFolder(site(2)).text, browser);
      expect(ran.status, ran.out + ran.err).toBe(0);
      const { findings } = JSON.parse(ran.out);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ code: `${NAME}/favicons-not-in-site`, severity: 'warning', path: 'brand-book.pdf' });
      expect(findings[0].message).toContain('list blazon.favicons before blazon.print-book');
    }, 120_000);

    it('is quiet when the site has the copy, which is what listing blazon.favicons first gives', () => {
      const siteDir = site(2);
      fs.mkdirSync(path.join(siteDir, 'favicons'));
      fs.writeFileSync(path.join(siteDir, 'favicons/favicons.json'), '{}');
      const ran = plugin(withFaviconsFolder(siteDir).text, browser);
      expect(JSON.parse(ran.out)).toEqual({ findings: [] });
    }, 120_000);

    it('is quiet when there is no such folder: a brand without the plugin gets no new finding', () => {
      expect(JSON.parse(plugin(request(site(2)).text, browser).out)).toEqual({ findings: [] });
    }, 120_000);
  });
});

describe('the site server', () => {
  it('answers a malformed address with 400 and keeps serving, instead of ending the plugin', async () => {
    const dir = tempDir('blazon-serve-');
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    const server = await serve(dir);
    try {
      expect((await fetch(`${server.origin}/%E0%A4%A`)).status).toBe(400);
      expect((await fetch(`${server.origin}/`)).status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
