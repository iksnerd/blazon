import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { resolveConfig } from '../../../src/core/config/index.js';
import { compileBlazonData, emitTokenOutputs } from '../../../src/core/index.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { writeProject, TEST_CONFIG } from '../../support/helpers.js';

// A token or group named like an Object.prototype member is an ordinary name (RFC 0001 §1). JSON.parse makes
// `__proto__` an own key, so a merger that writes `target[key]` would walk into the shared prototype instead.

const POISONED = [
  '{"__proto__":{"$type":"color","polluted":{"$value":"#ff0000"},"ink":{"$value":"#000000"}}}',
  '{"constructor":{"$type":"color","a":{"$value":"#00ff00"}},"prototype":{"$type":"color","b":{"$value":"#0000ff"}}}',
];

/** Runs `body`, then removes anything it leaked onto Object.prototype so one failure cannot poison the next test. */
async function guarded(body: (before: string[]) => Promise<void>): Promise<void> {
  const before = Object.getOwnPropertyNames(Object.prototype);
  try {
    await body(before);
  } finally {
    for (const key of Object.getOwnPropertyNames(Object.prototype)) {
      if (!before.includes(key)) delete (Object.prototype as Record<string, unknown>)[key];
    }
    if (Object.getPrototypeOf(Object.prototype) !== null) Object.setPrototypeOf(Object.prototype, null);
  }
}

function expectClean(before: string[]): void {
  expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
  expect(Object.getPrototypeOf(Object.prototype)).toBeNull();
  const probe = {} as Record<string, unknown>;
  for (const key of ['polluted', 'ink', 'a', 'b', '$type', '$value']) expect(probe[key]).toBeUndefined();
}

const compile = (root: string, config: Partial<BlazonConfig> = {}) => compileBlazonData({ ...TEST_CONFIG, ...config }, root);

