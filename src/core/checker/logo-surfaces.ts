import type { Finding, LogoSet, ThemeRole, TokenItem } from '../../types/index.js';
import { logoDenialUnder } from './logo-rules.js';
import { contrastBetween, contrastRatio, parseColor } from './contrast.js';
import { finding } from './catalogue.js';

// The brand book shows each configured logo on the surface it is made for (the `blazon:logo-usage` tiles): the light logo on a light surface
// and the dark-surface logo on a dark one, judged for the background, the inverse surface and the accent by the text color each is paired with. A part of the logo that is
// the surface's own color is not there to be seen: an orange mark on an orange surface. `blazon check` says so, unless the brand has
// forbidden that logo on that surface (`logo: { deny }` on the token), which also takes the tile off the page.

/** Below this ratio a color is taken to be the surface it is drawn on: WCAG's 3:1 for graphics is a requirement on a component, this is "not there at all". */
export const INVISIBLE_BELOW = 1.5;

type Variant = 'onLight' | 'onDark';

/** A fill or a stroke and the color after it: a hex, rgb() or hsl() color, or a name such as `white`. A paint server is `url(...)`, so a word followed by a bracket is not a color. */
const COLOR = /(?:fill|stroke)\s*[=:]\s*["']?\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)"';]*\)|hsla?\([^)"';]*\)|[a-zA-Z]+\b(?!\s*\())/g;

/** Words that follow a fill or a stroke and paint nothing, or paint with something other than a color of their own. */
const NOT_A_COLOR = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'context']);

/** The colors an SVG data URI paints, as written, without repeats. A raster, or anything that is not an SVG, paints none that can be read. */
export function paintedColors(src: string): string[] {
  const match = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(src);
  if (!match) return [];
  let text: string;
  try {
    text = match[1] ? Buffer.from(match[2]!, 'base64').toString('utf-8') : decodeURIComponent(match[2]!);
  } catch {
    return [];
  }
  return [...new Set([...text.matchAll(COLOR)].map((m) => m[1]!).filter((color) => !NOT_A_COLOR.has(color.toLowerCase())))];
}

const WHITE = parseColor('#ffffff')!;
const BLACK = parseColor('#000000')!;

/** Whether a surface is dark, as the viewer judges it: by the text color the brand pairs with it, else by white reaching 3:1 on it. */
function isDark(surface: string, text: string | undefined): boolean {
  const ink = text ? parseColor(text) : undefined;
  if (ink) return contrastRatio(ink, BLACK) > contrastRatio(ink, WHITE);
  const paint = parseColor(surface);
  return paint ? contrastRatio(paint, WHITE) >= 3 : true;
}

export function logoSurfaceFindings(
  logo: LogoSet | undefined,
  theme: Partial<Record<ThemeRole, string>>,
  themeTokens: Partial<Record<ThemeRole, string>> | undefined,
  items: readonly TokenItem[],
): Finding[] {
  if (!logo) return [];
  // Each surface gets the variant its darkness asks for, so a dark theme, whose background is dark and whose inverse may be light, is judged as the book shows it
  const surfaces: { role: ThemeRole; label: string; variant: Variant }[] = [
    { role: 'background', label: 'the background', variant: theme.background && isDark(theme.background, theme.text) ? 'onDark' : 'onLight' },
    { role: 'inverse', label: 'the inverse surface', variant: theme.inverse && !isDark(theme.inverse, theme.inverseText) ? 'onLight' : 'onDark' },
    { role: 'accent', label: 'the accent color', variant: theme.accent && isDark(theme.accent, theme.accentText) ? 'onDark' : 'onLight' },
  ];
  const findings: Finding[] = [];
  for (const { role, label, variant } of surfaces) {
    const paint = theme[role];
    const src = logo[variant];
    const surface = paint ? parseColor(paint) : undefined;
    if (!paint || !surface || !src) continue;
    const token = themeTokens?.[role] ? items.find((t) => t.path === themeTokens[role]) : undefined;
    const asset = variant === 'onLight' ? logo.onLightAsset : logo.onDarkAsset;
    if (token && logoDenialUnder(token, items, asset ? [variant, asset] : [variant])) continue;
    for (const color of paintedColors(src)) {
      const painted = parseColor(color);
      const ratio = painted ? contrastBetween(painted, surface) : undefined;
      if (ratio === undefined || ratio >= INVISIBLE_BELOW) continue;
      findings.push(
        finding('logo-contrast-insufficient', {
          path: `logo.${variant}`,
          message: `The ${variant === 'onDark' ? 'dark-surface' : 'light-surface'} logo draws ${color}, which is the color of ${label} (${paint}) where the brand book shows it (contrast ${ratio.toFixed(1)}:1): that part of the logo is not visible. Forbid the logo on that surface, or give the brand a logo made for it`,
        }),
      );
    }
  }
  return findings;
}
