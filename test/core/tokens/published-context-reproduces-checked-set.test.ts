import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { contextItems } from '../../../src/core/tokens/contexts.js';
import { compileWithResolver } from '../../../src/core/tokens/resolver/compile.js';
import { compileBlazonData, planTokenOutputs } from '../../../src/core/index.js';
import type { TokenItem } from '../../../src/types/index.js';
import { writeProject, TEST_CONFIG } from '../../support/helpers.js';

// Property: applying a published context to the default reproduces the token membership and the group rules the checker saw.
//
// For each non-default context there are three views, and they must agree:
//  - checked:  what the resolver produced for that context, the set `blazon check` ran its rules on (compile.ts `resolved`)
//  - emitted:  the tokens in the context's DTCG file, `tokens.<modifier>.<context>.json` (emit.ts)
//  - published: what a plugin gets by reading brand.json: the default tokens with the context's `tokens` and `metadataChanges` applied through
//    `contextItems`, and the default's groups (brand.json has no groups per context)
// A context that leaves out a token the default has is what the stored changes cannot say: they list additions and edits, never removals.

type Memberships = { checked: string[]; emitted: string[]; published: string[] };
type GroupRules = Record<string, { description?: string; pairs?: unknown }>;

/** The paths of the tokens in a DTCG document (an object with `$value`), in document order. */
function dtcgPaths(node: unknown, prefix: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  if ('$value' in record) return [prefix.join('.')];
  return Object.entries(record)
    .filter(([key]) => !key.startsWith('$'))
    .flatMap(([key, child]) => dtcgPaths(child, [...prefix, key]));
}

const sorted = (paths: readonly string[]) => [...paths].sort();

async function build(root: string) {
  const config = { ...TEST_CONFIG, tokensOutDir: './out/tokens' };
  const data = await compileBlazonData(config, root);
  const compiled = compileWithResolver(path.join(root, 'blazon.resolver.json'), root, config.cssPrefix, config.contextSelectors);
  const { files } = planTokenOutputs(data, config, root, { allowErrors: true });
  const brand = buildBrandExport(data, config, root, null);
  return { data, compiled, files, brand };
}

/** The membership of every non-default context, by `modifier.context`, in the three views. */
export async function contextMemberships(root: string): Promise<Record<string, Memberships>> {
  const { compiled, files, brand } = await build(root);
  const out: Record<string, Memberships> = {};
  for (const { context, tokens } of compiled.resolved) {
    const name = `${context.modifier}.${context.context}`;
    const file = files.get(`tokens.${name}.json`);
    const published = brand.contexts.find((c) => c.modifier === context.modifier && c.context === context.context);
    out[name] = {
      checked: sorted(tokens.items.map((t) => t.path)),
      emitted: sorted(dtcgPaths(JSON.parse(file ?? '{}'))),
      // Put back together the way a reader of brand.json does, with the same helper the emitter uses
      published: sorted(contextItems(brand.tokens as unknown as TokenItem[], [published as never]).map((t) => t.path)),
    };
  }
  return out;
}

/**
 * The group descriptions and contrast pairs of every non-default context, as the checker saw them and as brand.json publishes them. The DTCG
 * files carry no group metadata in any context (formatJsonTokens writes tokens only), so they are not a view here.
 */
export async function contextGroupRules(root: string): Promise<Record<string, { checked: GroupRules; published: GroupRules }>> {
  const { compiled, brand } = await build(root);
  const out: Record<string, { checked: GroupRules; published: GroupRules }> = {};
  const fromMeta = (groups: readonly { path: string; description?: string; blazon?: { pairs?: unknown } }[]): GroupRules =>
    Object.fromEntries(
      groups
        .filter((g) => g.description !== undefined || g.blazon?.pairs !== undefined)
        .map((g) => [g.path, { ...(g.description !== undefined && { description: g.description }), ...(g.blazon?.pairs !== undefined && { pairs: g.blazon.pairs }) }]),
    );
  for (const { context, tokens } of compiled.resolved) {
    const name = `${context.modifier}.${context.context}`;
    out[name] = {
      checked: fromMeta(tokens.groupMeta),
      // brand.json carries the default's groups only; no context has a group of its own
      published: fromMeta(brand.groups),
    };
  }
  return out;
}

