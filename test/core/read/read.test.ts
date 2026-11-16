import { describe, it, expect, beforeAll } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { LookupError, canUse, describeFonts, describeLogo, describeToken, isGroupPath, listTokens, ruleEntries, tokenRules } from '../../../src/core/read/index.js';
import type { BlazonConfig, BlazonData } from '../../../src/types/index.js';
import { tempProject } from '../../support/project.js';

// The read side: what the brand says about one token, a rule, a pair, the fonts and the logo, as data. The CLI only prints it.

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const blazon = (value: unknown) => ({ $extensions: { 'dev.blazon': value } });

const tokens = {
  color: {
    $type: 'color',
    ink: { $value: '#111111' },
    paper: { $value: '#ffffff' },
    mid: { $value: '#777777' },
    flame: { $value: '#ff5500', ...blazon({ usage: { deny: ['text'] } }) },
    brand: { $extensions: { 'dev.blazon': { logo: { deny: ['onDark'], reason: 'the mark vanishes' } } }, blue: { $value: '#0033cc' } },
  },
  text: {
    $type: 'color',
    ...blazon({
      pairs: [
        { fg: '{text.body}', bg: '{surface.page}', min: 'AAA' },
        { fg: '{text.faint}', bg: '{surface.page}', min: 'AAA' },
        { fg: '{color.mid}', bg: '{color.paper}', min: 'AA-large' },
      ],
    }),
    body: { $value: '{color.ink}' },
    faint: { $value: '{color.mid}' },
    dim: { $value: '{color.mid}' },
    flame: { $value: '{color.flame}' },
  },
  surface: { $type: 'color', page: { $value: '{color.paper}' }, hot: { $value: '{color.flame}', ...blazon({ usage: { allow: ['accent'] } }) } },
  space: { $type: 'dimension', 4: { $value: '16px' } },
  font: {
    $type: 'fontFamily',
    display: { $value: ['Mulish', 'sans-serif'] },
    ui: { $value: ['system-ui'] },
    serif: { $value: ['Fraunces', 'serif'], ...blazon({ webFont: 'licensed' }) },
  },
  type: { h1: { $type: 'typography', $value: { fontFamily: '{font.display}', fontSize: '32px', fontWeight: 700, lineHeight: 1.2 } } },
};

let data: BlazonData;
let config: BlazonConfig;
let root: string;
beforeAll(async () => {
  root = tempProject({
    'tokens/a.json': tokens,
    'logo.svg': LOGO,
    'assets/logos/mark.svg': LOGO,
    'assets/logos/mark.json': { lockup: 'mark', clearSpace: { value: 8, unit: 'px' }, minSize: { width: { value: 16, unit: 'px' } }, ink: '#0033cc' },
    'fonts/Mulish.woff2': 'wOF2',
  });
  config = { ...DEFAULT_CONFIG, logo: { onLight: 'assets/logos/mark.svg' }, fonts: ['https://fonts.example/a.css', { family: 'Mulish', file: 'fonts/Mulish.woff2', weight: 700 }] };
  data = await compileBlazonData(config, root);
});

describe('describeToken', () => {
  it('gives the value, the type, the file and the CSS name', () => {
    const t = describeToken(data, 'color.ink');
    expect(t).toMatchObject({ path: 'color.ink', type: 'color', value: '#111111', sourceFile: 'tokens/a.json' });
    expect(t.names).toEqual({ theme: { variable: '--color-ink' } });
  });

  it('names theme.css by path, and no CSS framework', () => {
    const body = describeToken(data, 'text.body');
    expect(body.names.theme.variable).toBe('--text-body');
    expect(Object.keys(body.names)).toEqual(['theme']);
  });

  it("names a composite token's part variables and its typography class", () => {
    const h1 = describeToken(data, 'type.h1');
    expect(h1.names.theme.parts).toMatchObject({ fontSize: '--type-h1-font-size' });
    expect(h1.names.typographyClass).toBe('type-h1');
  });

  it('resolves an alias to its value and says what it aliases', () => {
    expect(describeToken(data, 'text.body')).toMatchObject({ value: '#111111', aliasOf: 'color.ink' });
  });

  it('accepts a path in braces and refuses an unknown one with the closest path', () => {
    expect(describeToken(data, '{color.ink}').path).toBe('color.ink');
    expect(() => describeToken(data, 'color.inc')).toThrow(/did you mean "color.ink"/);
    expect(() => describeToken(data, 'color')).toThrow(/is a group/);
    expect(() => describeToken(data, 'nope')).toThrow(LookupError);
  });
});

