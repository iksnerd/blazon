import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { tempDir } from '../../../support/project';
import { readBrand } from '../../../../src/shipped/brand-deck/brand.js';
import { DeckError } from '../../../../src/shipped/brand-deck/favicons.js';
import { FontTable } from '../../../../src/shipped/brand-deck/fonts.js';
import { Images, mimeOf, svgSize } from '../../../../src/shipped/brand-deck/images.js';
import { fitText, Measure, wrapText } from '../../../../src/shipped/brand-deck/measure.js';
import { Painter } from '../../../../src/shipped/brand-deck/paint/index.js';
import { plan } from '../../../../src/shipped/brand-deck/plan/index.js';
import { LOGO, PIXEL, token, world } from './helpers.js';

describe('measuring and breaking text', () => {
  // Nothing is measured here: an unmeasured width is half the size a letter, which is all these cases need
  const spec = { family: 'sans-serif', weight: 400 };
  const lines = (input: string, width: number) => wrapText(new Measure(), spec, input, 10, width);

  it('breaks at spaces, so no line is wider than the width, and loses no word', () => {
    const all = lines('one two three four five six seven', 60);
    expect(all.every((line) => [...line].length * 5 <= 60)).toBe(true);
    expect(all.join(' ')).toBe('one two three four five six seven');
  });

  it('keeps line breaks and the empty line between paragraphs', () => {
    expect(lines('one\n\ntwo', 200)).toEqual(['one', '', 'two']);
    expect(lines('', 200)).toEqual(['']);
  });

  it('cuts a word that is wider than the line, by letters', () => {
    expect(lines('abcdefghij', 25)).toEqual(['abcde', 'fghij']);
  });

  it('cuts a title with "..." only when it does not fit', () => {
    expect(fitText(new Measure(), spec, 'short', 10, 100)).toBe('short');
    const cut = fitText(new Measure(), spec, 'a very long title indeed', 10, 60);
    expect(cut.endsWith('...')).toBe(true);
    expect([...cut].length * 5).toBeLessThanOrEqual(60);
  });

  it('asks for every width it estimated, so the browser can answer them in one batch', () => {
    const measure = new Measure();
    wrapText(measure, spec, 'two words', 10, 100);
    expect(measure.settled).toBe(false);
  });
});

