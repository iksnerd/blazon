import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runInit } from '../../src/cli/commands/init.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { buildBrandExport, formatBrandJson } from '../../src/core/brand/export.js';
import { buildSite } from '../../src/builder/site-builder.js';
import type { BlazonConfig, BlazonData } from '../../src/types/index.js';
import { starterProject, tempDir, tempProject } from '../support/project';
import { hasReference, referencePath } from '../support/reference';
import { REPO } from '../support/paths';

// brand.json (RFC 0001 §12): one narrow, versioned file that holds the whole brand, for tools in any language.
// It is not the viewer's data: no HTML, no SVG markup, no local paths, no timestamps.

const AUTH0 = referencePath('examples/auth0');
const PRESENT = hasReference('examples/auth0');
let config: BlazonConfig;
let data: BlazonData;
let brand: ReturnType<typeof buildBrandExport>;

beforeAll(async () => {
  if (!PRESENT) return;
  config = await loadConfig(AUTH0);
  data = await compileBlazonData(config, AUTH0);
  brand = buildBrandExport(data, config, AUTH0);
});

describe.skipIf(!PRESENT)('what brand.json holds, for the reference brand', () => {
  it('names its format and version', () => {
    expect(brand).toMatchObject({ format: 'blazon-brand', version: 1, brand: { title: 'Auth0 Brand Book' } });
  });

  it('holds each token once, with its resolved value and its dev.blazon rules', () => {
    expect(brand.tokens).toHaveLength(data.tokens.items.length);
    const indigo = brand.tokens.find((t) => t.path === 'color.primary.indigo')!;
    expect(indigo).toMatchObject({
      type: 'color',
      value: '#635DFF',
      cssVariable: '--color-primary-indigo',
      blazon: { print: { cmyk: [84, 70, 0, 0], pms: '2726 C' } },
    });
    // An alias keeps what it points at, and its resolved value
    const role = brand.tokens.find((t) => t.aliasOf)!;
    expect(role.aliasOf).toBeTruthy();
    expect(role.resolvedValue).toBeDefined();
  });

  it('keeps `file` for files beside brand.json: tokens and pages name their source as `sourceFile`', () => {
    const indigo = brand.tokens.find((t) => t.path === 'color.primary.indigo')!;
    expect(indigo.sourceFile).toBe('tokens/colors.json');
    expect(brand.contexts[0]!.tokens[0]).toHaveProperty('sourceFile');
    for (const item of [...brand.tokens, ...brand.contexts.flatMap((c) => c.tokens), ...brand.pages]) expect(item).not.toHaveProperty('file');
    expect(brand.assets.every((a) => 'file' in a)).toBe(true);
  });

  it('holds the rules of a group: proportions and contrast pairs', () => {
    const withProportion = data.tokens.groupMeta.find((g) => g.blazon.proportion)!;
    const withPairs = data.tokens.groupMeta.find((g) => g.blazon.pairs)!;
    expect(brand.groups.find((g) => g.path === withProportion.path)!.blazon.proportion).toEqual(withProportion.blazon.proportion);
    expect(brand.groups.find((g) => g.path === withPairs.path)!.blazon.pairs).toEqual(withPairs.blazon.pairs);
  });

  it('holds the review of a group on the group, and not again on its tokens', async () => {
    const root = tempProject({
      'tokens/ramp.json': {
        color: { $type: 'color', brand: { $extensions: { 'dev.blazon': { review: { status: 'needs-review', note: 'proposed' } } }, 100: { $value: '#eef' } } },
      },
    });
    const config = await loadConfig(root);
    const out = buildBrandExport(await compileBlazonData(config, root), config, root);
    expect(out.groups.find((g) => g.path === 'color.brand')?.blazon.review).toEqual({ status: 'needs-review', note: 'proposed' });
    expect(out.tokens.find((t) => t.path === 'color.brand.100')!.blazon?.review).toBeUndefined();
    expect(out.findings.filter((f) => f.code === 'review-pending').map((f) => f.path)).toEqual(['color.brand']);
  });

  it('carries the file and the line of a token finding', async () => {
    const root = tempProject({ 'tokens/c.json': {} });
    fs.writeFileSync(path.join(root, 'tokens/c.json'), '{\n  "color": {\n    "bad": { "$type": "color", "$value": "notacolor" }\n  }\n}\n');
    const config = await loadConfig(root);
    const out = buildBrandExport(await compileBlazonData(config, root), config, root);
    expect(out.findings).toContainEqual(expect.objectContaining({ code: 'token-value-invalid', path: 'color.bad', file: 'tokens/c.json', line: 3 }));
  });

  it('holds each non-default context with the tokens it changes, and the selector it uses', () => {
    expect(brand.contexts.map((c) => `${c.modifier}=${c.context}`)).toEqual(['locale=ja', 'locale=de', 'locale=fr']);
    const ja = brand.contexts[0]!;
    expect(ja.selector).toBe(':lang(ja)');
    expect(ja.tokens.map((t) => t.path)).toContain('font.family.body');
    expect(ja.tokens.map((t) => t.path)).not.toContain('color.primary.indigo');
  });

  it('holds the pages as Markdown with their directives in order, and no HTML', () => {
    expect(brand.pages).toHaveLength(data.docs.length);
    const logo = brand.pages.find((p) => p.slug === 'logo')!;
    expect(logo).toMatchObject({ title: 'Logotype', sourceFile: '02-logo.md', meta: { group: 'System elements', cover: 'inverse' } });
    expect(logo.markdown).toContain('## Partnership lockup');
    const names = logo.directives.map((d) => d.name);
    expect(names.slice(0, 3)).toEqual(['logo-usage', 'assets', 'logo-on']);
    expect(logo.directives.find((d) => d.name === 'logo-lockups')).toEqual({ name: 'logo-lockups', args: ['logos'] });
    expect(JSON.stringify(brand)).not.toContain('"html":');
  });

  it('holds each asset with its sidecar rules and the path of its file, and no SVG markup', () => {
    const black = brand.assets.find((a) => a.id === 'logos/logotype-black')!;
    expect(black).toMatchObject({
      category: 'logos',
      file: 'brand-assets/logos/logotype-black.png',
      format: 'png',
      width: 2426,
      height: 717,
      meta: { lockup: 'horizontal', unit: { value: 579, unit: 'px' }, clearSpace: { units: 1 } },
    });
    // An SVG asset has `"format":"svg"`; what must be absent is a field holding its markup
    expect(JSON.stringify(brand)).not.toContain('"svg":');
    expect(brand.categories.map((c) => c.category)).toContain('logos');
  });

  it('points the logo at its asset file instead of embedding it', () => {
    expect(brand.logo).toEqual({ onLight: 'brand-assets/logos/logotype-black.png', onDark: 'brand-assets/logos/logotype-white.png' });
    expect(JSON.stringify(brand)).not.toContain('data:image');
  });

  it('holds the theme roles, the tokens they came from, the fonts, and the findings', () => {
    expect(brand.theme.roles.accent).toBeTruthy();
    expect(brand.theme.tokens.accent).toBe('interactive.primary');
    expect(brand.theme.fonts.length).toBeGreaterThan(0);
    expect(brand.findings.some((f) => f.code === 'review-pending' && f.path === 'logos/logotype-black')).toBe(true);
    expect(brand.iconSets).toEqual([]);
  });

  it('is plain JSON with no local path, and is the same every time', () => {
    const text = formatBrandJson(data, config, AUTH0);
    expect(text.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain(REPO);
    expect(text).toBe(formatBrandJson(data, config, AUTH0));
  });
});

describe('a logo that is not an asset', () => {
  it('is embedded, so it is never missing', async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'assets'));
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    fs.writeFileSync(path.join(root, 'outside-logo.png'), png);
    const cfg = { ...(await loadConfig(root)), logo: './outside-logo.png' };
    const out = buildBrandExport(await compileBlazonData(cfg, root), cfg, root);
    expect(out.logo.onLight).toMatch(/^data:image\/png;base64,/);
  });
});

