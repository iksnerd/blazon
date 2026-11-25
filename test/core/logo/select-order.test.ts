import { describe, it, expect } from 'vitest';
import { ratioOnColor, selectLogo, type LogoFiles } from '../../../src/core/logo/judge.js';
import { parseColor } from '../../../src/core/checker/contrast.js';
import type { BlazonData, TokenItem } from '../../../src/types/index.js';

// The order of selectLogo, which the manual states: a candidate that declares an ink and reaches the bar is used in place of a configured
// file that declares none, the highest ratio winning; only without one are the plain configured files judged as black and white.

const token = (path: string, value: string, logo?: { deny: string[]; reason: string }): TokenItem =>
  ({ path, type: 'color', value, resolvedValue: value, cssVariable: `--${path}`, blazon: logo ? { logo } : {} }) as unknown as TokenItem;

const NIGHT = token('color.acme.night', '#202020');
const MID = token('color.acme.mid', '#808080');

interface Setup {
  /** Sidecar ink of the configured files */
  lightInk?: string;
  darkInk?: string;
  /** Extra logo assets and the colorways they carry */
  assets?: { id: string; ink?: string; colorways?: { name: string; on: string; min: 'AA' | 'AA-large' | 'AAA'; variant?: string }[] }[];
  tokens?: TokenItem[];
}

function brand({ lightInk, darkInk, assets = [], tokens = [NIGHT, MID] }: Setup): BlazonData {
  const logos = [
    { id: 'logos/acme-black', meta: lightInk ? { ink: lightInk } : {} },
    { id: 'logos/acme-white', meta: darkInk ? { ink: darkInk } : {} },
    ...assets.map((a) => ({ id: a.id, meta: { ...(a.ink && { ink: a.ink }), ...(a.colorways && { colorways: a.colorways }) } })),
  ];
  return {
    logo: {
      onLight: 'black.svg',
      onDark: 'white.svg',
      onLightAsset: 'logos/acme-black',
      onDarkAsset: 'logos/acme-white',
      ...(lightInk && { onLightInk: lightInk }),
      ...(darkInk && { onDarkInk: darkInk }),
    },
    assets: { logos },
    tokens: { items: tokens },
  } as unknown as BlazonData;
}

const files: LogoFiles = {
  variant: (variant) => (variant === 'onLight' ? 'black.svg' : 'white.svg'),
  asset: (id) => `${id.replace('logos/', '')}.svg`,
};

const pick = (data: BlazonData, background: TokenItem) => {
  const bg = parseColor(String(background.value))!;
  return selectLogo(data, { background, ratioOn: ratioOnColor(bg), files });
};

