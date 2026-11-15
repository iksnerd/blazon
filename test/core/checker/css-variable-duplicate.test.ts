import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { checkTokens } from '../../../src/core/checker/index.js';
import { EXAMPLES, exampleProject, hasExample } from '../../support/examples.js';
import { compileTokens, writeProject } from '../../support/helpers.js';

const collisions = (findings: { code: string; path: string; message: string; context?: string }[]) => findings.filter((f) => f.code === 'css-variable-duplicate');

describe('css-variable-duplicate', () => {
  it('reports the later token when foo-bar and foo.bar write one variable', async () => {
    const data = await compileTokens({
      'a.json': { size: { $type: 'dimension', 'foo-bar': { $value: '4px' }, foo: { bar: { $value: '8px' } } } },
    });
    const result = checkTokens(data);

    expect(collisions(result.errors)).toEqual([
      {
        code: 'css-variable-duplicate',
        severity: 'error',
        path: 'size.foo.bar',
        message: 'size.foo.bar and size.foo-bar both write the CSS variable --size-foo-bar; rename one',
      },
    ]);
    expect(result.passed).toBe(false);
  });

  it('collides a token and an alias that resolve to the same value, and reports once per token', async () => {
    const data = await compileTokens({
      'a.json': {
        color: { $type: 'color', 'ink-soft': { $value: '#111111' }, ink: { soft: { $value: '{color.ink-soft}' } }, ink_soft: { $value: '#111111' } },
      },
    });

    expect(collisions(checkTokens(data).errors).map((f) => f.path)).toEqual(['color.ink.soft', 'color.ink_soft']);
  });

  it('counts the per-token part variables of a composite', async () => {
    const data = await compileTokens({
      'a.json': {
        font: { $type: 'fontFamily', body: { $value: ['Inter', 'sans-serif'] } },
        type: {
          $type: 'typography',
          h1: {
            $value: { fontFamily: '{font.body}', fontSize: { value: 64, unit: 'px' }, fontWeight: 600, letterSpacing: { value: 1, unit: 'px' }, lineHeight: 1.1 },
          },
        },
        'type-h1-letter-spacing': { $type: 'dimension', $value: '2px' },
      },
    });

    expect(collisions(checkTokens(data).errors).map((f) => f.path)).toEqual(['type-h1-letter-spacing']);
  });

  it('names tailwind.css when only the Tailwind names collide', async () => {
    const data = await compileTokens({
      'a.json': { color: { $type: 'color', brand: { $value: '#111111' } }, colors: { $type: 'color', brand: { $value: '#222222' } } },
    });
    const found = collisions(checkTokens(data).errors);

    expect(found.map((f) => f.path)).toEqual(['colors.brand']);
    expect(found[0]!.message).toBe('colors.brand and color.brand both write the CSS variable --color-brand in tailwind.css; rename one');
  });

  it('lets a semantic alias share its primitive tailwind.css name, since both hold one value', async () => {
    const data = await compileTokens({
      'a.json': { color: { $type: 'color', brand: { primary: { $value: '#111111' } } }, brand: { $type: 'color', primary: { $value: '{color.brand.primary}' } } },
    });

    expect(collisions(checkTokens(data).all)).toEqual([]);
  });

  it('does not report the same name in two different contexts', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { locale: { contexts: { en: [], ja: [{ $ref: 'tokens/ja.json' }] }, default: 'en' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/locale' }],
      },
      'tokens/base.json': { font: { $type: 'fontFamily', body: { $value: ['Inter', 'sans-serif'] } } },
      'tokens/ja.json': { font: { body: { $value: ['Kinto', 'sans-serif'] } } },
    });
    const data = await compileBlazonData({ ...DEFAULT_CONFIG }, root);

    expect(collisions(data.findings)).toEqual([]);
  });

  it('reports a collision between two tokens that a context block writes together', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { locale: { contexts: { en: [], ja: [{ $ref: 'tokens/ja.json' }] }, default: 'en' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/locale' }],
      },
      'tokens/base.json': { size: { $type: 'dimension', a: { $value: '1px' } } },
      'tokens/ja.json': { size: { 'foo-bar': { $value: '4px' }, foo: { bar: { $value: '8px' } } } },
    });
    const data = await compileBlazonData({ ...DEFAULT_CONFIG }, root);

    expect(collisions(data.findings).map((f) => `${f.path}@${f.context}`)).toEqual(['size.foo.bar@locale=ja']);
  });

  it('adds nothing to a project without a collision', async () => {
    const data = await compileTokens({ 'a.json': { color: { $type: 'color', ink: { $value: '#000000' }, paper: { $value: '#ffffff' } } } });

    expect(collisions(checkTokens(data).all)).toEqual([]);
  });

  for (const name of EXAMPLES) {
    it.skipIf(!hasExample(name))(`finds no collision in the ${name} example`, async () => {
      const dir = exampleProject(name);
      const data = await compileBlazonData(await loadConfig(dir), dir);

      expect(collisions(data.findings)).toEqual([]);
    });
  }
});