describe('blazon build writes brand.json beside the site', () => {
  async function build() {
    const tmp = tempDir();
    // A fixed folder name, because init names the brand book after it.
    const root = path.join(tmp, 'acme');
    await runInit(root);
    const { siteOutDir } = await buildSite(await loadConfig(root), root);
    return { root, siteOutDir, text: fs.readFileSync(path.join(siteOutDir, 'brand.json'), 'utf-8') };
  }

  it('writes valid JSON in which every file it names exists beside it', async () => {
    const { siteOutDir, text } = await build();
    const out = JSON.parse(text);
    expect(out).toMatchObject({ format: 'blazon-brand', version: 1 });
    expect(out.assets.length).toBeGreaterThan(0);
    for (const asset of out.assets) expect(fs.existsSync(path.join(siteOutDir, asset.file)), asset.file).toBe(true);
    expect(out.logo.onLight).toMatch(/^brand-assets\//);
  }, 60_000);

  it('is byte for byte the same on a second build, and holds no local path', async () => {
    const first = await build();
    const second = await build();
    expect(second.text).toBe(first.text);
    expect(first.text).not.toContain(first.root);
  }, 60_000);
});

describe('an asset generated by a tool', () => {
  it('carries generated and review under meta, and reports asset-review-missing in the findings', async () => {
    const root = await starterProject();
    const file = path.join(root, 'assets/logos/blazon-graphite.json');
    const sidecar = JSON.parse(fs.readFileSync(file, 'utf-8'));
    delete sidecar.review;
    fs.writeFileSync(file, JSON.stringify({ ...sidecar, generated: { by: 'Midjourney v7', prompt: 'a lighthouse', licence: 'Commercial plan' } }));
    const cfg = await loadConfig(root);
    const out = buildBrandExport(await compileBlazonData(cfg, root), cfg, root);
    expect(out.assets.find((a) => a.id === 'logos/blazon-graphite')!.meta).toMatchObject({
      generated: { by: 'Midjourney v7', prompt: 'a lighthouse', licence: 'Commercial plan' },
    });
    expect(out.findings).toContainEqual(expect.objectContaining({ code: 'asset-review-missing', path: 'logos/blazon-graphite' }));

    fs.writeFileSync(file, JSON.stringify({ ...sidecar, generated: { by: 'Midjourney v7' }, review: { status: 'ok', note: 'Checked' } }));
    const reviewed = buildBrandExport(await compileBlazonData(cfg, root), cfg, root);
    expect(reviewed.assets.find((a) => a.id === 'logos/blazon-graphite')!.meta).toMatchObject({ generated: { by: 'Midjourney v7' }, review: { status: 'ok', note: 'Checked' } });
    expect(reviewed.findings.map((f) => f.code)).not.toContain('asset-review-missing');
  });
});

describe.skipIf(!PRESENT)('generator: which blazon wrote the file', () => {
  const COMMIT = 'a'.repeat(40);

  it('names blazon, its commit and whether it was dirty', () => {
    const out = buildBrandExport(data, config, AUTH0, { commit: COMMIT, dirty: true, from: 'build' });
    expect(out.generator).toEqual({ name: 'blazon', commit: COMMIT, dirty: true });
  });

  it('leaves commit and dirty out, and writes no guess, when blazon cannot say its commit', () => {
    expect(buildBrandExport(data, config, AUTH0, null).generator).toEqual({ name: 'blazon' });
  });

  it('is the one top-level key that varies: with it removed, two blazons write the same file', () => {
    const a = buildBrandExport(data, config, AUTH0, { commit: COMMIT, dirty: false, from: 'git' });
    const b = buildBrandExport(data, config, AUTH0, null);
    const { generator: _a, ...restA } = a;
    const { generator: _b, ...restB } = b;
    expect(JSON.stringify(restA)).toBe(JSON.stringify(restB));
    expect(formatBrandJson(data, config, AUTH0, null)).toBe(formatBrandJson(data, config, AUTH0, null));
    expect(JSON.stringify(a.generator)).not.toMatch(/\d{4}-\d{2}-\d{2}T|host/i);
  });

  it('defaults to the running blazon: the commit it reports is 40 hex digits or absent', () => {
    const { commit, dirty } = buildBrandExport(data, config, AUTH0).generator;
    if (commit === undefined) expect(dirty).toBeUndefined();
    else expect(commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
