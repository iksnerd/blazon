import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand as readBrandRaw } from '../../../src/shipped/platform-tokens/brand.js';
import { readColor } from '../../../src/shipped/platform-tokens/colors.js';
import { readDimension, dp } from '../../../src/shipped/platform-tokens/dimensions.js';
import { nameTokens } from '../../../src/shipped/platform-tokens/names.js';
import { parseOptions } from '../../../src/shipped/platform-tokens/options.js';
import { planTokens } from '../../../src/shipped/platform-tokens/plan.js';
import { androidFiles } from '../../../src/shipped/platform-tokens/android.js';
import { iosFiles } from '../../../src/shipped/platform-tokens/ios.js';
import { composeFiles } from '../../../src/shipped/platform-tokens/compose.js';
import { NAME } from '../../../src/shipped/platform-tokens/request.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// A brand.json always carries its format and version (RFC 0001); a fixture that is only a piece of one gets them here
const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 1, ...brand });

// blazon.platform-tokens, the plugin blazon ships to write a brand's colors and dimensions as native files for Android, iOS and Jetpack
// Compose. Seams: the pure parts (names, colors, dimensions, the options, which context is dark, what the plan holds, the text of each
// writer), and the entry, run as blazon runs it, whose files are read. The files are compiled with the platform tools by hand, not here.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/platform-tokens/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;


const color = (p: string, value: string, extra: object = {}) => ({ path: p, type: 'color', value, resolvedValue: value, ...extra });
const dim = (p: string, value: number, unit = 'px') => ({ path: p, type: 'dimension', value: `${value}${unit}`, resolvedValue: { value, unit } });

const brandOf = (over: object = {}) => ({
  format: 'blazon-brand',
  version: 1,
  brand: { title: 'Acme' },
  tokens: [
    color('color.brand.primary', '#FF5A1F'),
    color('color.surface.background', '#F2F0EB', { aliasOf: 'color.base.bone' }),
    color('text.primary', '#1E1F21'),
    color('color.overlay', 'rgb(0 0 0 / 0.5)'),
    dim('space.4', 4),
    dim('size.line', 1.5, 'rem'),
    { path: 'type.body', type: 'typography', value: '16px Inter', resolvedValue: {} },
    { path: 'type.title', type: 'typography', value: '32px Inter', resolvedValue: {} },
    { path: 'shadow.card', type: 'shadow', value: '0 1px #000', resolvedValue: {} },
  ],
  modifiers: [{ name: 'theme', default: 'light', contexts: ['light', 'dark'] }],
  contexts: [
    {
      modifier: 'theme',
      context: 'dark',
      selector: '[data-theme="dark"]',
      tokens: [color('color.surface.background', '#1E1F21'), color('color.brand.primary', '#FF5A1F'), color('text.primary', '#F2F0EB')],
    },
  ],
  ...over,
});

const plan = (brand: object = brandOf(), options: object = {}) => {
  const read = readBrand(brand);
  const { options: parsed } = parseOptions(options, read.contextNames);
  return planTokens(read, parsed);
};

