import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import type { AssetCategoryConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// Category rules (RFC 0001 §11): what a brand requires of every file in an asset category. `blazon check`
// tests each file against them, as it tests tokens against their rules.

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
/** SOI, an APP0 segment to skip, then SOF0 with height before width */
function jpeg(width: number, height: number): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]);
}
/** ISO-BMFF as AVIF writes it: an ftyp box of brand avif, then meta > iprp > ipco > ispe, which holds the size */
function avif(width: number, height: number): Buffer {
  const box = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, body]);
  };
  const ispe = Buffer.alloc(12);
  ispe.writeUInt32BE(width, 4);
  ispe.writeUInt32BE(height, 8);
  const ftyp = Buffer.concat([Buffer.from('avif', 'ascii'), Buffer.alloc(4), Buffer.from('mif1avif', 'ascii')]);
  const meta = Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', ispe)))]);
  return Buffer.concat([box('ftyp', ftyp), box('meta', meta)]);
}
const svg = (w: number, h: number) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}"/></svg>`;

function project(files: Record<string, Buffer | string>): string {
  const root = tempDir();
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, 'assets', file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', file), content);
  }
  return root;
}

const PHOTOS = {
  'photography/hero.png': png(1600, 900),
  'photography/small.png': png(800, 450),
  'photography/square.png': png(1000, 1000),
  'photography/near.png': png(1920, 1081),
  'photography/shot.jpg': jpeg(1600, 900),
  'photography/logo.svg': svg(100, 50),
};

const compile = (root: string, assets: Record<string, unknown>) => compileBlazonData({ ...DEFAULT_CONFIG, assets: assets as Record<string, AssetCategoryConfig> }, root);
const violations = async (rules: unknown, files: Record<string, Buffer | string> = PHOTOS) =>
  (await compile(project(files), { photography: { rules } })).findings.filter((f) => f.code === 'asset-rule-violation');
const ids = (found: { path: string }[]) => found.map((f) => f.path).sort();

describe('category rules: formats', () => {
  it('reports each file in a format the category does not allow', async () => {
    const found = await violations({ formats: ['jpg', 'svg'] });
    expect(ids(found)).toEqual(['photography/hero', 'photography/near', 'photography/small', 'photography/square']);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
    expect(found.find((f) => f.path === 'photography/hero')!.message).toBe('photography/hero is png; photography allows jpg, svg');
  });
  it('is quiet when every file is allowed', async () => {
    expect(await violations({ formats: ['png', 'jpg', 'svg'] })).toEqual([]);
  });
});

describe('category rules: minPixels', () => {
  it('reports a raster image smaller than the minimum, naming the size it needs', async () => {
    const found = await violations({ minPixels: { width: 1600, height: 900 } });
    // 800x450 is half of both; 1000x1000 is wide enough in neither; 1920x1081 and 1600x900 pass
    expect(ids(found)).toEqual(['photography/small', 'photography/square']);
    expect(found.find((f) => f.path === 'photography/small')!.message).toBe('photography/small is 800×450px; photography needs at least 1600px wide and 900px high');
  });
  it('can state one side only', async () => {
    const found = await violations({ minPixels: { width: 1600 } });
    expect(ids(found)).toEqual(['photography/small', 'photography/square']);
    expect(found[0]!.message).toMatch(/needs at least 1600px wide$/);
  });
  it('measures an AVIF, so its rules apply as to any raster file', async () => {
    const found = await violations({ minPixels: { width: 1600 } }, { 'photography/wide.avif': avif(1920, 1080), 'photography/thumb.avif': avif(640, 360) });
    expect(ids(found)).toEqual(['photography/thumb']);
    expect(found[0]!.message).toBe('photography/thumb is 640×360px; photography needs at least 1600px wide');
  });

  it('does not measure a vector file', async () => {
    expect(ids(await violations({ minPixels: { width: 5000 } }))).not.toContain('photography/logo');
  });
});

