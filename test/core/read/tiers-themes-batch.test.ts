import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { MAX_PAIRS } from '../../../src/core/operations/limits.js';
import { LookupError, canUse, canUseMany, describeToken, listTokens, withoutChecks } from '../../../src/core/read/index.js';
import type { BlazonData } from '../../../src/types/index.js';
import { tempProject } from '../../support/project.js';

// A brand with tiers and a resolver `theme` modifier, for the tier filter, the theme option, the batch form of canUse and the denial text.

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const blazon = (value: unknown) => ({ $extensions: { 'dev.blazon': value } });

let themed: BlazonData;
let plain: BlazonData;
beforeAll(async () => {
  const files = {
    'tokens/a.json': {
      color: { $type: 'color', ...blazon({ tier: 'primitive' }), ink: { $value: '#111111' }, paper: { $value: '#ffffff' }, white: { $value: '#ffffff' } },
      action: { $type: 'color', ...blazon({ tier: 'semantic' }), primary: { $value: '{color.ink}' } },
      text: {
        $type: 'color',
        ...blazon({ tier: 'semantic', pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }),
        body: { $value: '{color.ink}' },
      },
      component: { $type: 'color', ...blazon({ tier: 'component' }), button: { bg: { $value: '{action.primary}' }, label: { $value: '{color.white}' } } },
      space: { $type: 'dimension', one: { $value: '4px' } },
    },
    'logo.svg': LOGO,
  };
  themed = await compileBlazonData(
    { ...DEFAULT_CONFIG },
    tempProject({
      ...files,
      'tokens/dark.json': { color: { paper: { $value: '#000000' }, ink: { $value: '#eeeeee' } } },
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/a.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
    }),
  );
  plain = await compileBlazonData({ ...DEFAULT_CONFIG }, tempProject(files));
});

describe('listTokens tier', () => {
  it('lists the tier of each token and keeps to one tier', () => {
    const all = listTokens(themed).tokens;
    expect(all.find((t) => t.path === 'color.ink')).toMatchObject({ tier: 'primitive' });
    expect(all.find((t) => t.path === 'space.one')?.tier).toBeUndefined();
    const found = listTokens(themed, { tier: 'component' });
    expect(found.tier).toBe('component');
    expect(found.tokens.map((t) => t.path)).toEqual(['component.button.bg', 'component.button.label']);
    expect(listTokens(themed, { tier: 'semantic', type: 'color' }).tokens.map((t) => t.path)).toEqual(['action.primary', 'text.body']);
  });

  it('refuses a tier that is not one of the three, naming them', () => {
    expect(() => listTokens(themed, { tier: 'atom' })).toThrow(LookupError);
    expect(() => listTokens(themed, { tier: 'atom' })).toThrow('the tiers are primitive, semantic, component');
  });
});

describe('theme', () => {
  it('lists the themes the brand has, and none when it has no resolver', () => {
    expect(listTokens(themed).themes).toEqual(['light', 'dark']);
    expect(listTokens(plain).themes).toBeUndefined();
  });

  it('lists the values as a theme resolves them, with the default value where it differs', () => {
    const dark = listTokens(themed, { theme: 'dark', group: 'color' });
    expect(dark.theme).toBe('dark');
    expect(dark.tokens.find((t) => t.path === 'color.paper')).toMatchObject({ value: '#000000', defaultValue: '#ffffff' });
    expect(dark.tokens.find((t) => t.path === 'color.white')?.defaultValue).toBeUndefined();
    expect(listTokens(themed, { group: 'color' }).tokens.find((t) => t.path === 'color.paper')).toEqual({
      path: 'color.paper',
      type: 'color',
      value: '#ffffff',
      tier: 'primitive',
    });
  });

  it('refuses a theme that is not there, naming the themes, and any theme when the brand has no resolver', () => {
    expect(() => listTokens(themed, { theme: 'sepia' })).toThrow('The themes are "light", "dark"');
    expect(() => listTokens(plain, { theme: 'dark' })).toThrow('has no themes');
  });

  it('describes a token as a theme resolves it, with the default value where it differs', () => {
    expect(describeToken(themed, 'color.paper', 'dark')).toMatchObject({ value: '#000000', defaultValue: '#ffffff', theme: 'dark' });
    expect(describeToken(themed, 'color.white', 'dark').defaultValue).toBeUndefined();
    expect(describeToken(themed, 'color.paper').theme).toBeUndefined();
    expect(() => describeToken(themed, 'color.paper', 'sepia')).toThrow('The themes are "light", "dark"');
  });
});

describe('canUseMany', () => {
  const pairs = [
    { fg: 'color.ink', bg: 'color.paper' },
    { fg: 'color.paper', bg: 'color.ink' },
  ];

  it('answers each pair in order, each equal to the single call', () => {
    const answers = canUseMany(themed, pairs);
    expect(answers.map((a) => [a.fg, a.bg, a.allowed])).toEqual([
      ['color.ink', 'color.paper', true],
      ['color.paper', 'color.ink', false],
    ]);
    expect(answers[0]).toEqual(canUse(themed, 'color.ink', 'color.paper'));
    expect(canUseMany(themed, [pairs[0]!], 'text', 'dark')[0]).toMatchObject({ theme: 'dark' });
  });

  it('names the pair that has an unknown token, and refuses an empty batch and one over the limit', () => {
    expect(() => canUseMany(themed, [pairs[0]!, { fg: 'color.nope', bg: 'color.paper' }])).toThrow(/^pairs\[1\]: /);
    expect(() =>
      canUseMany(
        themed,
        Array.from({ length: MAX_PAIRS + 1 }, () => pairs[0]!),
      ),
    ).toThrow(`at most ${MAX_PAIRS} pairs`);
    expect(() => canUseMany(themed, [])).toThrow('at least one pair');
  });

  it('leaves out the checks of an allowed answer and keeps those of a denial', () => {
    const [yes, no] = canUseMany(themed, pairs);
    expect(withoutChecks(yes!).checks).toBeUndefined();
    expect(withoutChecks(no!).checks).toEqual(no!.checks);
  });
});

describe('the denial of a pair nothing lists', () => {
  it('says that component tokens are not read for pairs, and where a pair is declared', () => {
    // component.button.bg aliases action.primary and .label aliases color.white, but only `pairs` on a group counts
    const denied = canUse(themed, 'color.white', 'action.primary');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('no pair lists {color.white} on {action.primary}');
    expect(denied.reason).toContain('Component tokens are not read for pairs');
    expect(denied.reason).toContain('`pairs` on a token group');
    expect(denied.reason).toContain('docs/manual/02-tokens.md');
  });
});
