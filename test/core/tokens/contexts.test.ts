import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { formatBrandJson, type BrandExport } from '../../../src/core/brand/export.js';
import { contextItems } from '../../../src/core/tokens/contexts.js';
import { compileBlazonData, emitTokenOutputs } from '../../../src/core/index.js';
import { writeProject, TEST_CONFIG } from '../../support/helpers.js';
import { tempDir } from '../../support/project';

const BASE = {
  font: {
    $type: 'fontFamily',
    body: { $value: ['Inter', 'sans-serif'] },
  },
  type: {
    $type: 'typography',
    h1: {
      $value: {
        fontFamily: '{font.body}',
        fontSize: { value: 64, unit: 'px' },
        fontWeight: 600,
        letterSpacing: { value: 0, unit: 'px' },
        lineHeight: 1.125,
      },
    },
  },
  color: { $type: 'color', ink: { $value: '#000000' }, paper: { $value: '#FFFFFF' } },
};

const RESOLVER = {
  version: '2025.10',
  sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
  modifiers: {
    locale: {
      contexts: {
        en: [],
        ja: [{ $ref: 'tokens/locale/ja.json' }],
        de: [{ $ref: 'tokens/locale/de.json' }],
      },
      default: 'en',
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/locale' }],
};

function localeProject(extra: Record<string, unknown> = {}) {
  return writeProject({
    'blazon.resolver.json': RESOLVER,
    'tokens/base.json': BASE,
    // No $type here: it comes from the base document's group once the sources are merged
    'tokens/locale/ja.json': { font: { body: { $value: ['Kinto', 'Inter', 'sans-serif'] } } },
    'tokens/locale/de.json': {
      type: {
        h1: {
          $value: {
            fontFamily: '{font.body}',
            fontSize: { value: 56, unit: 'px' },
            fontWeight: 600,
            letterSpacing: { value: 0, unit: 'px' },
            lineHeight: 1.143,
          },
        },
      },
    },
    ...extra,
  });
}

const compile = (root: string, config = {}) => compileBlazonData({ ...TEST_CONFIG, ...config }, root);

describe('compileBlazonData: resolver contexts (RFC 0001 §3)', () => {
  it('compiles the default context as the main token set, loading only files the resolver names', async () => {
    const root = localeProject({ 'tokens/stray.json': { color: { $type: 'color', ink: { $value: '#ff0000' } } } });
    const data = await compile(root);

    expect(data.tokens.byPath.get('font.body')?.value).toBe('Inter, sans-serif');
    expect(data.tokens.byPath.get('color.ink')?.value).toBe('#000000');
    // Notes (a project with no theme gets one) are not problems
    expect(data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('lists, per non-default context, only the tokens whose resolved value differs, aliases included', async () => {
    const data = await compile(localeProject());
    const contexts = data.tokens.contexts ?? [];

    expect(contexts.map((c) => `${c.modifier}=${c.context}`)).toEqual(['locale=ja', 'locale=de']);
    const ja = contexts.find((c) => c.context === 'ja')!;
    expect(ja.selector).toBe(':lang(ja)');
    expect(ja.tokens.map((t) => t.path).sort()).toEqual(['font.body', 'type.h1']);
    expect(ja.tokens.find((t) => t.path === 'font.body')?.type).toBe('fontFamily');
    expect(ja.tokens.find((t) => t.path === 'type.h1')?.value).toBe('600 64px/1.125 Kinto, Inter, sans-serif');

    const de = contexts.find((c) => c.context === 'de')!;
    expect(de.tokens.map((t) => t.path)).toEqual(['type.h1']);
  });

  it('lists each modifier with its default and contexts, for the brand book switcher', async () => {
    const data = await compile(localeProject());

    expect(data.tokens.modifiers).toEqual([{ name: 'locale', default: 'en', contexts: ['en', 'ja', 'de'] }]);
  });

  it('takes context selectors from config, with :lang() for locale and a data attribute otherwise', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: {
          theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' },
          density: { contexts: { regular: [], compact: [{ $ref: 'tokens/compact.json' }] }, default: 'regular' },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/density' }],
      },
      'tokens/base.json': BASE,
      'tokens/dark.json': { color: { ink: { $value: '#FFFFFF' }, paper: { $value: '#000000' } } },
      'tokens/compact.json': { color: { paper: { $value: '#EEEEEE' } } },
    });
    const data = await compile(root, { contextSelectors: { density: '.density-{context}' } });

    expect(data.tokens.contexts?.map((c) => c.selector)).toEqual(['[data-theme="dark"]', '.density-compact']);
  });

  it('reports a resolver document that breaks the spec instead of throwing', async () => {
    const cases: [string, unknown, string][] = [
      ['wrong version', { ...RESOLVER, version: '2024.01' }, 'version'],
      ['no resolutionOrder', { ...RESOLVER, resolutionOrder: undefined }, 'resolutionOrder'],
      ['default not a context', { ...RESOLVER, modifiers: { locale: { ...RESOLVER.modifiers.locale, default: 'fr' } } }, 'default'],
      ['no contexts', { ...RESOLVER, modifiers: { locale: { contexts: {}, default: 'en' } } }, 'contexts'],
      ['no default', { ...RESOLVER, modifiers: { locale: { contexts: RESOLVER.modifiers.locale.contexts } } }, 'default'],
      ['pointer to nothing', { ...RESOLVER, resolutionOrder: [{ $ref: '#/sets/nope' }] }, '#/sets/nope'],
      ['file outside the project', { ...RESOLVER, sets: { base: { sources: [{ $ref: '../outside.json' }] } } }, 'outside the project'],
      ['symlink out of the project', { ...RESOLVER, sets: { base: { sources: [{ $ref: 'tokens/escape.json' }] } } }, 'outside the project'],
      [
        'circular sets',
        { ...RESOLVER, sets: { a: { sources: [{ $ref: '#/sets/b' }] }, b: { sources: [{ $ref: '#/sets/a' }] } }, resolutionOrder: [{ $ref: '#/sets/a' }] },
        'circular',
      ],
    ];

    for (const [name, resolver, mention] of cases) {
      const root = localeProject({ 'blazon.resolver.json': resolver });
      // Real token files outside the project, so only the containment check can refuse them
      fs.writeFileSync(path.join(root, '..', 'outside.json'), JSON.stringify(BASE));
      const elsewhere = tempDir();
      fs.writeFileSync(path.join(elsewhere, 'base.json'), JSON.stringify(BASE));
      fs.symlinkSync(path.join(elsewhere, 'base.json'), path.join(root, 'tokens', 'escape.json'));
      const data = await compile(root);
      const finding = data.findings.find((f) => f.code === 'resolver-invalid');
      expect(finding, name).toBeDefined();
      expect(finding!.severity, name).toBe('error');
      expect(finding!.message, name).toContain(mention);
    }
  });

  it('checks each context, tagging findings that only occur there', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      'tokens/base.json': {
        ...BASE,
        rules: { $extensions: { 'dev.blazon': { pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] } } },
      },
      // Grey on grey in dark only
      'tokens/dark.json': { color: { ink: { $value: '#777777' }, paper: { $value: '#666666' } } },
    });
    const data = await compile(root);

    expect(data.findings.filter((f) => f.severity !== 'info').map((f) => `${f.context ?? 'default'}:${f.code}`)).toEqual(['theme=dark:contrast']);
  });
});

