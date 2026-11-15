import { fontOf } from '../shared/font-stack.js';
import type { TypeStyle } from './brand.js';
import { finding, type Finding } from './options.js';

// The theme's two fonts: the heading font (major) and the body font (minor), from the `fontDisplay` and `fontBody` roles. A role is a CSS
// font stack; a theme names one font, so the first named family is the one. PowerPoint cannot take a font from a web stack, and a .potx
// cannot carry a font file, so a brand font is named and the finding says it has to be installed.

export { fontOf };

export const FALLBACK_FONT = 'Arial';

/** Fonts Office and macOS ship with, which a computer has without anyone installing them */
const SYSTEM = new Set([
  'arial',
  'helvetica',
  'helvetica neue',
  'calibri',
  'cambria',
  'georgia',
  'times new roman',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'courier new',
  'segoe ui',
  'aptos',
  'garamond',
  'palatino',
]);

export interface FontPlan {
  major: string;
  minor: string;
  findings: Finding[];
}

export function planFonts(roles: Record<string, string>): FontPlan {
  const findings: Finding[] = [];
  const pick = (role: 'fontDisplay' | 'fontBody', label: string): string => {
    const name = fontOf(roles[role]);
    if (!name) {
      const why = roles[role] ? `names no font (${roles[role]})` : 'is not in the brand';
      findings.push(finding('font-fallback', 'warning', `theme.roles.${role}`, `the ${label} font ${why}, so the theme uses ${FALLBACK_FONT}`));
      return FALLBACK_FONT;
    }
    if (!SYSTEM.has(name.toLowerCase()))
      findings.push(
        finding(
          'font-not-embedded',
          'info',
          `theme.roles.${role}`,
          `the ${label} font is ${name}, which a template cannot carry: install it on each computer that opens the template, or PowerPoint shows another font`,
        ),
      );
    return name;
  };
  const major = pick('fontDisplay', 'heading');
  const minor = pick('fontBody', 'body');
  return { major, minor, findings };
}

/** How a title is set: the line height as a multiple of its size, and the tracking in em (none when the brand states none) */
export interface HeadingStyle {
  lineHeight: number;
  tracking?: number;
  /** The typography token it was read from; undefined for the fallback */
  from?: string;
}

/** The line height of titles when the brand's typography tokens give none: the low end of the 1.1 to 1.25 usual for a headline */
export const FALLBACK_LINE_HEIGHT = 1.1;

/**
 * The line height and tracking of titles, from the brand's own typography tokens, in the heading font: a style whose path ends in
 * `.display`, else one ending in `.h1`, else the largest. Among several of the same name the largest wins. A style with no `lineHeight`
 * gives the fallback line height, one with no `letterSpacing` in em gives no tracking; no style in the heading font gives both fallbacks.
 */
export function planHeading(styles: TypeStyle[] | undefined, major: string): HeadingStyle {
  const sized = (styles ?? []).filter((style) => style.sizePx !== undefined && style.family !== undefined && fontOf(style.family)?.toLowerCase() === major.toLowerCase());
  const largest = (list: TypeStyle[]) => list.reduce<TypeStyle | undefined>((best, style) => (best === undefined || style.sizePx! > best.sizePx! ? style : best), undefined);
  const named = (suffix: string) => largest(sized.filter((style) => style.path.endsWith(suffix)));
  const chosen = named('.display') ?? named('.h1') ?? largest(sized);
  if (!chosen) return { lineHeight: FALLBACK_LINE_HEIGHT };
  return {
    lineHeight: chosen.lineHeight ?? FALLBACK_LINE_HEIGHT,
    ...(chosen.letterSpacingEm !== undefined && chosen.letterSpacingEm !== 0 && { tracking: chosen.letterSpacingEm }),
    from: chosen.path,
  };
}
