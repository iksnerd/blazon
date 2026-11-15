import { contrast, luminance, mix, parseColor, toHex, type Rgb } from '../shared/color.js';
import type { BrandRead } from './brand.js';
import { finding, type Finding } from './options.js';

// The twelve colors of a theme, from the brand's roles. The mapping, which the README states too:
//   dk1, lt1      the text and the background, whichever is darker in dk1 (a dark brand has its background in dk1)
//   dk2, lt2      the inverse surface and the canvas, whichever is darker in dk2
//   accent1       the accent role
//   accent2-6     the colors the `accents` option names, then the brand's other colors: muted and border first, then the color tokens in order, then tints of the accent
//   hlink         the accent;  folHlink: muted

/** Used for a role the brand does not give, so the theme is still whole */
const DEFAULTS: Record<string, string> = {
  text: '#111111',
  background: '#FFFFFF',
  inverse: '#111111',
  canvas: '#F2F2F2',
  accent: '#2563EB',
  muted: '#555555',
  inverseText: '#FFFFFF',
};
const NEEDED = ['text', 'background', 'inverse', 'canvas', 'accent'];

export type Slot = 'dk1' | 'lt1' | 'dk2' | 'lt2';

export interface Palette {
  dk1: string;
  lt1: string;
  dk2: string;
  lt2: string;
  accents: [string, string, string, string, string, string];
  hlink: string;
  folHlink: string;
  /** The theme slot each surface role is in, which the master's color map and the layouts' surfaces follow */
  slots: { background: Slot; text: Slot; inverse: Slot; canvas: Slot };
}

export function planPalette(
  brand: Pick<BrandRead, 'roles' | 'colors'> & Partial<Pick<BrandRead, 'named'>>,
  accentsOption: readonly string[] = [],
): { palette: Palette; findings: Finding[] } {
  const findings: Finding[] = [];
  const role = (name: string): Rgb => {
    const given = brand.roles[name];
    const parsed = parseColor(given);
    if (parsed) return parsed;
    if (NEEDED.includes(name)) {
      const why = given ? `is ${given}, which is not a hex or rgb() color this plugin reads` : 'is not in the brand';
      findings.push(finding('color-role-missing', 'warning', `theme.roles.${name}`, `the ${name} color ${why}, so the theme uses ${DEFAULTS[name]}`));
    }
    return parseColor(DEFAULTS[name])!;
  };
  const text = role('text');
  const background = role('background');
  const inverse = role('inverse');
  const canvas = role('canvas');
  const accent = role('accent');
  const muted = brand.roles.muted ? (parseColor(brand.roles.muted) ?? parseColor(DEFAULTS.muted)!) : mix(text, background, 0.35);

  if (contrast(text, background) < 4.5)
    findings.push(
      finding('low-contrast', 'warning', 'theme.roles.text', `the text color has ${contrast(text, background).toFixed(1)}:1 contrast on the background; body text needs 4.5:1`),
    );

  const [dk1, lt1] = luminance(text) <= luminance(background) ? [text, background] : [background, text];
  const [dk2, lt2] = luminance(inverse) <= luminance(canvas) ? [inverse, canvas] : [canvas, inverse];
  const slots: Palette['slots'] = {
    background: dk1 === background ? 'dk1' : 'lt1',
    text: dk1 === text ? 'dk1' : 'lt1',
    inverse: dk2 === inverse ? 'dk2' : 'lt2',
    canvas: dk2 === canvas ? 'dk2' : 'lt2',
  };

  // accent2-6: colors the brand has, not yet in the theme, then tints of the accent
  const used = new Set([text, background, inverse, canvas, accent].map(toHex));
  const others: Rgb[] = [];
  const consider = (color: Rgb | undefined) => {
    if (color && !used.has(toHex(color))) {
      used.add(toHex(color));
      others.push(color);
    }
  };
  // the colors the person chose come first, a token by its path (an alias too) or a color as written; one that is neither is a finding and is skipped
  for (const named of accentsOption) {
    const color = parseColor((brand.named ?? brand.colors).find((token) => token.path === named)?.value ?? named);
    if (color) consider(color);
    else
      findings.push(
        finding('option-invalid', 'error', 'options.accents', `accents names ${JSON.stringify(named)}, which is neither a color token of the brand nor a hex or rgb() color`),
      );
  }
  consider(muted);
  consider(parseColor(brand.roles.border));
  for (const { value } of brand.colors) consider(parseColor(value));
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  for (const tint of [mix(accent, white, 0.4), mix(accent, black, 0.35), mix(accent, white, 0.7), mix(accent, black, 0.6), mix(accent, white, 0.2)]) consider(tint);
  // a gray accent can make every tint a color the theme has: step further until there are five
  for (let step = 1; others.length < 5 && step < 40; step++) consider(mix(accent, step % 2 ? white : black, 0.025 * step));

  const accents = [accent, ...others.slice(0, 5)].map(toHex) as Palette['accents'];
  return { palette: { dk1: toHex(dk1), lt1: toHex(lt1), dk2: toHex(dk2), lt2: toHex(lt2), accents, hlink: toHex(accent), folHlink: toHex(muted), slots }, findings };
}
