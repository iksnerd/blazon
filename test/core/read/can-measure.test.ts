import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { contrastFindings, expand } from '../../../src/core/checker/contrast.js';
import { LookupError, canUse, canUseMany } from '../../../src/core/read/index.js';
import { allPairs } from '../../../src/core/read/rules.js';
import type { BlazonData } from '../../../src/types/index.js';
import { exampleProject } from '../../support/examples';
import { tempProject } from '../../support/project';

// `can` and `check` measure contrast with one function (contrastBetween), so a translucent color has one ratio in both.
// A usage rule is read before the colors are, so a token that is not a color can still be denied.

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const blazon = (value: unknown) => ({ $extensions: { 'dev.blazon': value } });

let brand: BlazonData;
beforeAll(async () => {
  brand = await compileBlazonData(
    { ...DEFAULT_CONFIG },
    tempProject({
      'tokens/a.json': {
        c: {
          $type: 'color',
          white: { $value: '#ffffff' },
          blue: { $value: '#3885FF80' },
          solid: { $value: '#3885FF' },
          veil: { $value: '#ffffff80' },
          wide: { $value: 'oklch(0.7 0.4 150)' },
        },
        g: {
          $type: 'gradient',
          art: {
            $value: [
              { color: '{c.white}', position: 0 },
              { color: '{c.solid}', position: 1 },
            ],
            ...blazon({ usage: { allow: ['illustration'] } }),
          },
          open: {
            $value: [
              { color: '{c.white}', position: 0 },
              { color: '{c.solid}', position: 1 },
            ],
          },
        },
      },
      'logo.svg': LOGO,
    }),
  );
});

describe('can measures as check does', () => {
  it('blends a translucent foreground over the background: #3885FF80 on white is 1.82:1, not the opaque 3.52:1', () => {
    expect(canUse(brand, 'c.blue', 'c.white').contrast?.ratio).toBe(1.82);
    expect(canUse(brand, 'c.solid', 'c.white').contrast?.ratio).toBe(3.52);
  });

  it('refuses a translucent background as an error, for text and for ui', () => {
    expect(() => canUse(brand, 'c.solid', 'c.veil')).toThrow(LookupError);
    expect(() => canUse(brand, 'c.solid', 'c.veil', 'ui')).toThrow(/translucent.*not known/);
    expect(() => canUseMany(brand, [{ fg: 'c.solid', bg: 'c.veil' }])).toThrow(/^pairs\[0\]: /);
  });

  it('multiplies alpha with the foreground token own alpha, for both roles', () => {
    // #3885FF at 0.5 over white is the same as the token #3885FF80
    expect(canUse(brand, 'c.solid', 'c.white', 'text', undefined, 0.5).contrast?.ratio).toBe(1.82);
    expect(canUse(brand, 'c.solid', 'c.white', 'ui', undefined, 0.5)).toMatchObject({ allowed: false, alpha: 0.5, contrast: { ratio: 1.82 } });
    // 0.5 of 0.5 is 0.25: nearer white than either
    const quarter = canUse(brand, 'c.blue', 'c.white', 'text', undefined, 0.5).contrast!.ratio;
    expect(quarter).toBeLessThan(1.82);
    expect(canUse(brand, 'c.blue', 'c.white', 'text', undefined, 1).contrast?.ratio).toBe(1.82);
    expect(canUse(brand, 'c.solid', 'c.white', 'text', undefined, 0).contrast?.ratio).toBe(1);
  });

  it('refuses alpha below 0, above 1 and NaN', () => {
    for (const bad of [-0.1, 1.5, Number.NaN]) expect(() => canUse(brand, 'c.solid', 'c.white', 'text', undefined, bad)).toThrow(/alpha must be a number from 0 to 1/);
  });

  it('measures a color outside the sRGB gamut with alpha to a finite ratio', () => {
    const ratio = canUse(brand, 'c.wide', 'c.white', 'text', undefined, 0.5).contrast?.ratio;
    expect(Number.isFinite(ratio)).toBe(true);
  });
});

describe('usage is read before the colors', () => {
  it('denies a gradient that usage forbids, with the usage reason, as foreground or background', () => {
    const asBg = canUse(brand, 'c.solid', 'g.art');
    expect(asBg).toMatchObject({ allowed: false, reason: expect.stringContaining('allows only "illustration", not "background"') });
    expect(asBg.contrast).toBeUndefined();
    expect(canUse(brand, 'g.art', 'c.white')).toMatchObject({ allowed: false, reason: expect.stringContaining('not "text"') });
    expect(canUse(brand, 'g.art', 'c.white', 'ui').allowed).toBe(false);
  });

  it('still errors for a gradient that no rule forbids: unknown is not a denial', () => {
    expect(() => canUse(brand, 'c.solid', 'g.open')).toThrow(/not a color blazon can read/);
    expect(() => canUse(brand, 'g.open', 'c.white')).toThrow(/not a color blazon can read/);
  });
});

describe('every listed pair of the example brands', () => {
  it('fails in can exactly when it fails in check', async () => {
    let seen = 0;
    for (const name of ['blazon'] as const) {
      const data = await compileBlazonData({ ...DEFAULT_CONFIG }, exampleProject(name));
      for (const pair of allPairs(data)) {
        for (const bg of expand(pair.bg, data.tokens.items)) {
          for (const fg of expand(pair.fg, data.tokens.items)) {
            const checkFails = contrastFindings({ fg: `{${fg.path}}`, bg: `{${bg.path}}`, min: pair.min }, pair.from, data.tokens.items).length > 0;
            const prefix = `pairs on ${pair.from} list ${pair.fg} on ${pair.bg}:`;
            let canFails: boolean;
            try {
              canFails = canUse(data, fg.path, bg.path).checks.some((c) => c.rule === 'pairs' && !c.ok && c.message.startsWith(prefix));
            } catch (error) {
              if (!(error instanceof LookupError)) throw error;
              canFails = true;
            }
            expect(canFails, `${fg.path} on ${bg.path} (${pair.min})`).toBe(checkFails);
            seen++;
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