describe('emitTokenOutputs: resolver contexts', () => {
  it('adds a CSS block per context with only the changed variables, and contexts to tokens.ts and per-context DTCG files', async () => {
    const root = localeProject();
    const config = { ...TEST_CONFIG };
    const data = await compileBlazonData(config, root);
    const paths = await emitTokenOutputs(data, config, root);
    const css = fs.readFileSync(paths.cssPath, 'utf-8');

    expect(css).toContain(':lang(ja) {\n  --font-body: Kinto, Inter, sans-serif;\n  --type-h1: 600 64px/1.125 Kinto, Inter, sans-serif;');
    expect(css).toContain(':lang(de) {\n  --type-h1: 600 56px/1.143 Inter, sans-serif;');
    expect(css.slice(css.indexOf(':lang(de)'))).not.toContain('--font-body');

    const ts = fs.readFileSync(paths.tsPath, 'utf-8');
    expect(ts).toMatch(/export const contexts = \{\s+"locale": \{\s+"ja": \{\s+"font.body": "Kinto, Inter, sans-serif"/);

    const ja = JSON.parse(fs.readFileSync(path.join(path.dirname(paths.jsonPath), 'tokens.locale.ja.json'), 'utf-8'));
    expect(ja.font.body).toEqual({ $type: 'fontFamily', $value: ['Kinto', 'Inter', 'sans-serif'] });
    expect(ja.color.ink.$value).toBe('#000000');
  });
});

describe('emitTokenOutputs: a context that changes only what a token says', () => {
  it("keeps the new description, deprecation and extension in that context's DTCG file, and writes no CSS for it", async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { locale: { contexts: { en: [], ja: [{ $ref: 'tokens/ja.json' }] }, default: 'en' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/locale' }],
      },
      'tokens/base.json': { color: { $type: 'color', ink: { $value: '#000000', $description: 'Base ink' }, paper: { $value: '#FFFFFF' } } },
      // A token in a later document replaces the earlier one whole, so the context states it again, with the same value
      'tokens/ja.json': { color: { ink: { $value: '#000000', $description: 'Ink for Japanese', $deprecated: 'use paper', $extensions: { 'com.acme': { note: 'ja' } } } } },
    });
    const config = { ...TEST_CONFIG };
    const paths = await emitTokenOutputs(await compileBlazonData(config, root), config, root);
    const dir = path.dirname(paths.jsonPath);
    const ja = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.locale.ja.json'), 'utf-8'));
    expect(ja.color.ink).toMatchObject({ $value: '#000000', $description: 'Ink for Japanese', $deprecated: 'use paper', $extensions: { 'com.acme': { note: 'ja' } } });
    expect(JSON.parse(fs.readFileSync(paths.jsonPath, 'utf-8')).color.ink.$description).toBe('Base ink');
    // The value did not change, so the context has nothing to say in CSS
    expect(fs.readFileSync(paths.cssPath, 'utf-8')).not.toContain(':lang(ja)');
    // brand.json says it too, apart from the tokens whose value changed
    const brand = JSON.parse(formatBrandJson(await compileBlazonData(config, root), config, root));
    // The type of the export has the key, so a program reading it needs no cast
    const typed: BrandExport = brand;
    expect(typed.contexts[0]!.metadataChanges?.[0]?.path).toBe('color.ink');
    expect(brand.contexts[0].tokens).toEqual([]);
    expect(brand.contexts[0].metadataChanges).toEqual([expect.objectContaining({ path: 'color.ink', description: 'Ink for Japanese', deprecated: 'use paper' })]);
    // and a context that changes no description has no such key
    const plain = localeProject();
    expect(JSON.parse(formatBrandJson(await compileBlazonData(config, plain), config, plain)).contexts[0]).not.toHaveProperty('metadataChanges');
  });
});

describe('a context that points a token at another token with the same value', () => {
  const root = () =>
    writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { brand: { contexts: { a: [], b: [{ $ref: 'tokens/b.json' }] }, default: 'a' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/brand' }],
      },
      'tokens/base.json': { color: { $type: 'color', one: { $value: '#336699' }, two: { $value: '#336699' }, link: { $value: '{color.one}' } } },
      'tokens/b.json': { color: { link: { $value: '{color.two}' } } },
    });

  it('keeps the change of alias, though the CSS value is the same', async () => {
    const data = await compileBlazonData({ ...TEST_CONFIG }, root());
    const context = data.tokens.contexts![0]!;
    expect(context.tokens).toEqual([]);
    expect(context.metadataChanges!.map((t) => [t.path, t.aliasOf, t.rawValue])).toEqual([['color.link', 'color.two', '{color.two}']]);
    expect(contextItems(data.tokens.items, [context]).find((t) => t.path === 'color.link')).toMatchObject({ aliasOf: 'color.two', rawValue: '{color.two}', value: '#336699' });
    expect(data.tokens.items.find((t) => t.path === 'color.link')!.aliasOf).toBe('color.one');
  });
});