describe('selectLogo order', () => {
  it('uses an asset that declares an ink where it reaches the bar, though the plain white file has a higher ratio', () => {
    const { winner } = pick(brand({ assets: [{ id: 'logos/acme-gold', ink: '#d4af37' }] }), NIGHT);
    expect(winner).toMatchObject({ file: 'acme-gold.svg', asset: 'logos/acme-gold' });
    expect(winner!.ratio).toBeLessThan(14);
  });

  it('takes the highest ratio among the declared inks', () => {
    const data = brand({
      assets: [
        { id: 'logos/acme-gold', ink: '#d4af37' },
        { id: 'logos/acme-cream', ink: '#f5f0e0' },
      ],
    });
    expect(pick(data, NIGHT).winner?.asset).toBe('logos/acme-cream');
  });

  it('falls to the plain configured files when no declared ink reaches the bar', () => {
    const data = brand({ assets: [{ id: 'logos/acme-gold', ink: '#d4af37' }] });
    expect(pick(data, MID).winner).toMatchObject({ file: 'white.svg' });
    const dark = token('color.acme.black', '#101010');
    const dim = brand({ assets: [{ id: 'logos/acme-dim', ink: '#303030' }], tokens: [dark] });
    expect(pick(dim, dark).winner).toMatchObject({ file: 'white.svg' });
  });

  it('uses the plain onDark file wherever it reaches the bar, though the plain onLight file has a higher ratio', () => {
    // On #808080 black is about 5.3:1 and white about 4.0:1; both reach 3:1, so the dark-surface file wins
    expect(pick(brand({}), MID).winner).toMatchObject({ file: 'white.svg' });
  });

  it('uses the plain onLight file when onDark is denied', () => {
    const mid = token('color.acme.mid', '#808080', { deny: ['onDark'], reason: 'No white on mid grey' });
    expect(pick(brand({ tokens: [mid] }), mid).winner).toMatchObject({ file: 'black.svg' });
  });

  it('uses the plain onLight file when onDark does not reach the bar', () => {
    const paper = token('color.acme.paper', '#f0f0f0');
    expect(pick(brand({ tokens: [paper] }), paper).winner).toMatchObject({ file: 'black.svg' });
  });

  it('has no winner when neither plain file reaches the bar', () => {
    // No colour fails both black and white at 3:1, so deny onDark and use a colour that onLight misses
    const dark = token('color.acme.deep', '#101010', { deny: ['onDark'], reason: 'No white on deep' });
    const result = pick(brand({ tokens: [dark] }), dark);
    expect(result.winner).toBeUndefined();
    expect(result.denied.length).toBe(1);
    expect(result.weak.length).toBe(1);
  });

  it('judges a configured file that declares an ink as that ink, among the inked candidates', () => {
    const data = brand({ darkInk: '#cccccc', assets: [{ id: 'logos/acme-gold', ink: '#d4af37' }] });
    // The configured file declares #cccccc, which beats the gold on night
    expect(pick(data, NIGHT).winner).toMatchObject({ file: 'white.svg' });
  });

  it('gives a tie to the configured file', () => {
    const data = brand({ darkInk: '#d4af37', assets: [{ id: 'logos/acme-twin', ink: '#d4af37' }] });
    expect(pick(data, NIGHT).winner?.file).toBe('white.svg');
  });

  it('still applies logo.deny: a denied inked asset is left out and the plain file is used', () => {
    const night = token('color.acme.night', '#202020', { deny: ['logos/acme-gold'], reason: 'Never gold on night' });
    const result = pick(brand({ assets: [{ id: 'logos/acme-gold', ink: '#d4af37' }], tokens: [night] }), night);
    expect(result.winner?.file).toBe('white.svg');
    expect(result.denied).toEqual([expect.objectContaining({ name: 'logos/acme-gold', reason: 'Never gold on night' })]);
  });

  it('still applies a colorway bar: an inked asset under its level is left out', () => {
    const data = brand({ assets: [{ id: 'logos/acme-gold', ink: '#d4af37', colorways: [{ name: 'night', on: 'color.acme.night', min: 'AAA' }] }] });
    // Gold on #202020 is about 7.6:1 and passes AAA; on this near-black it is stricter than the default but still reads
    expect(pick(data, NIGHT).winner).toMatchObject({ asset: 'logos/acme-gold', min: 7, colorway: 'night' });
    const strict = brand({ assets: [{ id: 'logos/acme-gold', ink: '#8a7020', colorways: [{ name: 'night', on: 'color.acme.night', min: 'AAA' }] }] });
    // This ink is about 3.4:1: it clears the default bar but not its own colorway's AAA, so the plain white file is used
    expect(pick(strict, NIGHT).winner).toMatchObject({ file: 'white.svg' });
  });

  it('refuses with every candidate weak when nothing reaches the bar', () => {
    const light = token('color.acme.paper', '#f0f0f0');
    const none = brand({ assets: [{ id: 'logos/acme-pale', ink: '#f8f8f8' }], tokens: [light] });
    // the black file reads on paper, so a winner exists; strip it by denying it
    const denied = token('color.acme.paper', '#f0f0f0', { deny: ['onLight'], reason: 'No black on paper' });
    const result = pick({ ...none, tokens: { items: [denied] } } as unknown as BlazonData, denied);
    expect(result.winner).toBeUndefined();
    expect(result.denied.length).toBe(1);
    expect(result.weak.length).toBeGreaterThan(0);
  });
});