describe('names', () => {
  const names = (paths: string[], style: 'android' | 'swift' | 'kotlin', kind: 'color' | 'dimension' = 'color', prefix = '') => nameTokens(paths, style, kind, prefix).map((n) => n.name);

  it('makes snake case for Android, with the prefix first', () => {
    expect(names(['color.brand.primary', 'color.onSignal', 'color.hue.yellow.500'], 'android')).toEqual(['color_brand_primary', 'color_hue_yellow_500', 'color_on_signal']);
    expect(names(['color.brand'], 'android', 'color', 'Acme9')).toEqual(['acme9_color_brand']);
    expect(names(['4xl'], 'android', 'dimension')).toEqual(['n_4xl']);
    expect(names(['color.brand-primary', 'color.brand primary'], 'android').every((n) => /^[a-z][a-z0-9_]*$/.test(n))).toBe(true);
  });

  it('makes lowerCamel for Swift and Kotlin, and drops the color segment the namespace already says', () => {
    for (const style of ['swift', 'kotlin'] as const) {
      expect(names(['color.brand.primary', 'text.onSignal', 'color.hue.yellow.500'], style)).toEqual(['brandPrimary', 'hueYellow500', 'textOnSignal']);
      expect(names(['color'], style)).toEqual(['color']);
    }
    expect(names(['space.4', 'radius.hairline'], 'swift', 'dimension')).toEqual(['radiusHairline', 'space4']);
  });

  it('gives a name that starts with a digit an underscore, in Swift and Kotlin', () => {
    expect(names(['4xl'], 'swift', 'dimension')).toEqual(['_4xl']);
    expect(names(['2.xl'], 'kotlin', 'dimension')).toEqual(['_2Xl']);
  });

  it('sorts by path, and gives a name that collides after conversion a number, with the reason', () => {
    const named = nameTokens(['color.brandPrimary', 'color.brand.primary', 'color.brand_primary'], 'swift', 'color', '');
    expect(named.map((n) => [n.path, n.name])).toEqual([
      ['color.brand.primary', 'brandPrimary'],
      ['color.brandPrimary', 'brandPrimary2'],
      ['color.brand_primary', 'brandPrimary3'],
    ]);
    expect(named[0]!.note).toBeUndefined();
    expect(named[1]!.note).toEqual({ why: 'collision', with: 'color.brand.primary' });
    expect(nameTokens(['color.a.b', 'color.aB'], 'android', 'color', '').map((n) => n.name)).toEqual(['color_a_b', 'color_a_b_2']);
  });

  it('gives a reserved word a suffix, in each language, and never drops a token', () => {
    expect(nameTokens(['default', 'in'], 'swift', 'dimension', '').map((n) => [n.name, n.note?.why])).toEqual([
      ['defaultToken', 'reserved'],
      ['inToken', 'reserved'],
    ]);
    expect(nameTokens(['fun'], 'kotlin', 'dimension', '')[0]!.name).toBe('funToken');
    expect(nameTokens(['class'], 'android', 'dimension', '')[0]!.name).toBe('class_token');
    expect(nameTokens(['fun'], 'swift', 'dimension', '')[0]!.name).toBe('fun');
    // a suffixed word that takes another token's name is numbered
    expect(nameTokens(['default', 'defaultToken'], 'swift', 'dimension', '').map((n) => n.name)).toEqual(['defaultToken', 'defaultToken2']);
  });
});

describe('colors', () => {
  it('reads hex, rgb, hsl, oklch and names as sRGB bytes with alpha', () => {
    expect(readColor('#FF5A1F')).toEqual({ color: { red: 255, green: 90, blue: 31, alpha: 255 }, clamped: false });
    expect(readColor('#abc')!.color).toEqual({ red: 170, green: 187, blue: 204, alpha: 255 });
    expect(readColor('#11223380')!.color).toEqual({ red: 17, green: 34, blue: 51, alpha: 128 });
    expect(readColor('rgb(255 90 31 / 0.5)')!.color).toEqual({ red: 255, green: 90, blue: 31, alpha: 128 });
    expect(readColor('hsl(210 50% 40%)')!.color).toEqual({ red: 51, green: 102, blue: 153, alpha: 255 });
    expect(readColor('oklch(0.3 0.01 250 / 0.9)')!.color).toEqual({ red: 42, green: 46, blue: 51, alpha: 230 });
    expect(readColor('rebeccapurple')!.color).toEqual({ red: 102, green: 51, blue: 153, alpha: 255 });
    expect(readColor('transparent')!.color.alpha).toBe(0);
  });

  it('clamps a color outside sRGB and says so', () => {
    const wide = readColor('oklch(0.7 0.3 150)')!;
    expect(wide.clamped).toBe(true);
    expect(wide.color).toEqual({ red: 0, green: 203, blue: 0, alpha: 255 });
    expect(readColor('color(display-p3 1 0 0)')).toMatchObject({ clamped: true, color: { red: 255, green: 0, blue: 0 } });
    expect(readColor('rgb(255 0 0)')!.clamped).toBe(false);
  });

  it('cannot read what is not a color', () => {
    for (const odd of ['var(--x)', 'linear-gradient(red, blue)', 'currentcolor', '', 'nope', 3, undefined, null, {}]) expect(readColor(odd), String(odd)).toBeUndefined();
  });
});

