import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { LookupError, canUse, measureContrast } from '../../../src/core/read/index.js';
import type { BlazonData } from '../../../src/types/index.js';
import { tempProject } from '../../support/project.js';

// `measureContrast` is a measurement of what would be rendered. It never says whether the brand allows anything: that is `canUse`.

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const blazon = (value: unknown) => ({ $extensions: { 'dev.blazon': value } });

// The expected numbers are worked out here with plain arithmetic, not with the code under test.
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const over = (top: number[], base: number[], a: number): number[] => top.map((c, i) => c * a + base[i]! * (1 - a));
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: number[]): number => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
const ratioOf = (a: number[], b: number[]): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hexOf = (c: number[]): string =>
  `#${c
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

let brand: BlazonData;
let themed: BlazonData;
beforeAll(async () => {
  const files = {
    'tokens/a.json': {
      bg: { $type: 'color', canvas: { $value: '#0b0b14' }, card: { $value: '#101020' }, veil: { $value: '#ffffff80' } },
      text: {
        $type: 'color',
        ...blazon({ pairs: [{ fg: '{text.muted}', bg: '{bg.canvas}', min: 'AA' }] }),
        muted: { $value: '#9a9ab0' },
        faint: { $value: '#444455' },
      },
      glow: { $type: 'color', violet: { $value: '#7c5cff' }, wide: { $value: 'oklch(0.7 0.4 150)' }, haze: { $value: '#7c5cff80' } },
      art: {
        $type: 'gradient',
        hero: {
          $value: [
            { color: '{glow.violet}', position: 0 },
            { color: '{bg.card}', position: 1 },
          ],
        },
      },
    },
    'logo.svg': LOGO,
  };
  brand = await compileBlazonData({ ...DEFAULT_CONFIG }, tempProject(files));
  themed = await compileBlazonData(
    { ...DEFAULT_CONFIG },
    tempProject({
      ...files,
      'tokens/dark.json': { bg: { canvas: { $value: '#000000' } } },
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/a.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
    }),
  );
});

describe('measureContrast: the reported case', () => {
  it('measures text on a canvas under a 12% violet tint, as plain arithmetic does', () => {
    const base = over(rgb('#7c5cff'), rgb('#0b0b14'), 0.12);
    const expected = ratioOf(rgb('#9a9ab0'), base);
    const answer = measureContrast(brand, { fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet', withAlpha: 0.12 });
    expect(answer.ratio).toBe(Math.round(expected * 100) / 100);
    expect(answer.level).toBe('AA');
    expect(answer.nonText).toBe(true);
    expect(answer.seen).toEqual({ fg: '#9a9ab0', bg: hexOf(base) });
    expect(answer).toMatchObject({ fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet', withAlpha: 0.12 });
  });

  it('measures without a tint as the plain pair, and agrees with can', () => {
    const answer = measureContrast(brand, { fg: 'text.muted', bg: 'bg.canvas' });
    expect(answer.ratio).toBe(canUse(brand, 'text.muted', 'bg.canvas').contrast?.ratio);
    expect(answer.ratio).toBe(Math.round(ratioOf(rgb('#9a9ab0'), rgb('#0b0b14')) * 100) / 100);
    expect(answer).not.toHaveProperty('with');
    expect(answer).not.toHaveProperty('withAlpha');
    expect(answer).not.toHaveProperty('alpha');
    expect(answer).not.toHaveProperty('theme');
  });

  it('composites the tint first, then the foreground at its own opacity over that', () => {
    const base = over(rgb('#7c5cff'), rgb('#101020'), 0.4);
    const fg = over(rgb('#9a9ab0'), base, 0.6);
    const answer = measureContrast(brand, { fg: 'text.muted', bg: 'bg.card', with: 'glow.violet', withAlpha: 0.4, alpha: 0.6 });
    expect(answer.ratio).toBe(Math.round(ratioOf(fg, base) * 100) / 100);
    expect(answer.seen).toEqual({ fg: hexOf(fg), bg: hexOf(base) });
    expect(answer.alpha).toBe(0.6);
  });

  it('multiplies the tint token own alpha with withAlpha', () => {
    // #7c5cff80 at 0.5 is a 25% tint (0.50196 * 0.5 is close to 0.25, so compare with the arithmetic on the real alpha)
    const a = (0x80 / 255) * 0.5;
    const base = over(rgb('#7c5cff'), rgb('#0b0b14'), a);
    const answer = measureContrast(brand, { fg: 'text.muted', bg: 'bg.canvas', with: 'glow.haze', withAlpha: 0.5 });
    expect(answer.ratio).toBe(Math.round(ratioOf(rgb('#9a9ab0'), base) * 100) / 100);
  });

  it('reports level fail below every WCAG level, and nonText false below 3:1', () => {
    const answer = measureContrast(brand, { fg: 'text.faint', bg: 'bg.canvas' });
    expect(answer.ratio).toBeLessThan(3);
    expect(answer).toMatchObject({ level: 'fail', nonText: false });
  });
});

describe('measureContrast: says nothing about approval', () => {
  it('has no allowed key, nor any key that reads as approval, and a fixed note', () => {
    for (const input of [
      { fg: 'text.muted', bg: 'bg.canvas' },
      { fg: 'text.faint', bg: 'bg.canvas', with: 'glow.violet', withAlpha: 0.5 },
    ]) {
      const answer = measureContrast(brand, input);
      const keys = Object.keys(answer).sort();
      expect(keys).not.toContain('allowed');
      expect(keys.filter((k) => /allow|approv|pass|ok|verdict|denied/i.test(k))).toEqual([]);
      expect(answer.note).toBe('a measurement, not a brand approval');
    }
  });

  it('carries the pairs the brand lists for the BASE background, and none when none is listed', () => {
    expect(measureContrast(brand, { fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet', withAlpha: 0.12 }).brandPairs).toEqual([
      { fg: '{text.muted}', bg: '{bg.canvas}', min: 'AA', from: 'text' },
    ]);
    expect(measureContrast(brand, { fg: 'text.muted', bg: 'bg.card' }).brandPairs).toEqual([]);
  });
});

describe('measureContrast: refuses, never guesses', () => {
  const refused = (input: Parameters<typeof measureContrast>[1], pattern: RegExp, data = brand) => {
    expect(() => measureContrast(data, input)).toThrow(LookupError);
    expect(() => measureContrast(data, input)).toThrow(pattern);
  };

  it('refuses a translucent base background', () => {
    refused({ fg: 'text.muted', bg: 'bg.veil' }, /translucent.*not known/);
    refused({ fg: 'text.muted', bg: 'bg.veil', with: 'glow.violet', withAlpha: 0.1 }, /translucent/);
  });

  it('refuses a with token that is a gradient, or is not a color', () => {
    refused({ fg: 'text.muted', bg: 'bg.canvas', with: 'art.hero', withAlpha: 0.2 }, /not a color blazon can read.*gradient/);
  });

  it('refuses an unknown token with the did-you-mean helper, for fg, bg and with', () => {
    refused({ fg: 'text.mutd', bg: 'bg.canvas' }, /no token "text.mutd"; did you mean "text.muted"\?/);
    refused({ fg: 'text.muted', bg: 'bg.canvs' }, /did you mean "bg.canvas"\?/);
    refused({ fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violt', withAlpha: 0.1 }, /did you mean "glow.violet"\?/);
  });

  it('refuses a token the theme removed, naming the theme', () => {
    const removed: BlazonData = {
      ...themed,
      tokens: { ...themed.tokens, contexts: [{ modifier: 'theme', context: 'dark', tokens: [], removed: ['glow.violet'] }] as never },
    };
    refused({ fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet', withAlpha: 0.1, theme: 'dark' }, /no token "glow.violet" in theme "dark"/, removed);
  });

  it('refuses withAlpha or alpha below 0, above 1 and NaN, naming which', () => {
    for (const bad of [-0.1, 1.5, Number.NaN]) {
      refused({ fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet', withAlpha: bad }, /withAlpha must be a number from 0 to 1/);
      refused({ fg: 'text.muted', bg: 'bg.canvas', alpha: bad }, /alpha must be a number from 0 to 1/);
    }
  });

  it('refuses with without withAlpha, and the reverse', () => {
    refused({ fg: 'text.muted', bg: 'bg.canvas', with: 'glow.violet' }, /with and withAlpha go together/);
    refused({ fg: 'text.muted', bg: 'bg.canvas', withAlpha: 0.1 }, /with and withAlpha go together/);
  });

  it('refuses an unknown theme', () => {
    refused({ fg: 'text.muted', bg: 'bg.canvas', theme: 'sepia' }, /no theme "sepia"/, themed);
  });
});

describe('measureContrast: theme and gamut', () => {
  it('measures in the named theme and echoes it', () => {
    const answer = measureContrast(themed, { fg: 'text.muted', bg: 'bg.canvas', theme: 'dark' });
    expect(answer.theme).toBe('dark');
    expect(answer.ratio).toBe(Math.round(ratioOf(rgb('#9a9ab0'), rgb('#000000')) * 100) / 100);
  });

  it('gives a finite ratio for an oklch tint outside the sRGB gamut (no gamut mapping in the ratio)', () => {
    const answer = measureContrast(brand, { fg: 'text.muted', bg: 'bg.canvas', with: 'glow.wide', withAlpha: 0.5 });
    expect(Number.isFinite(answer.ratio)).toBe(true);
    expect(answer.ratio).toBeGreaterThanOrEqual(1);
  });
});
