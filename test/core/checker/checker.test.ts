import { describe, it, expect } from 'vitest';
import { checkTokens } from '../../../src/core/checker/index.js';
import { compileTokens } from '../../support/helpers.js';

const codesOf = (findings: { code: string; path: string }[]) => findings.map((f) => `${f.path}:${f.code}`);

describe('checkTokens (RFC 0001 §4)', () => {
  it('passes a clean token set', async () => {
    const result = checkTokens(await compileTokens({ 'a.json': { color: { $type: 'color', ink: { $value: '#000000' } } } }));

    expect(result.passed).toBe(true);
    expect(result.all).toEqual([]);
  });

  it('fails on load problems such as unresolved aliases', async () => {
    const result = checkTokens(await compileTokens({ 'a.json': { color: { $type: 'color', ink: { $value: '{color.nope}' } } } }));

    expect(result.passed).toBe(false);
    expect(codesOf(result.errors)).toContain('color.ink:alias-unresolved');
  });

  it('fails when a token plays a role that the token it aliases denies', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: {
            $type: 'color',
            secondary: {
              $extensions: { 'dev.blazon': { usage: { deny: ['text'] } } },
              pink: { $value: '#FF44DD' },
            },
            hue: {
              $extensions: { 'dev.blazon': { usage: { allow: ['illustration'] } } },
              pink100: { $value: '#ffdaf8' },
            },
          },
          text: {
            $type: 'color',
            $extensions: { 'dev.blazon': { tier: 'semantic', role: 'text' } },
            accent: { $value: '{color.secondary.pink}' },
            soft: { $value: '{color.hue.pink100}' },
          },
          surface: {
            $type: 'color',
            $extensions: { 'dev.blazon': { tier: 'semantic', role: 'background' } },
            pink: { $value: '{color.secondary.pink}' },
          },
        },
      }),
    );

    expect(codesOf(result.errors)).toEqual(['text.accent:usage-violated', 'text.soft:usage-violated']);
  });

  it('fails a contrast pair below its level, expanding group wildcards', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: {
            $type: 'color',
            black: { $value: '#000000' },
            white: { $value: '#FFFFFF' },
            secondary: { yellow: { $value: '#EBCA40' }, blue: { $value: '#3885FF' } },
          },
          rules: {
            $extensions: {
              'dev.blazon': { pairs: [{ fg: '{color.white}', bg: '{color.secondary.*}', min: 'AA' }] },
            },
          },
        },
      }),
    );

    // white on #EBCA40 is about 1.6:1, white on #3885FF about 3.5:1; both under 4.5
    expect(codesOf(result.errors)).toEqual(['color.secondary.blue:contrast-insufficient', 'color.secondary.yellow:contrast-insufficient']);
  });

  it('measures a pair in any CSS color space, not only hex and rgb()', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: {
            $type: 'color',
            ink: { $value: 'oklch(0.2 0 0)' },
            grey: { $value: 'lab(70 0 0)' },
            paper: { $value: 'hsl(0 0% 100%)' },
          },
          rules: {
            $extensions: {
              'dev.blazon': {
                pairs: [
                  { fg: '{color.ink}', bg: '{color.paper}', min: 'AA' },
                  { fg: '{color.grey}', bg: '{color.paper}', min: 'AA' },
                ],
              },
            },
          },
        },
      }),
    );

    // OKLab L 0.2 is luminance 0.2^3 = 0.008, about 18:1 on white; CIELAB L* 70 is luminance ((70+16)/116)^3 = 0.4075,
    // so (1 + 0.05) / (0.4075 + 0.05) = 2.2977:1, printed floored as 2.29, under AA
    expect(result.all.filter((f) => f.code.startsWith('contrast'))).toEqual([
      { code: 'contrast-insufficient', severity: 'error', path: 'color.paper', message: '{color.grey} on {color.paper} is 2.29:1; AA needs 4.5:1' },
    ]);
  });

  // WCAG measures what is seen: a translucent foreground is blended over its background first, so alpha cannot be ignored
  const pairOf = (fg: string, bg: string, min = 'AA') => ({
    'a.json': {
      color: { $type: 'color', fg: { $value: fg }, bg: { $value: bg } },
      rules: { $extensions: { 'dev.blazon': { pairs: [{ fg: '{color.fg}', bg: '{color.bg}', min }] } } },
    },
  });
  const contrastOf = async (fg: string, bg: string, min?: string) => checkTokens(await compileTokens(pairOf(fg, bg, min))).all.filter((f) => f.code.startsWith('contrast'));

  it('blends a translucent foreground over its background before measuring', async () => {
    // #3885FF at 50% over white is about #9CC2FF (alpha 0x80 is 50.2%), 1.82:1; opaque #3885FF would be 3.52:1
    expect((await contrastOf('#3885FF80', '#ffffff')).map((f) => f.message)).toEqual(['{color.fg} on {color.bg} is 1.82:1; AA needs 4.5:1']);
  });

  it('fails a fully transparent foreground, which is the background itself', async () => {
    expect((await contrastOf('transparent', '#ffffff', 'AAA')).map((f) => f.message)).toEqual(['{color.fg} on {color.bg} is 1.00:1; AAA needs 7:1']);
    expect((await contrastOf('rgba(0,0,0,.05)', '#ffffff')).map((f) => f.code)).toEqual(['contrast-insufficient']);
  });

  it('measures an opaque pair as before', async () => {
    expect(await contrastOf('#000000', '#ffffff', 'AAA')).toEqual([]);
  });

  it('does not guess a ratio on a translucent background, whose backdrop is not known', async () => {
    expect((await contrastOf('#000000', '#ffffff80')).map((f) => f.code)).toEqual(['contrast-unknown']);
  });

  it('never rounds a failing ratio up to the minimum it misses', async () => {
    // 4.496 and 4.4999 both fail AA: the message floors them to 4.49 so it never reads "4.50:1; AA needs 4.5:1"
    for (const found of [4.496, 4.4999]) {
      const { ratioMessage } = await import('../../../src/core/checker/contrast.js');
      expect(ratioMessage(found)).toBe('4.49');
    }
    expect((await import('../../../src/core/checker/contrast.js')).ratioMessage(4.5)).toBe('4.50');
  });

  it('still warns on a pair it cannot read as a color', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', var: { $value: 'var(--brand)' }, paper: { $value: '#ffffff' } },
          rules: { $extensions: { 'dev.blazon': { pairs: [{ fg: '{color.var}', bg: '{color.paper}', min: 'AA' }] } } },
        },
      }),
    );
    expect(result.all.filter((f) => f.code.startsWith('contrast'))).toEqual([
      { code: 'contrast-unknown', severity: 'warning', path: 'color.paper', message: 'Cannot measure var(--brand) on #ffffff: not a color blazon can read' },
    ]);
  });

  it('warns on duplicate literal values among siblings, review flags, and literal semantic tokens', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          hue: {
            $type: 'color',
            yellow: {
              '400': { $value: '#f3df8c' },
              '300': { $value: '#F3DF8C' },
              '200': { $value: '#f7eab3' },
            },
          },
          product: {
            $type: 'color',
            pink: {
              light: {
                $value: '#FF685B',
                $extensions: { 'dev.blazon': { review: { status: 'needs-review', note: 'same as red.light' } } },
              },
            },
          },
          text: {
            $type: 'color',
            $extensions: { 'dev.blazon': { tier: 'semantic' } },
            primary: { $value: '#000000' },
          },
        },
      }),
    );

    expect(result.errors).toEqual([]);
    // Integer-like JSON keys iterate in numeric order, so 300 is seen first and 400 is the duplicate.
    expect(codesOf(result.warnings)).toEqual(['hue.yellow.400:token-value-duplicate', 'product.pink.light:review-pending', 'text.primary:alias-missing']);
    expect(result.passed).toBe(true);
    expect(checkTokens(await compileTokens({ 'a.json': { hue: { $type: 'color', a: { $value: '#fff' }, b: { $value: '#fff' } } } }), { strict: true }).passed).toBe(false);
  });

  it('treats root-level tokens as siblings, whatever their names', async () => {
    const dups = async (tokens: object) =>
      checkTokens(await compileTokens({ 'a.json': tokens }))
        .warnings.filter((f) => f.code === 'token-value-duplicate')
        .map((f) => f.path);
    expect(await dups({ ab: { $type: 'color', $value: '#112233' }, cd: { $type: 'color', $value: '#112233' } })).toEqual(['cd']);
    expect(await dups({ ab: { $type: 'color', $value: '#112233' }, ac: { $type: 'color', $value: '#112233' } })).toEqual(['ac']);
    expect(await dups({ g: { $type: 'color', ab: { $value: '#112233' }, ac: { $value: '#112233' } } })).toEqual(['g.ac']);
  });

  it('counts a composite whose parts alias primitives as an alias, not a literal', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: { $type: 'color', indigo: { $value: '#635DFF' }, aqua: { $value: '#3EC6EB' } },
          gradient: {
            $type: 'gradient',
            $extensions: { 'dev.blazon': { tier: 'semantic' } },
            indigoAqua: {
              $value: [
                { color: '{color.indigo}', position: 0 },
                { color: '{color.aqua}', position: 1 },
              ],
            },
          },
        },
      }),
    );

    expect(result.all).toEqual([]);
  });
});