describe('dimensions', () => {
  it('maps px to dp 1:1 and rem to 16 dp', () => {
    expect(readDimension({ value: 24, unit: 'px' }, '24px')).toBe(24);
    expect(readDimension({ value: 1.5, unit: 'rem' }, '1.5rem')).toBe(24);
    expect(readDimension({ value: 0.0625, unit: 'rem' }, undefined)).toBe(1);
    expect(readDimension(undefined, '12px')).toBe(12);
    expect(readDimension(undefined, '0.5rem')).toBe(8);
    expect(readDimension(0, 0)).toBe(0);
  });

  it('cannot read another unit or a calculation', () => {
    for (const odd of [{ value: 2, unit: 'em' }, { value: 2, unit: '%' }, 'calc(1px + 2px)', { value: 'a', unit: 'px' }, null]) expect(readDimension(odd, undefined)).toBeUndefined();
  });

  it('writes a number without float noise', () => {
    expect(dp(1.5)).toBe('1.5');
    expect(dp(0.1 * 3)).toBe('0.3');
    expect(dp(16)).toBe('16');
    expect(dp(-4)).toBe('-4');
  });
});

describe('options', () => {
  const known = new Set(['dark', 'night']);

  it('has defaults: all three platforms, no dark name, no prefix', () => {
    expect(parseOptions({}, known)).toEqual({ options: { platforms: ['android', 'ios', 'compose'], prefix: '' }, findings: [] });
  });

  it('names the platform that is wrong', () => {
    const { options, findings } = parseOptions({ platforms: ['android', 'bogus', 7] }, known);
    expect(options.platforms).toEqual(['android', 'ios', 'compose']);
    expect(findings.map((f) => f.message)).toEqual(['platforms must be a non-empty list of android, ios, compose, not "bogus", 7']);
  });

  it('takes good ones, in the platforms\' own order', () => {
    expect(parseOptions({ platforms: ['compose', 'android', 'compose'], dark: 'night', prefix: 'Acme9' }, known)).toEqual({
      options: { platforms: ['android', 'compose'], dark: 'night', prefix: 'Acme9' },
      findings: [],
    });
  });

  it('reports each wrong option as option-invalid and keeps the default for it', () => {
    const { options, findings } = parseOptions({ bogus: 1, platforms: ['web'], dark: 'dim', prefix: 'a_b' }, known);
    expect(findings.map((f) => f.code)).toEqual(Array(4).fill(`${NAME}/option-invalid`));
    expect(findings.every((f) => f.severity === 'error' && f.path === 'options')).toBe(true);
    expect(options).toEqual({ platforms: ['android', 'ios', 'compose'], prefix: '' });
    for (const bad of [{ platforms: [] }, { platforms: 'ios' }, { dark: 3 }, { prefix: 3 }, { prefix: '9a' }]) expect(parseOptions(bad, known).findings, JSON.stringify(bad)).toHaveLength(1);
    expect(parseOptions([], known).findings).toHaveLength(1);
  });
});

describe('the brand', () => {
  it('reads tokens and the contexts, and trusts none of it', () => {
    const read = readBrand(brandOf());
    expect(read.tokens).toHaveLength(9);
    expect([...read.contextNames]).toEqual(['dark']);
    expect(() => readBrandRaw(null)).toThrow(/not a blazon brand/);
    expect(readBrand({ tokens: [3, { path: 4 }, { path: 'a' }], contexts: [{ context: 'dark' }, 7] }).tokens.map((t) => t.path)).toEqual(['a']);
  });
});

