import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { DIRECTIVES } from '../../../src/core/docs/directives.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { STANDARD_SECTION_IDS as SECTION_IDS, type BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';
import { REPO } from '../../support/paths';
import { hasReference, referencePath } from '../../support/reference';

// Sections built from data (RFC 0001 §7, §11, §13): a sidecar states a title, traits, dos and don'ts; a category
// states what the guidelines leave open and where they say so; a page declares which standard sections it holds;
// blazon:section draws a category from all of that.

const PNG = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(1600, 16);
  b.writeUInt32BE(900, 20);
  return b;
})();

function project(files: Record<string, Buffer | string>): string {
  const root = tempDir();
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

const page = (section: string | undefined, body = 'Text.') => `---\n${section === undefined ? '' : `section: ${section}\n`}---\n\n# Page\n\n${body}\n`;
const compile = (root: string, config: Partial<BlazonConfig> = {}) => compileBlazonData({ ...DEFAULT_CONFIG, ...config }, root);
const withCode = async (root: string, prefix: string, config: Partial<BlazonConfig> = {}) => (await compile(root, config)).findings.filter((f) => f.code.startsWith(prefix));

describe('the standard sections', () => {
  it('are these fourteen, in this order', () => {
    expect([...SECTION_IDS]).toEqual([
      'intro',
      'logo',
      'color',
      'typography',
      'icons',
      'illustration',
      'photography',
      'patterns',
      '3d',
      'diagrams',
      'motion',
      'layout',
      'social',
      'applications',
    ]);
  });
});

describe('sidecar fields: title, traits, do, dont', () => {
  const sidecar = (fields: unknown) => project({ 'assets/photography/hero.png': PNG, 'assets/photography/hero.json': JSON.stringify(fields) });

  it('reach the asset and are plain strings', async () => {
    const data = await compile(sidecar({ title: 'Lifestyle', traits: ['Candid and real', 'Warm light'], do: ['Show people at work'], dont: ['Use stock poses'] }));
    expect(data.assets.all[0]!.meta).toEqual({ title: 'Lifestyle', traits: ['Candid and real', 'Warm light'], do: ['Show people at work'], dont: ['Use stock poses'] });
    expect(data.findings.filter((f) => f.code === 'asset-sidecar-invalid')).toEqual([]);
  });

  it.each([
    ['a title that is not a string', { title: 3 }, 'title must be a string'],
    ['an empty title', { title: ' ' }, 'title must be a string'],
    ['traits that are not a list', { traits: 'Candid' }, 'traits must be a non-empty list of strings'],
    ['an empty list', { do: [] }, 'do must be a non-empty list of strings'],
    ['a list with an empty string', { dont: ['ok', ''] }, 'dont must be a non-empty list of strings'],
    ['a list with a number', { traits: ['ok', 4] }, 'traits must be a non-empty list of strings'],
  ])('refuse %s', async (_name, fields, message) => {
    const data = await compile(sidecar(fields));
    const found = data.findings.filter((f) => f.code === 'asset-sidecar-invalid');
    expect(found.map((f) => f.message)).toEqual([message]);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'photography/hero.json' });
    expect(data.assets.all[0]!.meta).toBeUndefined();
  });
});

describe('category fields: notSpecified and source', () => {
  const root = () => project({ 'assets/photography/hero.png': PNG });
  const configured = (block: unknown) => compile(root(), { assets: { photography: block } as BlazonConfig['assets'] });

  it('reach the category the brand book shows', async () => {
    const data = await configured({ notSpecified: ['Shot sizes', 'Retouching'], source: { doc: 'brand-guidelines', locator: 'slide 61' } });
    expect(data.assetCategories).toEqual([
      { category: 'photography', label: 'Photography', notSpecified: ['Shot sizes', 'Retouching'], source: { doc: 'brand-guidelines', locator: 'slide 61' } },
    ]);
  });

  it.each([
    ['notSpecified that is not a list', { notSpecified: 'Shot sizes' }, 'notSpecified must be a non-empty list of strings'],
    ['an empty notSpecified', { notSpecified: [] }, 'notSpecified must be a non-empty list of strings'],
    ['a source that is a string', { source: 'slide 61' }, 'source must be {"doc": string, "locator": string}'],
    ['a source with no locator', { source: { doc: 'deck' } }, 'source must be {"doc": string, "locator": string}'],
  ])('refuse %s', async (_name, block, message) => {
    const found = (await configured(block)).findings.filter((f) => f.code === 'asset-config-invalid');
    expect(found.map((f) => f.message)).toEqual([message]);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'photography' });
  });
});

describe('page sections', () => {
  it('are read from the front matter, one id or a list, and a page with none has none', async () => {
    const data = await compile(project({ 'docs/01-a.md': page('logo'), 'docs/02-b.md': page('[patterns, 3d]'), 'docs/03-c.md': page(undefined) }));
    expect(data.docs.map((d) => d.sections)).toEqual([['logo'], ['patterns', '3d'], []]);
  });

  it('are listed once when a page names one twice', async () => {
    const data = await compile(project({ 'docs/a.md': page('[logo, logo, color]') }));
    expect(data.docs[0]!.sections).toEqual(['logo', 'color']);
  });

  it('name only standard ids: an unknown one is an error on the page and is dropped', async () => {
    const root = project({ 'docs/a.md': page('[logo, branding]'), 'docs/b.md': page('7') });
    const data = await compile(root);
    expect(data.docs.map((d) => d.sections)).toEqual([['logo'], []]);
    const errors = data.findings.filter((f) => f.code === 'section-invalid');
    expect(errors.map((f) => [f.severity, f.path])).toEqual([
      ['error', 'a.md'],
      ['error', 'b.md'],
    ]);
    expect(errors[0]!.message).toContain('"branding" is not a section');
    expect(errors[0]!.message).toContain(SECTION_IDS.join(', '));
  });
});