describe('listTokens', () => {
  it('lists every token with its type, its CSS-ready value and the token it aliases', () => {
    const { tokens: listed, group } = listTokens(data);
    expect(group).toBeUndefined();
    expect(listed.length).toBe(data.tokens.items.length);
    expect(listed.find((t) => t.path === 'color.ink')).toEqual({ path: 'color.ink', type: 'color', value: '#111111' });
    expect(listed.find((t) => t.path === 'text.body')).toEqual({ path: 'text.body', type: 'color', value: '#111111', aliasOf: 'color.ink' });
  });

  it('keeps to one group, which may be written with braces, and does not take a prefix of a name for a group', () => {
    const { group, tokens: listed } = listTokens(data, { group: '{color.brand}' });
    expect(group).toBe('color.brand');
    expect(listed.map((t) => t.path)).toEqual(['color.brand.blue']);
    expect(listTokens(data, { group: 'text' }).tokens.every((t) => t.path.startsWith('text.'))).toBe(true);
    expect(() => listTokens(data, { group: 'col' })).toThrow('no group');
  });

  it('keeps to one type', () => {
    const { type, tokens: listed } = listTokens(data, { type: 'fontFamily' });
    expect(type).toBe('fontFamily');
    expect(listed.map((t) => t.path)).toEqual(['font.display', 'font.ui', 'font.serif']);
    expect(listTokens(data, { group: 'text', type: 'dimension' }).tokens).toEqual([]);
  });

  it('refuses a group that is not there, naming the closest, and a type blazon does not know', () => {
    expect(() => listTokens(data, { group: 'colr' })).toThrow(LookupError);
    expect(() => listTokens(data, { group: 'colr' })).toThrow('did you mean "color"');
    expect(() => listTokens(data, { group: 'color.ink' })).toThrow('no group');
    expect(() => listTokens(data, { type: 'colour' })).toThrow('the types are color,');
  });

  it('tells a group from a token', () => {
    expect(isGroupPath(data, 'color')).toBe(true);
    expect(isGroupPath(data, '{color.brand}')).toBe(true);
    expect(isGroupPath(data, 'color.ink')).toBe(false);
    expect(isGroupPath(data, 'nope')).toBe(false);
  });
});

describe('rules', () => {
  it("carries a token's own usage rule and says where it is written", () => {
    expect(tokenRules(data, data.tokens.byPath.get('color.flame')!).usage).toEqual({ deny: ['text'], from: 'color.flame' });
  });

  it("passes a group's logo rule to the tokens under it, with the group as the place", () => {
    expect(tokenRules(data, data.tokens.byPath.get('color.brand.blue')!).logo).toEqual({ deny: ['onDark'], reason: 'the mark vanishes', from: 'color.brand' });
  });

  it('lists the pairs that name a token, as text or as background', () => {
    const body = tokenRules(data, data.tokens.byPath.get('text.body')!);
    expect(body.pairs).toEqual([{ fg: '{text.body}', bg: '{surface.page}', min: 'AAA', from: 'text', as: 'fg' }]);
    expect(tokenRules(data, data.tokens.byPath.get('surface.page')!).pairs.map((p) => p.as)).toEqual(['bg', 'bg']);
  });

  it('lists the rules at and under a group, with the groups above that pass theirs down', () => {
    expect(ruleEntries(data, 'text').map((e) => e.at)).toEqual(['text']);
    expect(ruleEntries(data, 'color.brand.blue').map((e) => [e.at, e.inherited])).toEqual([['color.brand', true]]);
  });

  it('lists every node that writes a rule when no path is given, and refuses an unknown path', () => {
    expect(ruleEntries(data, '').map((e) => e.at)).toEqual(expect.arrayContaining(['color.brand', 'text', 'color.flame', 'surface.hot']));
    expect(() => ruleEntries(data, 'colour')).toThrow(/did you mean "color"/);
  });
});

