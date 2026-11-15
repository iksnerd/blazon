import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileBlazonData, emitTokenOutputs } from '../../../src/core/index.js';
import { parseResolver, ResolverError } from '../../../src/core/tokens/resolver/parse.js';
import { writeProject, TEST_CONFIG } from '../../support/helpers.js';
import type { BlazonConfig } from '../../../src/types/index.js';

const BASE = { color: { $type: 'color', ink: { $value: '#000000' } } };
const DARK = { color: { ink: { $value: '#ffffff' } } };

const resolver = (over: Record<string, unknown>) => ({
  version: '2025.10',
  sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
  modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  ...over,
});

const project = (res: unknown) => writeProject({ 'blazon.resolver.json': res as Record<string, unknown>, 'tokens/base.json': BASE, 'tokens/dark.json': DARK });
const resolverFindings = async (root: string) => (await compileBlazonData({ ...TEST_CONFIG }, root)).findings.filter((f) => f.code === 'resolver-invalid');

describe('a resolver that reuses a name', () => {
  it('rejects an inline modifier named like a declared modifier', async () => {
    const root = project(
      resolver({
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }, { name: 'theme', type: 'modifier', contexts: { a: [], b: [] }, default: 'a' }],
      }),
    );
    const found = await resolverFindings(root);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/theme/);
  });

  it('rejects an inline item named like a set', async () => {
    const root = project(resolver({ resolutionOrder: [{ $ref: '#/sets/base' }, { name: 'base', type: 'modifier', contexts: { a: [] }, default: 'a' }] }));
    expect(await resolverFindings(root)).toHaveLength(1);
  });

  it('never throws for malformed resolvers', async () => {
    const odd: unknown[] = [
      resolver({
        resolutionOrder: [
          { name: 'x', type: 'modifier', contexts: { a: [] }, default: 'a' },
          { name: 'x', type: 'set', sources: [] },
        ],
      }),
      resolver({ resolutionOrder: [{ $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/theme' }] }),
      resolver({ modifiers: { theme: { contexts: { light: [], dark: [{ $ref: '#/modifiers/theme' }] }, default: 'light' } } }),
      resolver({ modifiers: { theme: { contexts: { odd: [] }, default: 'nope' } } }),
      resolver({ resolutionOrder: [{ name: 'theme', type: 'modifier', contexts: { dark: [] }, default: 'dark' }] }),
      resolver({ resolutionOrder: [null, 3, 'x'] }),
      resolver({ sets: { base: { sources: [{ $ref: 'tokens/base.json' }, { $ref: '#/sets/base' }] } } }),
    ];
    for (const res of odd) {
      const root = project(res);
      await expect(compileBlazonData({ ...TEST_CONFIG }, root)).resolves.toBeDefined();
    }
  });
});

describe('modifier and context names (output file names, selectors, comments)', () => {
  const bad = ['../../../x', 'high.contrast', 'a/b', 'a b', '*/', 'a"b', ''];
  it.each(bad)('rejects the context name %j', (name) => {
    const res = resolver({ modifiers: { theme: { contexts: { light: [], [name]: [] }, default: 'light' } } });
    expect(() => parseResolver('/p/blazon.resolver.json', res)).toThrow(ResolverError);
  });
  it.each(bad)('rejects the modifier name %j', (name) => {
    const res = resolver({ modifiers: { [name]: { contexts: { light: [] }, default: 'light' } }, resolutionOrder: [] });
    expect(() => parseResolver('/p/blazon.resolver.json', res)).toThrow(ResolverError);
  });
  it('rejects a bad inline modifier name', () => {
    const res = resolver({ resolutionOrder: [{ name: '../x', type: 'modifier', contexts: { a: [] }, default: 'a' }] });
    expect(() => parseResolver('/p/blazon.resolver.json', res)).toThrow(ResolverError);
  });
  it('accepts letters, digits, underscore and hyphen', () => {
    const res = resolver({ modifiers: { 'my_theme-2': { contexts: { 'en-GB': [], high_contrast: [] }, default: 'en-GB' } }, resolutionOrder: [] });
    expect(() => parseResolver('/p/blazon.resolver.json', res)).not.toThrow();
  });
  it('reports a bad name as resolver-invalid and writes nothing outside tokensOutDir', async () => {
    const root = project(resolver({ modifiers: { theme: { contexts: { light: [], '../../../x': [{ $ref: 'tokens/dark.json' }] }, default: 'light' } } }));
    expect(await resolverFindings(root)).toHaveLength(1);
    const config = { ...TEST_CONFIG, tokensOutDir: 'out/tokens' } as BlazonConfig;
    await emitTokenOutputs(await compileBlazonData(config, root), config, root, { allowErrors: true }).catch(() => undefined);
    expect(fs.existsSync(path.join(root, 'out', 'tokens.theme.json'))).toBe(false);
    expect(fs.readdirSync(path.join(root, 'out')).sort()).toEqual(['tokens']);
  });
  it('emit refuses a context name that would leave tokensOutDir, even if the parser let it through', async () => {
    const root = project(resolver({}));
    const config = { ...TEST_CONFIG, tokensOutDir: 'out/tokens' } as BlazonConfig;
    const data = await compileBlazonData(config, root);
    data.tokens.contexts = [{ ...data.tokens.contexts![0]!, context: '../../../x' }];
    await expect(emitTokenOutputs(data, config, root)).rejects.toThrow(/outside tokensOutDir/);
  });
});