describe('images', () => {
  it('knows an svg from the start of its text and a raster from its first bytes', () => {
    expect(mimeOf(Buffer.from('<?xml version="1.0"?><svg/>'), 'x.bin')).toBe('image/svg+xml');
    expect(mimeOf(Buffer.from('  <svg xmlns="x"></svg>'), 'x.bin')).toBe('image/svg+xml');
    expect(mimeOf(fs.readFileSync(PIXEL), 'x.bin')).toBe('image/png');
    expect(mimeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x')).toBe('image/jpeg');
    expect(mimeOf(Buffer.from('not an image'), 'x.bin')).toBeUndefined();
  });

  it("reads an svg's size from its width and height, else its viewBox", () => {
    expect(svgSize('<svg width="292" height="80" viewBox="0 0 146 40"></svg>')).toEqual({ width: 292, height: 80 });
    expect(svgSize('<svg viewBox="0 0 146 40"></svg>')).toEqual({ width: 146, height: 40 });
    expect(svgSize('<svg width="10pt" height="20pt"></svg>')).toEqual({ width: 10 * (4 / 3), height: 20 * (4 / 3) });
    expect(svgSize('<svg></svg>')).toBeUndefined();
    expect(svgSize('<html></html>')).toBeUndefined();
  });

  it('is read from inside its folder, and a file it cannot read is an error that names it', () => {
    const root = tempDir('blazon-deck-images-');
    fs.mkdirSync(path.join(root, 'site'));
    fs.writeFileSync(path.join(root, 'site/a.svg'), LOGO('#000'));
    fs.writeFileSync(path.join(root, 'secret.svg'), LOGO('#f00'));
    const images = new Images(new Measure());
    expect(images.load('a.svg', path.join(root, 'site'))).toMatchObject({ mime: 'image/svg+xml', width: 364, height: 80 });
    expect(() => images.load('missing.svg', path.join(root, 'site'))).toThrow(DeckError);
    expect(() => images.load('missing.svg', path.join(root, 'site'))).toThrow('missing.svg');
    expect(() => images.load('../secret.svg', path.join(root, 'site'))).toThrow('outside the folder');
    const data = `data:image/svg+xml;base64,${Buffer.from(LOGO('#000')).toString('base64')}`;
    expect(images.load(data, path.join(root, 'site')).mime).toBe('image/svg+xml');
    fs.writeFileSync(path.join(root, 'site/bad.svg'), '<svg>');
    expect(() => images.load('bad.svg', path.join(root, 'site'))).toThrow('not a readable SVG');
  });
});

describe('the slides as HTML', () => {
  /** The slides of a world, laid out with estimated widths: what matters here is where things are and how big, not how wide a word is */
  const html = (w: ReturnType<typeof world>, favicons: any = null): string => {
    const brand = readBrand(w.brand);
    const measure = new Measure();
    const painter = new Painter({ brand, measure, images: new Images(measure), table: FontTable.scan([]), siteDir: w.siteDir });
    for (const slide of plan(brand, favicons, painter.wrap)) painter.draw(slide);
    return painter.sections.join('\n');
  };

  it('is one section for each slide the plan has', () => {
    const w = world();
    expect(html(w).match(/<section /g)).toHaveLength(plan(readBrand(w.brand), null, () => ['x']).length);
  });

  it('sets no text smaller than 10 points, on the dense slides too, and the footer at 10', () => {
    const sizes = (doc: string) => [...doc.matchAll(/font-size:([\d.]+)pt/g)].map((match) => Number(match[1]));
    expect(sizes(html(world())).length).toBeGreaterThan(20);
    expect(Math.min(...sizes(html(world())))).toBeGreaterThanOrEqual(10);
    expect(html(world())).toMatch(/font-size:10pt[^>]*><i><\/i>Acme Brand Book</);
    // Three groups of colors share one slide, each in a row too short for more than the smallest lines; a figure kept out of git has its
    // sentence in its frame; a favicons snippet is set under the table of files
    const w = world({
      categories: [{ category: 'art', label: 'Art', local: 'Run render-art.py to draw these.' }],
      assets: [{ id: 'art/hero', name: 'hero', category: 'art', file: 'brand-assets/art/hero.png', format: 'png', width: 100, height: 100, meta: { title: 'The hero' } }],
    });
    for (const group of ['one', 'two', 'three']) w.brand.tokens.push(token(`color.${group}.a`, 'color', '#336699'));
    (w.brand.pages[0] as any).directives.push({ name: 'assets', args: ['art'] });
    const favicons = { format: 'blazon-favicons', version: 1, colors: {}, views: [], files: [{ file: 'favicon.svg', size: 'vector', use: 'Tab icon' }], head: '<link rel="icon" href="/favicon.svg">\n', folder: '/out' };
    const dense = html(w, favicons);
    expect(dense).toContain('RGB 51 102 153');
    expect(dense).toContain('Run render-art.py');
    expect(dense).toContain('Head snippet');
    expect(Math.min(...sizes(dense))).toBeGreaterThanOrEqual(10);
  });

  it('draws each list item as one list item with its bullet in the margin, not a hyphen typed before its lines', () => {
    const w = world();
    const long = 'Keep the space free on every side of the mark and never set anything inside it, whatever the size of the slide';
    (w.brand.assets.find((a: any) => a.id === 'usage/clear') as any).meta.do = [long];
    const doc = html(w);
    // One item for a Do, one for a Don't and one for the list of what the guidelines leave open
    expect(doc.match(/<ul class="l"/g)).toHaveLength(3);
    // The item's lines are one text, so the browser hangs a wrapped line under the text and not under the bullet
    const item = new RegExp(`<ul class="l"[^>]*><li><i></i>(${long.slice(0, 20)}[^<]*)</li>`).exec(doc)?.[1];
    expect(item).toBeDefined();
    expect(item!.split('\n').length).toBeGreaterThan(1);
    expect(item!.replace(/\n/g, ' ')).toBe(long);
    expect(doc).not.toMatch(/<i><\/i>-<\/div>/);
  });

  it('numbers each slide in its footer, and says the brand in it', () => {
    const doc = html(world());
    const sections = doc.split('<section ').slice(1);
    sections.forEach((section, index) => expect(section).toContain(`<i></i>${index + 1}</div>`));
  });

  it('escapes what a brand says, so text cannot become markup', () => {
    const w = world();
    w.brand.brand.title = 'Acme <b>&</b> Co';
    const doc = html(w);
    expect(doc).toContain('Acme &lt;b&gt;&amp;&lt;/b&gt; Co');
    expect(doc).not.toContain('<b>');
  });

  it('names a font the browser has on the computer, and only the brand fonts it was given', () => {
    expect(html(world())).toMatch(/font-family:Helvetica, Arial, 'Liberation Sans', sans-serif/);
    expect(html(world())).not.toContain('brand-');
  });
});
