import { toHex } from '../shared/hex.js';

// The brand colors of a site: the custom properties that are named for a brand role and hold an opaque color.

const MAX_COLORS = 40;
const COLOR_NAME = /brand|primary|secondary|accent|background|foreground|surface/i;

export interface ColorPick {
  cssVar: string;
  hex: string;
  exact: boolean;
  segments: string[];
}

export function pickColors(vars: Map<string, string>): ColorPick[] {
  const picks: ColorPick[] = [];
  const seen = new Set<string>();
  for (const [cssVar, value] of vars) {
    if (!COLOR_NAME.test(cssVar)) continue;
    const color = toHex(value);
    // A brand color is opaque: a hex with alpha, or rgb() with an alpha under 1, is an overlay
    if (!color || color.hex.length !== 7) continue;
    let segments = cssVar.slice(2).toLowerCase().split(/[-_]+/).filter(Boolean);
    if (segments.length > 1 && (segments[0] === 'color' || segments[0] === 'colors')) segments = segments.slice(1);
    // The text on a color (`--info-foreground`) or on a dark or light surface is not a brand color; `--foreground` is
    if (segments.length > 1 && segments.at(-1) === 'foreground') continue;
    if (segments.length > 1 && segments.at(-2) === 'on' && /^(dark|light)$/.test(segments.at(-1)!)) continue;
    if (segments.length === 0 || seen.has(segments.join('.'))) continue;
    seen.add(segments.join('.'));
    picks.push({ cssVar, ...color, segments });
  }
  return picks.slice(0, MAX_COLORS);
}

/** The pick that best stands for a role: the one named exactly for it, then the one with the shortest name. */
export function pickRole(picks: ColorPick[], role: string, taken: ColorPick[] = []): ColorPick | undefined {
  const named = picks.filter((p) => p.segments.includes(role));
  const found = named.sort((a, b) => Number(a.segments.at(-1) !== role) - Number(b.segments.at(-1) !== role) || a.segments.length - b.segments.length)[0];
  if (found || role !== 'secondary') return found;
  // No color is named secondary: the first brand color that is not the primary or the accent, and not a tint or a background
  return picks.find(
    (p) => !taken.includes(p) && p.segments.includes('brand') && !p.segments.some((s) => /light|dark|strong|hero|raised|navy|background|foreground|surface/.test(s)),
  );
}