describe('a finding about a token says which file to open', () => {
  const bad = { $type: 'color', $value: 'notacolor' };
  const fileOf = async (root: string, tokenPath: string) => {
    const data = await compileBlazonData({ ...TEST_CONFIG }, root);
    return data.findings.find((f) => f.code === 'invalid-value' && f.path === tokenPath);
  };

  it('is the file as the project names it, for a source a resolver document points at', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] }, ja: { sources: [{ $ref: 'tokens/locale/ja.json' }] } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/sets/ja' }],
      },
      'tokens/base.json': { ...BASE, color: { ...BASE.color, oops: bad } },
      'tokens/locale/ja.json': { color: { oopsJa: bad } },
    });
    const base = await fileOf(root, 'color.oops');
    expect(base).toMatchObject({ file: 'tokens/base.json' });
    expect(base!.line).toEqual(expect.any(Number));
    expect(await fileOf(root, 'color.oopsJa')).toMatchObject({ file: 'tokens/locale/ja.json' });
  });

  it('is the resolver document itself, with no line, for a source written inside it', async () => {
    const root = writeProject({
      'blazon.resolver.json': { version: '2025.10', sets: { base: { sources: [{ color: { oops: bad } }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] },
    });
    const found = await fileOf(root, 'color.oops');
    expect(found).toMatchObject({ file: 'blazon.resolver.json' });
    expect(found!.line).toBeUndefined();
  });

  it('is from the project root for a tokens folder that is not directly in it, and so is a file that does not parse', async () => {
    const root = writeProject({ 'brand/tokens/colors.json': { color: { oops: bad } }, 'brand/tokens/broken.json': '{ "color": ' });
    const data = await compileBlazonData({ ...TEST_CONFIG, tokensDir: './brand/tokens' }, root);
    expect(data.findings.find((f) => f.code === 'invalid-value')).toMatchObject({ file: 'brand/tokens/colors.json' });
    expect(data.findings.find((f) => f.code === 'invalid-json')).toMatchObject({ path: 'brand/tokens/broken.json', file: 'brand/tokens/broken.json' });
    expect(data.tokens.items.find((t) => t.path === 'color.oops')!.file).toBe('brand/tokens/colors.json');
  });

  it('is the resolver document with its folder, for a source written inside a resolver that is not at the root', async () => {
    const root = writeProject({
      'brand/blazon.resolver.json': { version: '2025.10', sets: { base: { sources: [{ color: { oops: bad } }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] },
    });
    const data = await compileBlazonData({ ...TEST_CONFIG, resolver: 'brand/blazon.resolver.json' }, root);
    expect(data.findings.find((f) => f.code === 'invalid-value')).toMatchObject({ file: 'brand/blazon.resolver.json' });
  });

  it('is the same for a project with no resolver, where the files are read from the tokens folder', async () => {
    const root = writeProject({ 'tokens/colors.json': { color: { oops: bad } } });
    expect(await fileOf(root, 'color.oops')).toMatchObject({ file: 'tokens/colors.json', line: expect.any(Number) });
  });
});

describe('checks run in every context', () => {
  it('reports a malformed font license that only a non-default context has', async () => {
    const root = localeProject({
      'tokens/locale/ja.json': { font: { body: { $value: ['Kinto', 'sans-serif'], $extensions: { 'dev.blazon': { font: { license: 7 } } } } } },
    });
    const data = await compile(root);
    expect(data.findings.filter((f) => f.code === 'invalid-font-meta').map((f) => `${f.context}:${f.path}`)).toEqual(['locale=ja:font.body']);
  });
});
