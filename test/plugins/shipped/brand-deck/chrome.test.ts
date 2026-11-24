import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { spawnSync } from '../../../support/spawn';
import { ROOT_DIR } from '../../support/spec.js';
import { tempDir } from '../../../support/project';
import { readBrand } from '../../../../src/shipped/brand-deck/brand.js';
import { plan } from '../../../../src/shipped/brand-deck/plan/index.js';
import { NAME } from '../../../../src/shipped/brand-deck/request.js';
import { CHROME, POPPLER, browser, fontsOf, pages, pdfOf, run, text, crowded, token, world } from './helpers.js';

if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to draw with');
  console.warn('brand-deck plugin test: browser tests skipped, no Chrome to draw with (set BLAZON_CHROME)');
}

describe.skipIf(!CHROME || !POPPLER)('the deck plugin, in a real browser', () => {
  it('draws one 16:9 page for each slide, writes only acme-brand-deck.pdf, and reports nothing for a good brand', async () => {
    const w = world();
    const { ran, outDir, findings } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings).toEqual([]);
    expect(fs.readdirSync(outDir)).toEqual(['acme-brand-deck.pdf']);
    const sizes = await pages(pdfOf(outDir));
    expect(sizes).toHaveLength(plan(readBrand(w.brand), null, () => ['x']).length);
    for (const size of sizes) expect([size.width, size.height]).toEqual([960, 540]);
  }, 120_000);

  it('states what the brand says on the right pages: the title, the contents, the print values, the logo rules, the asset text', () => {
    const { ran, outDir } = run(world());
    expect(ran.status, ran.out + ran.err).toBe(0);
    const all = text(pdfOf(outDir));
    expect(all[0]).toContain('Acme Brand Book');
    expect(all[0]).toContain('How Acme looks.');
    expect(all[1]).toContain('Contents');
    expect(all[1]).toContain('Usage');
    const colors = all.find((page) => page.includes('#1E1F21') && page.includes('RGB'))!;
    expect(colors).toContain('CMYK 10 20 30 40');
    expect(colors).toContain('PMS 426 C');
    expect(colors).toContain('RAL 7016');
    const logo = all.find((page) => page.includes('Clear space') && page.includes('24px'))!;
    expect(logo).toContain('top-left');
    const usage = all.find((page) => page.includes('Keep it clear.'))!;
    for (const phrase of ['Keep the space free', 'Crowd it', 'Source: guidelines, page 4', 'Do', "Don't"]) expect(usage).toContain(phrase);
    expect(all.find((page) => page.includes('Not specified: Usage'))).toContain('Print sizes');
  }, 120_000);

  it('hangs a wrapped line of a Do or Don\'t under its text, with no hyphen typed before the item', () => {
    const w = world();
    const long = 'Keep the space free on every side of the mark and never set anything inside it, whatever the size of the slide or the page it is printed on';
    (w.brand.assets.find((a: any) => a.id === 'usage/clear') as any).meta.do = [long];
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const page = text(pdfOf(outDir)).findIndex((slide) => slide.includes('Crowd it')) + 1;
    expect(page).toBeGreaterThan(0);
    const slide = words(pdfOf(outDir), page);
    // The bullet is the list's marker, not a character of the text
    expect(slide.filter((word) => word.text === '-')).toEqual([]);
    // The text column is the right of the image: the lines of the long item, each as far left as its words go
    const known = new Set(long.split(' '));
    const rows = new Map<number, typeof slide>();
    for (const word of slide.filter((word) => word.x > 560)) rows.set(Math.round(word.y), [...(rows.get(Math.round(word.y)) ?? []), word]);
    const lines = [...rows.values()].filter((row) => row.every((word) => known.has(word.text)));
    expect(lines.length, 'the long item is wrapped').toBeGreaterThan(2);
    const left = lines.map((row) => Math.min(...row.map((word) => word.x)));
    for (const x of left) expect(x).toBeCloseTo(left[0]!, 0);
  }, 120_000);

  it('keeps the last line of the body at least 24 points above the footer on every slide', async () => {
    const { ran, outDir } = run(crowded());
    expect(ran.status, ran.out + ran.err).toBe(0);
    const file = pdfOf(outDir);
    const count = (await pages(file)).length;
    expect(count).toBeGreaterThan(12);
    const gaps: [number, number][] = [];
    for (let page = 1; page <= count; page++) {
      const all = words(file, page);
      // The footer is the brand's title at the left and the number of the slide at the right, on one line
      const number = all.find((word) => word.text === String(page) && word.right > 880)!;
      const footer = all.filter((word) => Math.abs(word.y - number.y) < 0.5 && (word.x < 200 || word.right > 880));
      const body = all.filter((word) => !footer.includes(word));
      if (body.length > 0) gaps.push([page, number.y - Math.max(...body.map((word) => word.bottom))]);
    }
    expect(gaps.filter(([, gap]) => gap < 24)).toEqual([]);
  }, 180_000);

  it('draws the same bytes every run', () => {
    const w = world();
    const first = run(w);
    const second = run(w);
    expect(first.ran.status, first.ran.out + first.ran.err).toBe(0);
    expect(fs.readFileSync(pdfOf(first.outDir)).equals(fs.readFileSync(pdfOf(second.outDir)))).toBe(true);
  }, 180_000);

  it('leaves out the categories `skip` names, warns about a name that is none and an option it does not know, and still draws the rest', async () => {
    const w = world();
    const whole = run(w);
    const left = run(w, { skip: ['logos', 'usage', 'typo'], speed: 'fast' });
    expect(left.ran.status, left.ran.out + left.ran.err).toBe(0);
    expect(left.findings.map((f) => [f.code, f.severity, f.path])).toEqual([
      [`${NAME}/option-unknown`, 'warning', 'options.speed'],
      [`${NAME}/skip-unknown`, 'warning', 'options.skip'],
    ]);
    // Two logo slides and the one asset slide of the usage page are gone, and so are the usage page's open list
    expect((await pages(pdfOf(left.outDir))).length).toBe((await pages(pdfOf(whole.outDir))).length - 3);
    expect(text(pdfOf(left.outDir)).join('\n')).not.toContain('Keep it clear.');
  }, 180_000);

  it('exits 2 naming the file, and writes nothing, when an image is missing from the site', () => {
    const w = world({ assets: [{ id: 'usage/gone', name: 'gone', category: 'usage', file: 'brand-assets/usage/gone.svg', format: 'svg', width: 10, height: 10 }] });
    (w.brand.pages[0] as any).directives[0].args = ['usage'];
    const { ran, outDir } = run(w);
    expect(ran.status).toBe(2);
    expect(ran.out.split('\n')[0]).toContain('cannot read brand-assets/usage/gone.svg');
    expect(fs.readdirSync(outDir)).toEqual([]);
  }, 120_000);

  it("draws the category's sentence in place of an image that is not in this checkout, when the category is kept out of git", () => {
    const w = world({
      categories: [{ category: 'art', label: 'Art', local: 'Run render-art.py to draw these.' }],
      assets: [{ id: 'art/hero', name: 'hero', category: 'art', file: 'brand-assets/art/hero.png', format: 'png', width: 100, height: 100, meta: { title: 'The hero' } }],
    });
    (w.brand.pages[0] as any).directives.push({ name: 'section', args: ['art'] });
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(text(pdfOf(outDir)).find((page) => page.includes('The hero'))).toContain('Run render-art.py to draw these.');
  }, 120_000);

  it('continues a long list on slides titled "(continued)" and drops none of it', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Do statement number ${i + 1}`);
    const w = world();
    (w.brand.assets[2] as any).meta = { title: 'Many statements', do: many, dont: ['Drop one'] };
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const slides = text(pdfOf(outDir)).filter((page) => page.includes('Many statements'));
    expect(slides.length).toBeGreaterThan(1);
    expect(slides.slice(1).every((page) => page.includes('Many statements (continued)'))).toBe(true);
    for (const phrase of [...many, 'Drop one']) expect(slides.join('\n')).toContain(phrase);
    expect(slides.join('\n')).not.toMatch(/\+\d+ more/);
  }, 120_000);

  it('draws a PNG and an SVG, and the PNG is an image in the PDF where the SVG is not', () => {
    const w = world({ assets: [{ id: 'usage/photo', name: 'photo', category: 'usage', file: 'brand-assets/usage/photo.png', format: 'png', width: 180, height: 180, meta: { title: 'A photo' } }] });
    (w.brand.pages[0] as any).directives[0].args = ['usage', 'photo'];
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const listed = spawnSync('pdfimages', ['-list', pdfOf(outDir)], { encoding: 'utf-8' }).stdout.split('\n').slice(2).filter(Boolean);
    // The photo, and the mask of its transparency; the logos are vector
    expect(listed.length).toBeLessThanOrEqual(2);
    expect(listed.length).toBeGreaterThan(0);
  }, 120_000);

  it('sets the deck in the fonts of the config (a woff2 here), and says which families it could not', () => {
    const geist = path.join(ROOT_DIR, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2');
    expect(fs.existsSync(geist)).toBe(true);
    const face = `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${fs.readFileSync(geist).toString('base64')}) format("woff2");font-weight:400}`;
    const sheet = `data:text/css;base64,${Buffer.from(face).toString('base64')}`;
    const w = world({ fonts: ['https://fonts.googleapis.com/css2?family=Inter', sheet] });
    // The brand's own text style names the family the file declares
    for (const t of w.brand.tokens) if ((t as any).type === 'typography' || (t as any).type === 'fontFamily') (t as any).resolvedValue = JSON.parse(JSON.stringify((t as any).resolvedValue).replace(/Georgia/g, 'Geist'));
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fontsOf(pdfOf(outDir)).some((name) => /Geist/.test(name))).toBe(true);
    expect(text(pdfOf(outDir)).find((page) => page.includes('Typefaces'))).toContain('Set in Geist, embedded from the font files given.');
  }, 120_000);

  it('keeps Helvetica and its footnote when no font is given, and never fetches the config\'s web address', () => {
    const w = world({ fonts: ['http://127.0.0.1:1/never.css'] });
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fontsOf(pdfOf(outDir)).some((name) => /Helvetica|Arial|Liberation/.test(name))).toBe(true);
    expect(text(pdfOf(outDir)).find((page) => page.includes('Typefaces'))).toContain('Shown in Helvetica: the typeface itself is not embedded in this file.');
  }, 120_000);

  /** The words of one page with where they are, in points from the top left of the page */
  const words = (file: string, page: number): { text: string; x: number; y: number; right: number; bottom: number }[] => {
    const out = spawnSync('pdftotext', ['-bbox', '-f', String(page), '-l', String(page), file, '-'], { encoding: 'utf-8' }).stdout;
    return [...out.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({
      text: m[5]!.replace(/&amp;/g, '&'),
      x: Number(m[1]),
      y: Number(m[2]),
      right: Number(m[3]),
      bottom: Number(m[4]),
    }));
  };
  const colorTokens = (names: Record<string, string[]>) =>
    Object.entries(names).flatMap(([group, values]) => values.map((value, i) => token(`color.${group}.c${i}`, 'color', value)));

  it('lists every page in the contents, however many there are, and cuts a title wider than its column with "..."', () => {
    const long = 'A very long page title that goes on and on and on and on and on and on and on and on and on and on and on';
    const titles = [...Array.from({ length: 19 }, (_, i) => `Page number ${i + 1}`), long];
    const w = world({ pages: titles.map((title, i) => ({ slug: `p${i}`, sourceFile: `p${i}.md`, title, order: i + 1, meta: {}, sections: [], markdown: '', directives: [] })) });
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const contents = text(pdfOf(outDir))[1]!;
    for (const title of titles.slice(0, 19)) expect(contents).toContain(title);
    expect(contents).toContain('A very long page title');
    expect(contents).toContain('...');
    expect(contents).not.toContain('and on and on and on and on and on and on and on and on and on and on and on');
  }, 120_000);

  it('keeps a long list of what is left open on the divider above the footer, and says how many it left out', () => {
    const open = Array.from({ length: 40 }, (_, i) => `Open question number ${i + 1}`);
    const w = world({ categories: [{ category: 'shots', label: 'Shots', notSpecified: open, local: 'Not here.' }] });
    (w.brand.pages[0] as any).directives = [{ name: 'section', args: ['shots'] }];
    (w.brand as any).assets.push({ id: 'shots/one', name: 'one', category: 'shots', file: 'brand-assets/shots/one.png', format: 'png', width: 10, height: 10 });
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const divider = words(pdfOf(outDir), 3);
    expect(text(pdfOf(outDir))[2]).not.toContain('Open question number 40');
    expect(text(pdfOf(outDir))[2]).toMatch(/\+\d+ more/);
    // Nothing but the footer is within 45 points of the bottom (540 - 45), so the last line clears it
    expect(divider.filter((word) => word.bottom > 540 - 45).map((word) => word.text).sort()).toEqual(['Acme', 'Book', 'Brand', '3'].sort());
  }, 120_000);

  it('starts the title higher when two lists of what is left open would not fit below it, so none is cut', () => {
    const w = world({
      categories: [
        { category: 'shots', label: 'Shots', notSpecified: ['Shot sizes', 'Retouching', 'Lighting'], source: { doc: 'guidelines', locator: 'pages 56-60' }, local: 'Not here.' },
        { category: 'edits', label: 'Edits', notSpecified: ['Crop ratios', 'Colour grading', 'Masks'], source: { doc: 'guidelines', locator: 'pages 61-62' }, local: 'Not here.' },
      ],
    });
    (w.brand.pages[0] as any).directives = [
      { name: 'section', args: ['shots'] },
      { name: 'section', args: ['edits'] },
    ];
    (w.brand.pages[0] as any).meta = { description: 'How we shoot, and how we edit what we shot.' };
    (w.brand as any).assets.push({ id: 'shots/one', name: 'one', category: 'shots', file: 'brand-assets/shots/one.png', format: 'png', width: 10, height: 10 });
    (w.brand as any).assets.push({ id: 'edits/two', name: 'two', category: 'edits', file: 'brand-assets/edits/two.png', format: 'png', width: 10, height: 10 });
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const divider = text(pdfOf(outDir))[2]!;
    for (const phrase of ['Shot sizes', 'Lighting', 'Crop ratios', 'Masks', 'Source: guidelines, pages 61-62']) expect(divider).toContain(phrase);
    expect(divider).not.toMatch(/\+\d+ more/);
  }, 120_000);

  it("shows every do and don't of an asset with a long description, five traits and a long source on one slide, at 10 points or more", () => {
    const w = world();
    (w.brand.assets[2] as any).meta = {
      title: 'A dense asset',
      description: 'A long description of what the asset is, how it was made and where it may be used. '.repeat(5),
      traits: ['AI-generated', 'photograph', 'portrait', 'person', 'feed'],
      do: ['Crop to 4 : 5 for a feed post and keep the subject inside the safe frame', 'Put the image beside or inside a panel with the text, not behind it', 'Keep the phone screen blank'],
      dont: ['Publish it with the chalkboards and signs as they are: the lettering is garbled', 'Lay text directly over it', 'Present the person as a real customer or a real testimonial'],
      source: { doc: 'Generated with Google Gemini and supplied by the brand team on 2026-10-27; the prompt was not recorded', locator: 'derived from a file with a long original name, crop x 533-1967, scaled to 1080 x 1350' },
    };
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const slides = text(pdfOf(outDir)).filter((page) => page.includes('A dense asset'));
    expect(slides).toHaveLength(1);
    for (const phrase of ['Do', "Don't", 'Keep the phone screen blank', 'Present the person as a real customer', 'Lay text directly over it', 'Source: Generated with Google Gemini']) expect(slides[0]).toContain(phrase);
    // The text stays inside the slide's margin
    expect(Math.max(...words(pdfOf(outDir), 4).map((word) => word.right))).toBeLessThanOrEqual(960 - 56 + 1);
  }, 120_000);

  it('puts each group of a shared colors slide on a row of its own inside the page, and a group of seven in one row', () => {
    const w = world();
    w.brand.tokens = colorTokens({ warm: ['#FFAA00'], cool: ['#0044CC'], mono: ['#111111', '#EEEEEE'] }) as any;
    w.brand.pages = [] as any;
    (w.brand as any).assets = [];
    w.brand.logo = {} as any;
    const { ran, outDir } = run(w);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const shared = text(pdfOf(outDir)).findIndex((page) => page.includes('#FFAA00')) + 1;
    const heading = (name: string) => words(pdfOf(outDir), shared).find((word) => word.text === name)!;
    const rows = ['Warm', 'Cool', 'Mono'].map((name) => heading(name).y);
    expect(rows[0]!).toBeLessThan(rows[1]!);
    expect(rows[1]!).toBeLessThan(rows[2]!);
    expect(rows[1]! - rows[0]!).toBeGreaterThan(80);
    expect(rows[2]! - rows[1]!).toBeGreaterThan(80);
    for (const word of words(pdfOf(outDir), shared)) {
      expect(word.x).toBeGreaterThanOrEqual(0);
      expect(word.right).toBeLessThanOrEqual(960);
      expect(word.bottom).toBeLessThanOrEqual(540);
    }

    const seven = world();
    seven.brand.tokens = colorTokens({ ramp: Array.from({ length: 7 }, (_, i) => `#${i}${i}${i}${i}${i}${i}`) }) as any;
    seven.brand.pages = [] as any;
    (seven.brand as any).assets = [];
    seven.brand.logo = {} as any;
    const sevenRun = run(seven);
    expect(sevenRun.ran.status, sevenRun.ran.out + sevenRun.ran.err).toBe(0);
    const slide = text(pdfOf(sevenRun.outDir)).findIndex((page) => page.includes('#000000')) + 1;
    const names = [0, 1, 2, 3, 4, 5, 6].map((i) => words(pdfOf(sevenRun.outDir), slide).find((word) => word.text === `c${i}`)!);
    expect(new Set(names.map((name) => name.y)).size).toBe(1);
    for (let i = 1; i < 7; i++) expect(names[i]!.x).toBeGreaterThan(names[i - 1]!.x);
  }, 180_000);

  it('says on the findings, and draws the deck, when a font file in a folder cannot be used', () => {
    const folder = tempDir('blazon-deck-junk-fonts-');
    fs.writeFileSync(path.join(folder, 'junk.ttf'), 'not a font');
    const { ran, outDir, findings } = run(world(), {}, { ...browser, BLAZON_DECK_FONTS: folder });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings.map((f) => [f.code, f.severity, f.path])).toEqual([[`${NAME}/font-not-used`, 'warning', path.join(folder, 'junk.ttf')]]);
    expect(findings[0]!.message).toContain('not a font file');
    expect(fs.existsSync(pdfOf(outDir))).toBe(true);
  }, 120_000);
});