describe('section-missing', () => {
  it('is one info finding for each standard section no page holds, once a page declares a section', async () => {
    const found = await withCode(project({ 'docs/a.md': page('logo'), 'docs/b.md': page('[color, typography]') }), 'section-');
    expect(found.every((f) => f.code === 'section-missing' && f.severity === 'info')).toBe(true);
    expect(found.map((f) => f.path)).toEqual(SECTION_IDS.filter((id) => !['logo', 'color', 'typography'].includes(id)).sort());
    expect(found.find((f) => f.path === 'intro')!.message).toContain('intro');
  });

  it('is never raised for a project that does not use sections yet', async () => {
    expect(await withCode(project({ 'docs/a.md': page(undefined) }), 'section-')).toEqual([]);
    expect(await withCode(project({}), 'section-')).toEqual([]);
  });

  it('follows the `sections` config, which narrows the list of sections a brand expects', async () => {
    const root = project({ 'docs/a.md': page('logo') });
    const found = await withCode(root, 'section-', { sections: ['logo', 'color'] });
    expect(found.map((f) => [f.code, f.path])).toEqual([['section-missing', 'color']]);
  });

  it('is raised for every listed section when the config lists them and no page declares one', async () => {
    const found = await withCode(project({ 'docs/a.md': page(undefined) }), 'section-', { sections: ['logo', 'motion'] });
    expect(found.map((f) => f.path)).toEqual(['logo', 'motion']);
  });

  it('is not raised for a section a page holds that the config did not list', async () => {
    const found = await withCode(project({ 'docs/a.md': page('motion') }), 'section-', { sections: ['logo'] });
    expect(found.map((f) => f.path)).toEqual(['logo']);
  });

  it('reports an unknown id in the config as an error on `sections`', async () => {
    const found = await withCode(project({ 'docs/a.md': page('logo') }), 'section-', { sections: ['logo', 'brandmark'] as never });
    expect(found.filter((f) => f.code === 'section-invalid')).toEqual([
      expect.objectContaining({ severity: 'error', path: 'sections', message: expect.stringContaining('"brandmark" is not a section') }),
    ]);
  });
});

describe('blazon:section', () => {
  const library = { 'assets/photography/hero.png': PNG, 'assets/photography/team.png': PNG };
  const directive = async (args: string) =>
    (await withCode(project({ ...library, 'docs/a.md': page(undefined, `<!-- blazon:section${args && ` ${args}`} -->`) }), 'directive-')).map((f) => f.message);

  it('is in the one directive table, like blazon:assets: a category, then optionally the assets to draw', () => {
    expect(DIRECTIVES.section).toEqual({ folder: true, assetNames: true });
  });

  it('accepts a category, and a category with asset names', async () => {
    expect(await directive('photography')).toEqual([]);
    expect(await directive('photography hero team')).toEqual([]);
  });

  it('refuses a category with no assets, an asset that is not in it, and no argument', async () => {
    expect(await directive('nowhere')).toEqual(['<!-- blazon:section nowhere -->: no asset at nowhere']);
    expect(await directive('photography nope')).toEqual(['<!-- blazon:section photography nope -->: no asset at photography/nope']);
    expect(await directive('')).toEqual(['<!-- blazon:section -->: needs at least one argument']);
  });
});

describe('the projects that ship with blazon', () => {
  it.each(['examples/blazon', 'a new project'])('%s raises no section error', async (dir) => {
    const root = dir === 'a new project' ? await starterProject() : path.resolve(REPO, dir);
    const data = await compileBlazonData(await loadConfig(root), root);
    expect(data.findings.filter((f) => f.code === 'section-invalid')).toEqual([]);
  });
});

it.skipIf(!hasReference('examples/auth0'))('the reference brand raises no section error', async () => {
  const root = referencePath('examples/auth0');
  const data = await compileBlazonData(await loadConfig(root), root);
  expect(data.findings.filter((f) => f.code === 'section-invalid')).toEqual([]);
});

describe('brand.json', () => {
  it("carries each page's sections, the asset fields and the category fields", async () => {
    const root = project({
      'assets/photography/hero.png': PNG,
      'assets/photography/hero.json': JSON.stringify({ title: 'Lifestyle', traits: ['Candid'], do: ['Show people'], dont: ['Pose'] }),
      'docs/a.md': page('[patterns, 3d]'),
      'docs/b.md': page(undefined),
    });
    const config = { ...DEFAULT_CONFIG, assets: { photography: { notSpecified: ['Shot sizes'], source: { doc: 'deck', locator: 'slide 61' } } } };
    const brand = buildBrandExport(await compileBlazonData(config, root), config, root);
    expect(brand.pages.map((p) => p.sections)).toEqual([['patterns', '3d'], []]);
    expect(brand.assets[0]!.meta).toEqual({ title: 'Lifestyle', traits: ['Candid'], do: ['Show people'], dont: ['Pose'] });
    expect(brand.categories[0]).toMatchObject({ category: 'photography', notSpecified: ['Shot sizes'], source: { doc: 'deck', locator: 'slide 61' } });
  });
});