describe('token keys named like Object.prototype members', () => {
  it('keeps a `__proto__` group as an own group and leaves Object.prototype alone', () =>
    guarded(async (before) => {
      const root = writeProject({ 'tokens/a.json': POISONED[0]!, 'tokens/b.json': '{"__proto__":{"extra":{"$value":"#111111"}}}' });
      const data = await compile(root);
      expectClean(before);

      expect(data.tokens.items.map((t) => t.path).sort()).toEqual(['__proto__.extra', '__proto__.ink', '__proto__.polluted']);
      expect(data.tokens.byPath.get('__proto__.polluted')?.type).toBe('color');
      expect(data.tokens.byPath.get('__proto__.ink')?.value).toBe('#000000');
      expect(data.tokens.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(Object.hasOwn(data.tokens.nested, '__proto__')).toBe(true);
    }));

  it('keeps `constructor` and `prototype` groups under their own paths', () =>
    guarded(async (before) => {
      const data = await compile(writeProject({ 'tokens/a.json': POISONED[1]! }));
      expectClean(before);

      expect(data.tokens.items.map((t) => t.path).sort()).toEqual(['constructor.a', 'prototype.b']);
      expect(data.tokens.byPath.get('constructor.a')?.value).toBe('#00ff00');
      expect(Object.hasOwn(data.tokens.nested, 'constructor')).toBe(true);
      expect(Object.hasOwn(data.tokens.nested, 'prototype')).toBe(true);
    }));

  it('reports a later `constructor` token as a redefinition rather than reading Object.prototype.constructor', () =>
    guarded(async (before) => {
      const one = '{"color":{"$type":"color","constructor":{"$value":"#111111"}}}';
      const two = '{"color":{"$type":"color","constructor":{"$value":"#222222"}}}';
      const data = await compile(writeProject({ 'tokens/a.json': one, 'tokens/b.json': two }));
      expectClean(before);

      expect(data.tokens.byPath.get('color.constructor')?.value).toBe('#222222');
      expect(data.tokens.problems.map((p) => p.code)).toEqual(['token-path-duplicate']);
    }));

  it('writes the same names to tokens.json, tokens.ts and brand.json', () =>
    guarded(async (before) => {
      const root = writeProject({ 'tokens/a.json': POISONED[0]!, 'tokens/b.json': POISONED[1]! });
      const config = { ...TEST_CONFIG, tokensOutDir: 'out' } as BlazonConfig;
      const data = await compileBlazonData(config, root);
      const { jsonPath, tsPath } = await emitTokenOutputs(data, config, root);
      const brand = JSON.parse(JSON.stringify(buildBrandExport(data, config, root)));
      expectClean(before);

      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(Object.keys(json).sort()).toEqual(['__proto__', 'constructor', 'prototype']);
      expect(json['__proto__'].polluted.$value).toBe('#ff0000');
      expect(json.constructor.a.$value).toBe('#00ff00');
      expect(fs.readFileSync(tsPath, 'utf-8')).toContain('"__proto__.polluted"');
      expect(brand.tokens.map((t: { path: string }) => t.path).sort()).toEqual(['__proto__.ink', '__proto__.polluted', 'constructor.a', 'prototype.b']);
      expect(path.basename(jsonPath)).toBe('tokens.json');
    }));
});

describe('the generated TypeScript module', () => {
  it('keeps a token named `__proto__` as an own key, so getToken and getVar read it and not Object.prototype', () =>
    guarded(async (before) => {
      const root = writeProject({ 'tokens/a.json': '{"__proto__":{"$type":"number","$value":7},"size":{"$type":"number","$value":3}}' });
      const config = { ...TEST_CONFIG, tokensOutDir: 'out' } as BlazonConfig;
      const data = await compileBlazonData(config, root);
      const { tsPath } = await emitTokenOutputs(data, config, root);
      expectClean(before);

      const source = fs.readFileSync(tsPath, 'utf-8');
      expect(source).not.toMatch(/^\s*"__proto__":/m);
      const mod = await import(/* @vite-ignore */ tsPath);
      expect(mod.getToken('__proto__')).toBe(7);
      expect(mod.getToken('size')).toBe(3);
      expect(mod.getVar('__proto__')).toBe(`var(${data.tokens.byPath.get('__proto__')!.cssVariable})`);
      expect(Object.getPrototypeOf(mod.flatTokens)).toBe(Object.prototype);
    }));
});

describe('a resolver context named `__proto__`', () => {
  it('is kept in the generated TypeScript contexts export, with its tokens', () =>
    guarded(async (before) => {
      const root = writeProject({
        'blazon.resolver.json': {
          version: '2025.10',
          sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
          modifiers: { theme: { contexts: { light: [], ['__proto__']: [{ $ref: 'tokens/odd.json' }] }, default: 'light' } },
          resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
        },
        'tokens/base.json': '{"size":{"$type":"number","a":{"$value":1}}}',
        'tokens/odd.json': '{"size":{"a":{"$value":2}}}',
      });
      const config = { ...TEST_CONFIG, tokensOutDir: 'out' } as BlazonConfig;
      const data = await compileBlazonData(config, root);
      const { tsPath } = await emitTokenOutputs(data, config, root);
      expectClean(before);

      const mod = await import(/* @vite-ignore */ tsPath);
      expect(Object.keys(mod.contexts.theme)).toEqual(['__proto__']);
      expect(mod.contexts.theme['__proto__']).toEqual({ 'size.a': 2 });
      expect(Object.getPrototypeOf(mod.contexts.theme)).toBe(Object.prototype);
    }));
});

describe('resolver and config names that match Object.prototype members', () => {
  it('reports a `$ref` to an undefined set named `constructor` as resolver-invalid', () =>
    guarded(async (before) => {
      const root = writeProject({
        'blazon.resolver.json': { version: '2025.10', sets: {}, resolutionOrder: [{ $ref: '#/sets/constructor' }] },
      });
      const data = await compile(root);
      expectClean(before);
      expect(data.tokens.problems.map((p) => p.code)).toEqual(['resolver-invalid']);
    }));

  it('uses a modifier named `constructor` with the default selector, not a lookup on the selectors object', () =>
    guarded(async (before) => {
      const root = writeProject({
        'blazon.resolver.json': {
          version: '2025.10',
          modifiers: { constructor: { contexts: { a: [{ $ref: 'tokens/a.json' }], b: [{ $ref: 'tokens/b.json' }] }, default: 'a' } },
          resolutionOrder: [{ $ref: '#/modifiers/constructor' }],
        },
        'tokens/a.json': { color: { $type: 'color', ink: { $value: '#000000' } } },
        'tokens/b.json': { color: { $type: 'color', ink: { $value: '#ffffff' } } },
      });
      const data = await compile(root, { contextSelectors: {} });
      expectClean(before);
      expect(data.tokens.contexts?.[0]?.selector).toBe('[data-constructor="b"]');
    }));

  it('rejects a `vocabulary.constructor` list as an unknown field', () => {
    const { config, problems } = resolveConfig({ vocabulary: JSON.parse('{"constructor":["x"],"__proto__":["y"]}') });
    expect(problems.map((p) => p.message)).toEqual([expect.stringContaining('unknown field "constructor"'), expect.stringContaining('unknown field "__proto__"')]);
    expect(config.vocabulary).toEqual({});
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