describe('canUse', () => {
  it('allows a combination a pair lists, when the contrast meets the level', () => {
    const answer = canUse(data, 'text.body', 'surface.page');
    expect(answer).toMatchObject({ allowed: true, contrast: { level: 'AAA' } });
    expect(answer.reason).toContain('pairs on text');
  });

  it('denies a pair whose contrast is under the level it names, with the numbers', () => {
    const answer = canUse(data, 'text.faint', 'surface.page');
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toMatch(/AAA needs 7:1, this is 4\.\d\d:1/);
  });

  it("denies text a usage rule forbids, also through an alias, and names the rule's place", () => {
    const answer = canUse(data, 'text.flame', 'surface.page');
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toBe('{color.flame} denies "text" (usage on color.flame)');
  });

  it('denies a background whose allow list leaves background out', () => {
    expect(canUse(data, 'text.body', 'surface.hot')).toMatchObject({ allowed: false, reason: expect.stringContaining('allows only "accent", not "background"') });
  });

  it('denies a combination no pair lists when the brand lists pairs', () => {
    const answer = canUse(data, 'color.ink', 'color.paper');
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toMatch(/no pair lists/);
  });

  it('counts a pair written on the tokens an alias points at, and refuses a token that is not a color', () => {
    expect(canUse(data, 'text.dim', 'surface.page')).toMatchObject({ allowed: true, reason: expect.stringContaining('AA-large') });
    expect(() => canUse(data, 'space.4', 'surface.page')).toThrow(/not a color/);
    expect(() => canUse(data, 'text.nope', 'surface.page')).toThrow(LookupError);
  });

  it('allows a combination no rule forbids when the brand lists no pairs at all', async () => {
    const bare = tempProject({
      'tokens/a.json': { c: { $type: 'color', a: { $value: '#000000' }, b: { $value: '#ffffff' }, d: { $value: '#fefefe', ...blazon({ usage: { deny: ['text'] } }) } } },
      'logo.svg': LOGO,
    });
    const brand = await compileBlazonData({ ...DEFAULT_CONFIG }, bare);
    expect(canUse(brand, 'c.a', 'c.b')).toMatchObject({ allowed: true, reason: expect.stringContaining('contrast') });
    expect(canUse(brand, 'c.d', 'c.b').allowed).toBe(false);
  });

  it('judges the same pair as text by the text rules and as ui by the 3:1 rule, without pairs', async () => {
    const brand = await compileBlazonData(
      { ...DEFAULT_CONFIG },
      tempProject({
        'tokens/a.json': {
          c: {
            $type: 'color',
            mid: { $value: '#949494' },
            page: { $value: '#ffffff' },
            pale: { $value: '#dddddd' },
            edge: { $value: '#949494', ...blazon({ usage: { deny: ['border', 'icon', 'interactive'] } }) },
            ring: { $value: '#949494', ...blazon({ usage: { allow: ['border'] } }) },
          },
        },
        'logo.svg': LOGO,
      }),
    );
    const asText = canUse(brand, 'c.mid', 'c.page');
    const asUi = canUse(brand, 'c.mid', 'c.page', 'ui');
    expect(asText).toMatchObject({ role: 'text', allowed: true });
    expect(asText.contrast.threshold).toBeUndefined();
    expect(asUi).toMatchObject({ role: 'ui', allowed: true, contrast: { ratio: 3.03, threshold: 3 } });
    expect(asUi.checks.find((c) => c.rule === 'pairs')?.message).toContain('do not apply');
    expect(canUse(brand, 'c.pale', 'c.page', 'ui')).toMatchObject({ allowed: false, reason: 'non-text contrast needs 3:1, this is 1.36:1' });
    expect(canUse(brand, 'c.edge', 'c.page', 'ui')).toMatchObject({ allowed: false, reason: expect.stringContaining('no non-text use is open') });
    expect(canUse(brand, 'c.ring', 'c.page', 'ui').allowed).toBe(true);
    expect(() => canUse(brand, 'c.mid', 'c.page', 'icon' as 'ui')).toThrow(/not a role blazon can judge/);
  });

  it('ignores the pairs a brand lists when the role is ui', () => {
    // text.faint on surface.page is denied as text (AAA needed); as ui the pair list is not read
    expect(canUse(data, 'text.faint', 'surface.page').allowed).toBe(false);
    expect(canUse(data, 'text.faint', 'surface.page', 'ui')).toMatchObject({ allowed: true, contrast: { threshold: 3 } });
  });
});

describe('describeFonts', () => {
  it('lists the stylesheets and the font files of the config, and the families the tokens name', () => {
    const fonts = describeFonts(data, config, root);
    expect(fonts.stylesheets).toEqual(['https://fonts.example/a.css']);
    expect(fonts.files).toEqual([{ family: 'Mulish', file: 'fonts/Mulish.woff2', weight: 700 }]);
    const byName = Object.fromEntries(fonts.families.map((f) => [f.family, f]));
    expect(byName.Mulish).toMatchObject({ loaded: true, tokens: expect.arrayContaining(['font.display', 'type.h1']) });
    expect(byName['system-ui']).toMatchObject({ system: true });
    expect(byName.Fraunces).toMatchObject({ webFont: 'licensed', system: false });
  });
});

describe('describeLogo', () => {
  it('gives the configured variant, the asset it is, its sidecar rules and the backgrounds that forbid a variant', () => {
    const logo = describeLogo(data, config, root);
    expect(logo.variants).toEqual([{ variant: 'onLight', file: 'assets/logos/mark.svg', found: true, asset: 'logos/mark', ink: '#0033cc' }]);
    expect(logo.assets).toEqual([
      {
        id: 'logos/mark',
        file: 'assets/logos/mark.svg',
        variants: ['onLight'],
        rules: expect.objectContaining({ lockup: 'mark', clearSpace: { value: 8, unit: 'px' }, ink: '#0033cc' }),
      },
    ]);
    expect(logo.forbidden).toEqual([{ at: 'color.brand', deny: ['onDark'], reason: 'the mark vanishes' }]);
  });
});
