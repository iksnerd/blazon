import { describe, expect, it } from 'vitest';
import { logoCandidates, logoOn } from '../../src/viewer/lib/brand';
import { inkOnPaint, whiteContrast } from '../../src/viewer/lib/theme/color';
import { paintContrast } from '../../src/core/checker/contrast';
import type { Asset, AssetMeta, BlazonData, TokenItem } from '../../src/types/index.js';

// The viewer chooses a logo with core's `selectLogo` (the rule `pickLogo` runs) and measures a gradient with core's `paintContrast`. The data is
// built by hand, so the test needs no reference brand: a brand of made-up Acme colors and two logo files.

const token = (path: string, value: string, extra: Partial<TokenItem> = {}): TokenItem =>
  ({ path, name: path, group: '', file: 'tokens.json', type: 'color', value, blazon: {}, ...extra }) as TokenItem;
const logoAsset = (name: string, meta: AssetMeta): Asset =>
  ({ id: `logos/${name}`, name, category: 'logos', filePath: `logos/${name}.svg`, format: 'svg', mediaType: 'image/svg+xml', url: `assets/${name}.svg`, bytes: 1, meta }) as Asset;

function brand(over: { tokens?: TokenItem[]; logos?: Asset[] } = {}): BlazonData {
  const logos = over.logos ?? [logoAsset('night', { ink: '#101820' }), logoAsset('snow', { ink: '#f5f7fa' })];
  return {
    tokens: { items: over.tokens ?? [token('color.acme.night', '#101820'), token('color.acme.snow', '#f5f7fa'), token('color.acme.mid', '#808080')], groupMeta: [] },
    assets: { logos, all: logos, icons: [], custom: {} },
    logo: { onLight: 'data:night', onDark: 'data:snow', onLightAsset: 'logos/night', onDarkAsset: 'logos/snow', onLightInk: '#101820', onDarkInk: '#f5f7fa' },
    vocabulary: { lockups: ['stacked', 'wide'] },
  } as unknown as BlazonData;
}

describe('the viewer picks a logo as core does', () => {
  it('takes the logo that reads on a color', () => {
    const data = brand();
    expect(logoOn(data, '#101820', true, false, data.tokens.items[0])).toBe('data:snow');
    expect(logoOn(data, '#f5f7fa', false, false, data.tokens.items[1])).toBe('data:night');
    expect(logoOn(data, '#808080', true, false, data.tokens.items[2])).toBe('data:night');
  });

  it('never picks a logo that logo.deny forbids, by variant name or asset id', () => {
    const night = token('color.acme.night', '#101820', { blazon: { logo: { deny: ['logos/snow'] } } });
    const data = brand({ tokens: [night] });
    expect(logoOn(data, '#101820', true, false, night)).toBeUndefined();
  });

  it('applies the bar of a colorway that names the background for the logo', () => {
    const slate = token('color.acme.slate', '#5a6a7a');
    const strict = logoAsset('snow', { ink: '#f5f7fa', colorways: [{ name: 'Snow on Slate', on: 'color.acme.slate', min: 'AAA' }] });
    const data = brand({ tokens: [slate], logos: [logoAsset('night', { ink: '#101820' }), strict] });
    // snow reads better on slate (5.1:1 against 3.3:1), but its own colorway asks for AAA, which it does not reach
    expect(logoOn(data, '#5a6a7a', true, false, slate)).toBe('data:night');
    const plain = brand({ tokens: [slate] });
    expect(logoOn(plain, '#5a6a7a', true, false, slate)).toBe('data:snow');
  });

  it('limits the choice to a lockup', () => {
    const data = brand({ logos: [logoAsset('night', { ink: '#101820', lockup: 'wide' }), logoAsset('snow', { ink: '#f5f7fa', lockup: 'stacked' })] });
    const night = data.tokens.items[0]!;
    expect(logoOn(data, '#101820', true, false, night, 'stacked')).toBe('data:snow');
    expect(logoOn(data, '#101820', true, false, night, 'wide')).toBeUndefined();
  });

  it('judges a gradient by core, and lists the same candidates the pick weighs', () => {
    const fade = 'linear-gradient(90deg, #101820, #202830)';
    const data = brand();
    expect(logoOn(data, fade, true, false)).toBe('data:snow');
    expect(whiteContrast(fade)).toBe(paintContrast('#ffffff', fade));
    expect(inkOnPaint(fade)).toBe('#fff');
    expect(logoCandidates(data).map((c) => [c.name, c.src])).toEqual([
      ['onLight', 'data:night'],
      ['onDark', 'data:snow'],
    ]);
  });
});

describe('core measures a paint', () => {
  it('uses the one ratio for colors and the average luminance of the stops for a gradient', () => {
    expect(paintContrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(paintContrast('#000000', 'linear-gradient(#ffffff, #ffffff)')).toBeCloseTo(21);
    expect(paintContrast('#000000', 'var(--x)')).toBeUndefined();
    expect(paintContrast('#000000', 'rgba(255, 255, 255, 0.5)')).toBeUndefined();
  });
});