describe('category rules: aspectRatios', () => {
  it('reports a file whose ratio matches none, to within 1%', async () => {
    const found = await violations({ aspectRatios: ['16:9'] });
    // 1600x900 and 800x450 are 16:9 exactly; 1920x1081 is 0.06% off; 1000x1000 is 1:1; the SVG is 2:1
    expect(ids(found)).toEqual(['photography/logo', 'photography/square']);
    expect(found.find((f) => f.path === 'photography/square')!.message).toBe('photography/square is 1000×1000 (1:1); photography allows 16:9');
  });
  it('accepts any listed ratio', async () => {
    expect(ids(await violations({ aspectRatios: ['16:9', '1:1', '2:1'] }))).toEqual([]);
  });
});

describe('category rules in general', () => {
  it('apply together, one finding per rule a file breaks', async () => {
    const found = (await violations({ formats: ['jpg'], minPixels: { width: 1600 }, aspectRatios: ['16:9'] })).filter((f) => f.path === 'photography/square');
    expect(found).toHaveLength(3);
  });
  it('reach the viewer on the category', async () => {
    const data = await compile(project(PHOTOS), { photography: { rules: { formats: ['png'], aspectRatios: ['16:9'] } } });
    expect(data.assetCategories!.find((c) => c.category === 'photography')!.rules).toEqual({ formats: ['png'], aspectRatios: ['16:9'] });
  });
  it('apply to files from an extra folder too', async () => {
    const root = project({ 'photography/a.png': png(1600, 900) });
    const extra = tempDir();
    fs.writeFileSync(path.join(extra, 'b.png'), png(10, 10));
    const data = await compile(root, { photography: { dir: extra, rules: { minPixels: { width: 1600 } } } });
    expect(data.findings.filter((f) => f.code === 'asset-rule-violation').map((f) => f.path)).toEqual(['photography/b']);
  });
  it('leave a category without rules alone, and ignore a category that has none of the asked-for assets', async () => {
    const data = await compile(project(PHOTOS), { photography: { label: 'Imagery' } });
    expect(data.findings.filter((f) => f.code === 'asset-rule-violation')).toEqual([]);
  });
});

describe('category rules that are malformed', () => {
  it.each([
    ['rules that are not an object', 'strict', /rules must be an object/],
    ['an unknown rule', { colour: 'red' }, /rules has unknown field "colour"; known: formats, minPixels, aspectRatios/],
    ['formats that are not a list', { formats: 'png' }, /formats must be a non-empty list of svg, png, jpg, gif, webp, avif/],
    ['an empty formats list', { formats: [] }, /formats must be a non-empty list/],
    ['an unknown format', { formats: ['tiff'] }, /formats must be a non-empty list of svg, png, jpg, gif, webp, avif/],
    ['minPixels with neither side', { minPixels: {} }, /minPixels needs a width, a height or both/],
    ['a minPixels side that is not above 0', { minPixels: { width: 0 } }, /minPixels\.width must be a number above 0/],
    ['a minPixels side that is not a number', { minPixels: { height: '900' } }, /minPixels\.height must be a number above 0/],
    ['an unknown minPixels field', { minPixels: { width: 10, depth: 3 } }, /minPixels has unknown field "depth"; known: width, height/],
    ['aspectRatios that are not a list', { aspectRatios: '16:9' }, /aspectRatios must be a non-empty list of ratios written like 16:9/],
    ['a ratio that is not W:H', { aspectRatios: ['wide'] }, /aspectRatios must be a non-empty list of ratios written like 16:9/],
    ['a ratio with a zero side', { aspectRatios: ['16:0'] }, /aspectRatios must be a non-empty list of ratios written like 16:9/],
  ])('rejects %s as an error on the key, and leaves the category out whole', async (_, rules, message) => {
    const data = await compile(project(PHOTOS), { photography: { label: 'Imagery', rules } });
    const found = data.findings.filter((f) => f.code === 'asset-config-invalid');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'photography' });
    expect(found[0]!.message).toMatch(message);
    expect(data.assetCategories!.find((c) => c.category === 'photography')!.label).toBe('Photography');
    expect(data.findings.filter((f) => f.code === 'asset-rule-violation')).toEqual([]);
  });
});