const SMALL = { space: { $type: 'dimension', small: { $value: { value: 4, unit: 'px' } } } };
const LARGE = { space: { $type: 'dimension', large: { $value: { value: 16, unit: 'px' } } } };

/** Two exclusive contexts of one modifier, no base set: en has only space.small and ja has only space.large. */
function exclusiveLocaleProject(): string {
  return writeProject({
    'blazon.resolver.json': {
      version: '2025.10',
      modifiers: { locale: { contexts: { en: [{ $ref: 'tokens/en.json' }], ja: [{ $ref: 'tokens/ja.json' }] }, default: 'en' } },
      resolutionOrder: [{ $ref: '#/modifiers/locale' }],
    },
    'tokens/en.json': SMALL,
    'tokens/ja.json': LARGE,
  });
}

/** The closest shape with a base set: the default theme has two tokens, the dark context's file leaves one out. */
function removalOverBaseProject(): string {
  return writeProject({
    'blazon.resolver.json': {
      version: '2025.10',
      modifiers: { theme: { contexts: { light: [{ $ref: 'tokens/light.json' }], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    },
    'tokens/light.json': { color: { $type: 'color', ink: { $value: '#000000' }, accent: { $value: '#ff0000' } } },
    'tokens/dark.json': { color: { $type: 'color', ink: { $value: '#ffffff' } } },
  });
}

/** A group description and a contrast pair that the dark context changes. */
function groupRulesProject(): string {
  const colors = (ink: string, paper: string) => ({ ink: { $value: ink }, paper: { $value: paper } });
  const rules = (description: string, min: string) => ({
    $description: description,
    $extensions: { 'dev.blazon': { pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min }] } },
  });
  return writeProject({
    'blazon.resolver.json': {
      version: '2025.10',
      modifiers: { theme: { contexts: { light: [{ $ref: 'tokens/light.json' }], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    },
    'tokens/light.json': { color: { $type: 'color', ...colors('#000000', '#ffffff'), ...rules('Acme light surfaces', 'AA') } },
    'tokens/dark.json': { color: { $type: 'color', ...colors('#ffffff', '#000000'), ...rules('Acme dark surfaces', 'AAA') } },
  });
}

describe('applying a published context to the default reproduces the token membership and the group rules the checker saw', () => {
  it('helper sanity: the three views of a context that only edits a value agree', async () => {
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      'tokens/base.json': { color: { $type: 'color', ink: { $value: '#000000' }, accent: { $value: '#ff0000' } } },
      'tokens/dark.json': { color: { ink: { $value: '#ffffff' } } },
    });
    const { 'theme.dark': dark } = await contextMemberships(root);
    expect(dark?.checked).toEqual(['color.accent', 'color.ink']);
    expect(dark?.emitted).toEqual(dark?.checked);
    expect(dark?.published).toEqual(dark?.checked);
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The review's scenario: contexts that replace each other, with no base set
  it.fails('exclusive contexts: ja holds only space.large, and the emitted file and brand.json agree', async () => {
    const root = exclusiveLocaleProject();
    const { 'locale.ja': ja } = await contextMemberships(root);
    expect(ja?.checked).toEqual(['space.large']);
    expect(ja?.emitted).toEqual(ja?.checked);
    expect(ja?.published).toEqual(ja?.checked);
    fs.rmSync(root, { recursive: true, force: true });
  });

  // A context file that leaves out a token the default has
  it.fails('a context that leaves a token out does not publish it', async () => {
    const root = removalOverBaseProject();
    const { 'theme.dark': dark } = await contextMemberships(root);
    expect(dark?.checked).toEqual(['color.ink']);
    expect(dark?.emitted).toEqual(dark?.checked);
    expect(dark?.published).toEqual(dark?.checked);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.fails('a context-specific group description and contrast pair reach brand.json', async () => {
    const root = groupRulesProject();
    const { 'theme.dark': dark } = await contextGroupRules(root);
    expect(dark?.checked.color).toEqual({ description: 'Acme dark surfaces', pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AAA' }] });
    expect(dark?.published).toEqual(dark?.checked);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
