import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import type { AssetCategoryConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// The `assets` block of blazon.json (RFC 0001 §11): a label, an order and a description for each asset
// category, an extra folder to scan, and the findings that keep a library honest.

/** The smallest PNG header that carries a pixel size; the scanner reads nothing past it. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

/** A project inside a parent folder, so `../shared` is a real sibling. */
function project(files: Record<string, Buffer | string>, shared: Record<string, Buffer | string> = {}) {
  const parent = tempDir();
  const root = path.join(parent, 'brand');
  const write = (base: string, set: Record<string, Buffer | string>) => {
    for (const [file, content] of Object.entries(set)) {
      fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
      fs.writeFileSync(path.join(base, file), content);
    }
  };
  write(path.join(root, 'assets'), files);
  write(path.join(parent, 'shared'), shared);
  return { root, parent };
}

const compile = (root: string, assets?: Record<string, AssetCategoryConfig | unknown>) =>
  compileBlazonData({ ...DEFAULT_CONFIG, ...(assets && { assets: assets as Record<string, AssetCategoryConfig> }) }, root);
const assetFindings = async (root: string, assets?: Record<string, unknown>) =>
  (await compile(root, assets)).findings.filter((f) => f.code.startsWith('asset-') && f.code !== 'asset-sidecar-orphan');

const LIBRARY = { 'logos/mark.svg': SVG, 'icons/a.svg': SVG, 'photography/hero.png': png(1600, 900), 'zebra/z.png': png(10, 10), 'alpha/a.png': png(10, 10) };

describe('asset categories', () => {
  it('lists every category with assets, logos then icons then the rest by name, labelled from the folder', async () => {
    const { root } = project(LIBRARY);
    expect((await compile(root)).assetCategories).toEqual([
      { category: 'logos', label: 'Logos' },
      { category: 'icons', label: 'Icons' },
      { category: 'alpha', label: 'Alpha' },
      { category: 'photography', label: 'Photography' },
      { category: 'zebra', label: 'Zebra' },
    ]);
  });

  it('takes a configured label, order and description, and puts ordered categories first', async () => {
    const { root } = project(LIBRARY);
    const data = await compile(root, {
      photography: { label: 'Imagery', order: 1, description: 'Photos of people' },
      zebra: { order: 0 },
    });
    expect(data.assetCategories).toEqual([
      { category: 'zebra', label: 'Zebra', order: 0 },
      { category: 'photography', label: 'Imagery', order: 1, description: 'Photos of people' },
      { category: 'logos', label: 'Logos' },
      { category: 'icons', label: 'Icons' },
      { category: 'alpha', label: 'Alpha' },
    ]);
  });

  it('breaks a tie on order by name', async () => {
    const { root } = project(LIBRARY);
    const data = await compile(root, { zebra: { order: 1 }, alpha: { order: 1 } });
    expect(data.assetCategories!.slice(0, 2).map((c) => c.category)).toEqual(['alpha', 'zebra']);
  });

  it('lists the assets of each category in file-name order, whatever order they were written in', async () => {
    const { root } = project({ 'photography/c.png': png(1, 1), 'photography/a.png': png(1, 1), 'photography/b.png': png(1, 1) });
    expect((await compile(root)).assets.custom.photography!.map((a) => a.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('a category folder outside assets/', () => {
  const shared = { 'scene.png': png(640, 360), 'scene.json': '{"description":"A scene"}', 'deep/panel.png': png(10, 10) };

  it('joins the category by its key, at the same ids and URLs as a folder inside assets/', async () => {
    const { root } = project(LIBRARY, shared);
    const data = await compile(root, { illustrations: { dir: '../shared' } });
    const scene = data.assets.custom.illustrations!.find((a) => a.name === 'scene')!;
    expect(scene).toMatchObject({
      id: 'illustrations/scene',
      category: 'illustrations',
      filePath: 'illustrations/scene.png',
      url: 'brand-assets/illustrations/scene.png',
      width: 640,
      height: 360,
    });
    expect(scene.meta?.description).toBe('A scene');
    const deep = data.assets.custom.illustrations!.find((a) => a.name === 'panel')!;
    expect(deep).toMatchObject({ id: 'illustrations/panel', url: 'brand-assets/illustrations/deep/panel.png' });
    expect(data.assetCategories!.map((c) => c.category)).toContain('illustrations');
  });

  it('accepts an absolute path, and adds to a folder of the same name inside assets/', async () => {
    const { root, parent } = project({ 'illustrations/own.png': png(1, 1) }, shared);
    const data = await compile(root, { illustrations: { dir: path.join(parent, 'shared') } });
    expect(data.assets.custom.illustrations!.map((a) => a.name).sort()).toEqual(['own', 'panel', 'scene']);
    expect(await assetFindings(root, { illustrations: { dir: path.join(parent, 'shared') } })).toEqual([]);
  });

  it('can add to logos and icons, which keep their place in the catalog', async () => {
    const { root } = project(LIBRARY, { 'extra.svg': SVG });
    const data = await compile(root, { logos: { dir: '../shared' } });
    expect(data.assets.logos.map((a) => a.name).sort()).toEqual(['extra', 'mark']);
  });

  it('does not put a local path in the data the page receives', async () => {
    const { root, parent } = project(LIBRARY, shared);
    const json = JSON.stringify(await compile(root, { illustrations: { dir: '../shared' } }));
    expect(json).not.toContain(parent);
  });
});

describe('findings', () => {
  const library = { 'photography/hero.png': png(1, 1) };

  it.each([
    ['a key with a dir that is not URL-safe', { 'My Photos': { dir: '../shared' } }, /key "My Photos" has a dir, so it must be lowercase letters, digits and hyphens/],
    ['an unknown field', { photography: { colour: 'red' } }, /unknown field "colour"; known: label, order, description, dir, rules, notSpecified, source/],
    ['a label that is not a string', { photography: { label: 3 } }, /label must be a string/],
    ['an order that is not a number', { photography: { order: '1' } }, /order must be a number/],
    ['a description that is not a string', { photography: { description: [] } }, /description must be a string/],
    ['an entry that is not an object', { photography: 'Imagery' }, /must be an object/],
    ['a dir that does not exist', { shots: { dir: '../nope' } }, /dir \.\.\/nope does not exist/],
    ['a dir that is a file', { shots: { dir: './assets/photography/hero.png' } }, /dir \.\/assets\/photography\/hero\.png is not a folder/],
  ])('reports %s as an error on the key', async (_, assets, message) => {
    const { root } = project(library, { 'a.png': png(1, 1) });
    const found = (await assetFindings(root, assets)).filter((f) => f.code === 'asset-config-invalid');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: Object.keys(assets)[0] });
    expect(found[0]!.message).toMatch(message);
  });

  it('keeps a good category when its neighbour is bad', async () => {
    const { root } = project(library);
    const data = await compile(root, { photography: { label: 'Imagery' }, shots: { dir: '../nope' } });
    expect(data.assetCategories!.find((c) => c.category === 'photography')!.label).toBe('Imagery');
  });

  it('warns about a key that has no assets, which is usually a typo of a folder name', async () => {
    const { root } = project(library);
    const found = await assetFindings(root, { photograpy: { label: 'Imagery' } });
    expect(found).toEqual([expect.objectContaining({ code: 'asset-config-unused', severity: 'warning', path: 'photograpy' })]);
    expect(found[0]!.message).toMatch(/no asset in this category/);
  });

  it('reports two files with one id from different folders as an error, since the id would name both', async () => {
    const { root } = project({ 'photography/a/hero.png': png(1, 1), 'photography/b/hero.png': png(1, 1) });
    const found = await assetFindings(root);
    expect(found).toEqual([expect.objectContaining({ code: 'asset-duplicate-id', severity: 'error', path: 'photography/hero' })]);
    expect(found[0]!.message).toMatch(/photography\/a\/hero\.png and photography\/b\/hero\.png/);
  });

  it('reports the same id from assets/ and from a dir', async () => {
    const { root } = project({ 'illustrations/scene.png': png(1, 1) }, { 'scene.png': png(1, 1) });
    const found = await assetFindings(root, { illustrations: { dir: '../shared' } });
    expect(found).toEqual([expect.objectContaining({ code: 'asset-duplicate-id', path: 'illustrations/scene' })]);
  });

  it('allows one name in two formats side by side: they are one asset with one sidecar', async () => {
    const { root } = project({ 'logos/mark.svg': SVG, 'logos/mark.png': png(1, 1) });
    expect(await assetFindings(root)).toEqual([]);
  });

  it('is silent for a project with no assets block and no problem', async () => {
    const { root } = project(LIBRARY);
    expect(await assetFindings(root)).toEqual([]);
  });
});