describe('checkTokens: proportions', () => {
  const colors = {
    $type: 'color',
    white: { $value: '#FFFFFF' },
    light: { $value: '#EAECEE' },
    dark: { $value: '#2A2E35' },
  };

  it('accepts named buckets with token references, and plain group shares', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: colors,
          web: {
            $extensions: {
              'dev.blazon': {
                proportion: {
                  White: { share: 0.5, tokens: ['{color.white}'] },
                  'Light to medium neutrals': { share: 0.25, tokens: ['{color.light}'] },
                  'Black and dark neutrals': { share: 0.15, tokens: ['{color.dark}'] },
                  'Accent colors': { share: 0.1 },
                },
              },
            },
          },
        },
      }),
    );

    expect(result.all).toEqual([]);
  });

  it('reports a bucket naming a token that does not exist, and shares that do not add up to 100%', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: colors,
          web: {
            $extensions: {
              'dev.blazon': { proportion: { White: { share: 0.5, tokens: ['{color.nope}'] }, Rest: { share: 0.4 } } },
            },
          },
        },
      }),
    );

    expect(result.all.map((f) => `${f.path}:${f.code}:${f.severity}`)).toEqual(['web:proportion-invalid:error', 'web:proportion-total-mismatch:warning']);
  });
});

describe('checkTokens: group review', () => {
  const flag = (note: string) => ({ 'dev.blazon': { review: { status: 'needs-review', note } } });
  const ramp = (extra: Record<string, unknown> = {}) => ({
    color: {
      $type: 'color',
      brand: {
        $extensions: flag('proposed ramp'),
        100: { $value: '#eef' },
        200: { $value: '#ddf' },
        300: { $value: '#ccf', ...extra },
      },
      other: { 100: { $value: '#fee' } },
    },
  });
  const reviews = (all: { code: string; path: string; message: string }[]) => all.filter((f) => f.code === 'review-pending');

  it('reports a flagged ramp once, at the group, with its note', async () => {
    const found = reviews(checkTokens(await compileTokens({ 'a.json': ramp() })).warnings);
    expect(found).toEqual([{ code: 'review-pending', severity: 'warning', path: 'color.brand', message: 'proposed ramp' }]);
  });

  it('lets a token report on its own, and status ok override the group', async () => {
    const own = { $extensions: flag('this one is off') };
    expect(codesOf(reviews(checkTokens(await compileTokens({ 'a.json': ramp(own) })).warnings))).toEqual(['color.brand:review-pending', 'color.brand.300:review-pending']);
    const ok = { $extensions: { 'dev.blazon': { review: { status: 'ok' } } } };
    expect(codesOf(reviews(checkTokens(await compileTokens({ 'a.json': ramp(ok) })).warnings))).toEqual(['color.brand:review-pending']);
  });

  it('reports each nested flagged group once; the nearest group covers its tokens', async () => {
    const result = checkTokens(
      await compileTokens({
        'a.json': {
          color: {
            $type: 'color',
            $extensions: flag('outer'),
            a: { $value: '#111' },
            inner: { $extensions: flag('inner'), b: { $value: '#222' } },
            clean: { $extensions: { 'dev.blazon': { review: { status: 'ok' } } }, c: { $value: '#333' } },
          },
        },
      }),
    );
    expect(reviews(result.warnings).map((f) => `${f.path}:${f.message}`)).toEqual(['color:outer', 'color.inner:inner']);
  });

  it('leaves unflagged tokens alone', async () => {
    const result = checkTokens(await compileTokens({ 'a.json': ramp() }));
    expect(result.warnings.some((f) => f.path.startsWith('color.other'))).toBe(false);
  });
});