describe('the plan', () => {
  it('writes aliases by their resolved value under their own names, in path order', () => {
    const { colors, dimensions } = plan();
    expect(colors.map((c) => [c.path, c.android, c.swift, c.kotlin])).toEqual([
      ['color.brand.primary', 'color_brand_primary', 'brandPrimary', 'brandPrimary'],
      ['color.overlay', 'color_overlay', 'overlay', 'overlay'],
      ['color.surface.background', 'color_surface_background', 'surfaceBackground', 'surfaceBackground'],
      ['text.primary', 'text_primary', 'textPrimary', 'textPrimary'],
    ]);
    expect(colors[2]!.light).toEqual({ red: 242, green: 240, blue: 235, alpha: 255 });
    expect(dimensions.map((d) => [d.android, d.swift, d.dp])).toEqual([
      ['size_line', 'sizeLine', 24],
      ['space_4', 'space4', 4],
    ]);
  });

  it('skips every other type with one finding that names the types and counts', () => {
    const { findings } = plan();
    const skipped = findings.filter((f) => f.code === `${NAME}/tokens-skipped`);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.severity).toBe('info');
    expect(skipped[0]!.message).toContain('typography (2)');
    expect(skipped[0]!.message).toContain('shadow (1)');
  });

  it('takes the one context named dark, and keeps the tokens that differ in it', () => {
    const p = plan();
    expect(p.dark).toBe('dark');
    expect(p.colors.filter((c) => c.dark).map((c) => [c.path, c.dark])).toEqual([
      ['color.surface.background', { red: 30, green: 31, blue: 33, alpha: 255 }],
      ['text.primary', { red: 242, green: 240, blue: 235, alpha: 255 }],
    ]);
    expect(p.findings.filter((f) => f.code.includes('dark'))).toEqual([]);
  });

  it('writes light only, and no finding, for a brand with no dark context', () => {
    const p = plan(brandOf({ modifiers: [], contexts: [] }));
    expect(p.dark).toBeUndefined();
    expect(p.colors.some((c) => c.dark)).toBe(false);
    expect(p.findings.map((f) => f.code)).toEqual([`${NAME}/tokens-skipped`]);
  });

  it('ignores a context that is not dark, unless the option names it', () => {
    const other = brandOf({ contexts: [{ modifier: 'theme', context: 'night', selector: '', tokens: [color('text.primary', '#FFFFFF')] }] });
    expect(plan(other).dark).toBeUndefined();
    const p = plan(other, { dark: 'night' });
    expect(p.dark).toBe('night');
    expect(p.colors.find((c) => c.path === 'text.primary')!.dark).toEqual({ red: 255, green: 255, blue: 255, alpha: 255 });
  });

  it('says so when two modifiers each have a dark context, and writes light only', () => {
    const two = brandOf({
      contexts: [
        { modifier: 'theme', context: 'dark', selector: '', tokens: [color('text.primary', '#FFFFFF')] },
        { modifier: 'contrast', context: 'dark', selector: '', tokens: [color('text.primary', '#000000')] },
      ],
    });
    const p = plan(two);
    expect(p.dark).toBeUndefined();
    expect(p.findings.map((f) => f.code)).toContain(`${NAME}/dark-ambiguous`);
  });

  it('says when the dark context changes no color, when it has a color the light set lacks, and when it changes a dimension', () => {
    const same = plan(brandOf({ contexts: [{ modifier: 'theme', context: 'dark', selector: '', tokens: [color('text.primary', '#1E1F21')] }] }));
    expect(same.findings.map((f) => f.code)).toContain(`${NAME}/dark-empty`);
    const extra = plan(brandOf({ contexts: [{ modifier: 'theme', context: 'dark', selector: '', tokens: [color('color.new', '#000000'), dim('space.4', 8), color('text.primary', '#FFFFFF')] }] }));
    expect(extra.findings.filter((f) => f.code.includes('dark')).map((f) => f.code)).toEqual([`${NAME}/dark-unmatched`, `${NAME}/dark-dimensions-ignored`]);
    expect(extra.dimensions.find((d) => d.path === 'space.4')!.dp).toBe(4);
  });

  it('reports a color that cannot be read, once, and one outside sRGB, and still writes the rest', () => {
    const odd = brandOf({ contexts: [], tokens: [color('color.a', 'var(--a)'), color('color.b', 'oklch(0.7 0.3 150)'), color('color.c', '#000'), dim('space.x', 2, 'em')] });
    const p = plan(odd);
    expect(p.colors.map((c) => c.path)).toEqual(['color.b', 'color.c']);
    expect(p.findings.map((f) => [f.code, f.path])).toEqual([
      [`${NAME}/color-unreadable`, 'color.a'],
      [`${NAME}/color-out-of-gamut`, 'color.b'],
      [`${NAME}/dimension-unreadable`, 'space.x'],
    ]);
    expect(p.findings.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('says when a name collided or was a reserved word', () => {
    const p = plan(brandOf({ tokens: [color('color.brand.primary', '#000'), color('color.brandPrimary', '#111'), dim('default', 1)] }));
    const collisions = p.findings.filter((f) => f.code === `${NAME}/name-collision`);
    expect(collisions.map((f) => f.path)).toEqual(['color.brandPrimary', 'color.brandPrimary', 'color.brandPrimary']);
    expect(collisions.map((f) => /Android|Swift|Kotlin/.exec(f.message)![0])).toEqual(['Android', 'Swift', 'Kotlin']);
    expect(p.colors.map((c) => c.swift)).toEqual(['brandPrimary', 'brandPrimary2']);
    expect(p.findings.filter((f) => f.code === `${NAME}/name-reserved`).map((f) => f.path)).toEqual(['default', 'default']);
  });

  it('says there is nothing to write for a brand with no color or dimension', () => {
    expect(plan(brandOf({ tokens: [], contexts: [] })).findings.map((f) => f.code)).toEqual([`${NAME}/no-tokens`]);
  });
});

describe('the Android files', () => {
  const files = androidFiles(plan());

  it('writes colors.xml with #RRGGBB, or #AARRGGBB when there is alpha', () => {
    expect([...files.keys()]).toEqual(['android/values/colors.xml', 'android/values-night/colors.xml', 'android/values/dimens.xml']);
    expect(files.get('android/values/colors.xml')).toBe(`<?xml version="1.0" encoding="utf-8"?>
<!-- Written by blazon.platform-tokens from brand.json. Do not edit: build again instead. -->
<resources>
    <color name="color_brand_primary">#FF5A1F</color>
    <color name="color_overlay">#80000000</color>
    <color name="color_surface_background">#F2F0EB</color>
    <color name="text_primary">#1E1F21</color>
</resources>
`);
  });

  it('writes values-night/colors.xml with only the colors the dark context changes', () => {
    const night = files.get('android/values-night/colors.xml')!;
    expect(night).toContain('<color name="color_surface_background">#1E1F21</color>');
    expect(night).toContain('<color name="text_primary">#F2F0EB</color>');
    expect(night).not.toContain('color_brand_primary');
  });

  it('writes dimens.xml in dp, and says how px and rem map', () => {
    const dimens = files.get('android/values/dimens.xml')!;
    expect(dimens).toContain('px tokens are dp 1:1; rem tokens are 16 dp to the rem');
    expect(dimens).toContain('<dimen name="size_line">24dp</dimen>');
    expect(dimens).toContain('<dimen name="space_4">4dp</dimen>');
  });

  it('writes no night file and no dimens.xml when there is nothing for them', () => {
    const light = androidFiles(plan(brandOf({ contexts: [], tokens: [color('color.a', '#000')] })));
    expect([...light.keys()]).toEqual(['android/values/colors.xml']);
  });

  it('puts the prefix on every name', () => {
    expect(androidFiles(plan(brandOf(), { prefix: 'acme' })).get('android/values/colors.xml')).toContain('<color name="acme_color_brand_primary">');
  });
});

describe('the iOS files', () => {
  const files = iosFiles(plan());
  const swift = files.get('ios/BlazonTokens.swift')!;

  it('writes the catalog with a colorset for each color, light and dark', () => {
    expect([...files.keys()]).toEqual([
      'ios/Colors.xcassets/Contents.json',
      'ios/Colors.xcassets/brandPrimary.colorset/Contents.json',
      'ios/Colors.xcassets/overlay.colorset/Contents.json',
      'ios/Colors.xcassets/surfaceBackground.colorset/Contents.json',
      'ios/Colors.xcassets/textPrimary.colorset/Contents.json',
      'ios/BlazonTokens.swift',
    ]);
    expect(JSON.parse(files.get('ios/Colors.xcassets/Contents.json')!)).toEqual({ info: { author: 'blazon', version: 1 } });
    const light = JSON.parse(files.get('ios/Colors.xcassets/brandPrimary.colorset/Contents.json')!);
    expect(light.colors).toEqual([{ idiom: 'universal', color: { 'color-space': 'srgb', components: { red: '0xFF', green: '0x5A', blue: '0x1F', alpha: '1.000' } } }]);
    const dark = JSON.parse(files.get('ios/Colors.xcassets/surfaceBackground.colorset/Contents.json')!);
    expect(dark.colors).toHaveLength(2);
    expect(dark.colors[1]).toEqual({
      idiom: 'universal',
      appearances: [{ appearance: 'luminosity', value: 'dark' }],
      color: { 'color-space': 'srgb', components: { red: '0x1E', green: '0x1F', blue: '0x21', alpha: '1.000' } },
    });
    expect(JSON.parse(files.get('ios/Colors.xcassets/overlay.colorset/Contents.json')!).colors[0].color.components.alpha).toBe('0.502');
  });

  it('writes enums of SwiftUI Colors and CGFloat dimensions', () => {
    expect(swift).toContain('public enum BlazonColors {');
    expect(swift).toContain('public static let brandPrimary = Color(.sRGB, red: 0xFF / 255, green: 0x5A / 255, blue: 0x1F / 255, opacity: 1)');
    expect(swift).toContain('public static let overlay = Color(.sRGB, red: 0x00 / 255, green: 0x00 / 255, blue: 0x00 / 255, opacity: 0x80 / 255)');
    expect(swift).toContain('public enum BlazonDimensions {');
    expect(swift).toContain('public static let space4: CGFloat = 4');
    expect(swift).toContain('public static let sizeLine: CGFloat = 24');
  });

  it('writes a color that differs in dark through the dynamic helper it defines', () => {
    expect(swift).toContain('public static let surfaceBackground = Color(blazonLight: BlazonRGBA(red: 0xF2 / 255, green: 0xF0 / 255, blue: 0xEB / 255, alpha: 1), dark: BlazonRGBA(red: 0x1E / 255, green: 0x1F / 255, blue: 0x21 / 255, alpha: 1))');
    expect(swift).toContain('fileprivate init(blazonLight light: BlazonRGBA, dark: BlazonRGBA)');
    expect(swift).toContain('#if canImport(UIKit)');
  });

  it('leaves the helper out when no color has a dark value', () => {
    const light = iosFiles(plan(brandOf({ contexts: [] }))).get('ios/BlazonTokens.swift')!;
    expect(light).not.toContain('BlazonRGBA');
    expect(light).not.toContain('UIKit');
  });

  it('names the enums after the prefix', () => {
    const named = iosFiles(plan(brandOf(), { prefix: 'Acme' })).get('ios/BlazonTokens.swift')!;
    expect(named).toContain('public enum AcmeColors {');
    expect(named).toContain('public enum AcmeDimensions {');
  });
});

describe('the Compose files', () => {
  const files = composeFiles(plan());

  it('writes BlazonColors with 0xAARRGGBB and BlazonDarkColors with every color, dark where the dark context sets one', () => {
    expect([...files.keys()]).toEqual(['compose/Colors.kt', 'compose/Dimens.kt']);
    expect(files.get('compose/Colors.kt')).toBe(`// Written by blazon.platform-tokens from brand.json. Do not edit: build again instead.
package blazon.tokens

import androidx.compose.ui.graphics.Color

object BlazonColors {
    val brandPrimary = Color(0xFFFF5A1F)
    val overlay = Color(0x80000000)
    val surfaceBackground = Color(0xFFF2F0EB)
    val textPrimary = Color(0xFF1E1F21)
}

/** Every color for the dark appearance: the dark context's value where it sets one, else the value in BlazonColors. Swap the whole object. */
object BlazonDarkColors {
    val brandPrimary = Color(0xFFFF5A1F)
    val overlay = Color(0x80000000)
    val surfaceBackground = Color(0xFF1E1F21)
    val textPrimary = Color(0xFFF2F0EB)
}
`);
  });

  it('writes Dimens.kt in Dp', () => {
    expect(files.get('compose/Dimens.kt')).toBe(`// Written by blazon.platform-tokens from brand.json. Do not edit: build again instead.
package blazon.tokens

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// px tokens are dp 1:1; rem tokens are 16 dp to the rem.
object BlazonDimens {
    val sizeLine: Dp = 24.dp
    val space4: Dp = 4.dp
}
`);
  });

  it('has no BlazonDarkColors without a dark context', () => {
    expect(composeFiles(plan(brandOf({ contexts: [] }))).get('compose/Colors.kt')).not.toContain('BlazonDarkColors');
  });
});

describe('the entry', () => {
  const site = tempDir('blazon-platform-tokens-site-');
  fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html>');

  function run(options: object, brand: object = brandOf()) {
    const out = tempDir('blazon-platform-tokens-out-');
    const input = JSON.stringify({ v: 1, type: 'build', site_dir: site, out_dir: out, brand, options });
    const ran = spawnSync(process.execPath, ['--import', TSX, ENTRY], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
    const files: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (item.isDirectory()) walk(path.join(dir, item.name));
        else files[path.relative(out, path.join(dir, item.name))] = fs.readFileSync(path.join(dir, item.name), 'utf-8');
      }
    };
    walk(out);
    return { status: ran.status, answer: ran.status === 0 ? JSON.parse(ran.stdout) : ran.stdout, files };
  }

  it('writes the three platforms and a README.txt that says where each goes', () => {
    const { status, answer, files } = run({});
    expect(status).toBe(0);
    expect(answer.findings.map((f: { code: string }) => f.code)).toEqual([`${NAME}/tokens-skipped`]);
    expect(Object.keys(files)).toEqual([
      'README.txt',
      'android/values/colors.xml',
      'android/values/dimens.xml',
      'android/values-night/colors.xml',
      'compose/Colors.kt',
      'compose/Dimens.kt',
      'ios/BlazonTokens.swift',
      'ios/Colors.xcassets/Contents.json',
      'ios/Colors.xcassets/brandPrimary.colorset/Contents.json',
      'ios/Colors.xcassets/overlay.colorset/Contents.json',
      'ios/Colors.xcassets/surfaceBackground.colorset/Contents.json',
      'ios/Colors.xcassets/textPrimary.colorset/Contents.json',
    ]);
    expect(files['README.txt']).toMatch(/^android\/ .*src\/main\/res/m);
    expect(files['README.txt']).toMatch(/^ios\/ /m);
    expect(files['README.txt']).toMatch(/^compose\/ /m);
  });

  it('writes the same bytes for the same brand', () => {
    expect(run({}).files).toEqual(run({}).files);
  });

  it('writes only the platforms asked for', () => {
    const { files } = run({ platforms: ['ios'] });
    expect(Object.keys(files).every((file) => file === 'README.txt' || file.startsWith('ios/'))).toBe(true);
    expect(files['README.txt']).not.toContain('android/');
  });

  it('answers a wrong option with a finding and exit 0, and writes the rest', () => {
    const { status, answer, files } = run({ platforms: ['web'] });
    expect(status).toBe(0);
    expect(answer.findings.map((f: { code: string }) => f.code)).toContain(`${NAME}/option-invalid`);
    expect(Object.keys(files)).toContain('android/values/colors.xml');
  });
});
