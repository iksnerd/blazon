import { parseColor, toHex } from '../shared/color.js';
import type { BrandRead, ColorToken } from './brand.js';
import { finding, type Finding } from './options.js';

// The brand's colors as three files: colors.json for a program, colors.css for a web page, colors.txt for a person. Only what the tokens
// say: a hex and an RGB triple when the value is a plain hex or rgb() color, and print values (CMYK, Pantone, RAL) only when a token states them.
// A token that is another name for a color is listed under that color, not as a color of its own.

export interface KitColor {
  path: string;
  description?: string;
  /** The value as the token writes it */
  value: string;
  /** Six capitals with a #, and the channels, when the value is a plain hex or rgb() color */
  hex?: string;
  rgb?: [number, number, number];
  cssVariable: string;
  /** The other tokens that are names for this color, such as text.primary */
  usedAs: string[];
  print?: { cmyk?: number[]; pms?: string; ral?: string };
  /** `needs-review` for a color the token marks so and the `unreviewed` option let in */
  review?: 'needs-review';
}

const PLAIN = /^(#([0-9a-f]{3}|[0-9a-f]{6})|rgb\(\s*[\d.]+%?[\s,]+[\d.]+%?[\s,]+[\d.]+%?\s*\))$/i;
const cssName = (path: string): string => `--${path.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;

export function planColors(brand: Pick<BrandRead, 'colors'>, options: { unreviewed?: boolean } = {}): { colors: KitColor[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const byPath = new Map(brand.colors.map((token) => [token.path, token]));
  /** The color a token is, following its aliases to the one that has a value of its own */
  const rootOf = (token: ColorToken): ColorToken => {
    const seen = new Set<string>();
    let at = token;
    while (at.aliasOf && byPath.has(at.aliasOf) && !seen.has(at.path)) {
      seen.add(at.path);
      at = byPath.get(at.aliasOf)!;
    }
    return at;
  };
  const colors = new Map<string, KitColor>();
  for (const token of brand.colors) {
    if (token.aliasOf) continue;
    const unreviewed = token.review?.status === 'needs-review';
    if (unreviewed && !options.unreviewed) {
      findings.push(
        finding(
          'color-left-out',
          'warning',
          token.path,
          `${token.path} is left out of the kit because its token marks it needs-review${token.review!.note ? `: ${token.review!.note}` : ''}; set the unreviewed option to true to include it, labelled as unreviewed`,
        ),
      );
      continue;
    }
    const plain = PLAIN.test(token.value.trim());
    const rgb = plain ? parseColor(token.value) : undefined;
    if (!rgb)
      findings.push(
        finding(
          'color-not-hex',
          'info',
          token.path,
          `${token.path} is written as ${token.value}, which is not a hex or rgb() color, so the kit gives it as written and states no hex or RGB`,
        ),
      );
    colors.set(token.path, {
      path: token.path,
      ...(token.description && { description: token.description }),
      value: token.value,
      ...(rgb && { hex: `#${toHex(rgb)}`, rgb }),
      cssVariable: token.cssVariable?.startsWith('--') ? token.cssVariable : cssName(token.path),
      usedAs: [],
      ...(unreviewed && { review: 'needs-review' as const }),
      ...(token.print && (token.print.cmyk || token.print.pms || token.print.ral) && { print: token.print }),
    });
  }
  for (const token of brand.colors) {
    if (!token.aliasOf) continue;
    const root = rootOf(token);
    if (!root.aliasOf) colors.get(root.path)?.usedAs.push(token.path);
  }
  const list = [...colors.values()];
  if (list.length === 0) findings.push(finding('color-none', 'warning', 'tokens', 'the brand has no color token to put in the kit, so it carries no colors'));
  return { colors: list, findings };
}

export const colorsJson = (colors: KitColor[]): string => `${JSON.stringify({ colors }, null, 2)}\n`;

export function colorsCss(colors: KitColor[]): string {
  const lines = [':root {'];
  for (const color of colors) lines.push(`  ${color.cssVariable}: ${color.value};`);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function colorsText(colors: KitColor[], note?: string): string {
  const lines = note ? ['Colors', '', `Note: ${note}`, ''] : ['Colors', ''];
  for (const color of colors) {
    const name = color.description && color.description.length <= 60 ? `${color.description} (${color.path})` : color.path;
    lines.push(color.review ? `${name} (unreviewed)` : name);
    if (color.hex) lines.push(`  HEX  ${color.hex}`, `  RGB  ${color.rgb!.join(', ')}`);
    else lines.push(`  As written  ${color.value}`);
    if (color.print?.cmyk) lines.push(`  CMYK  ${color.print.cmyk.join(', ')}`);
    if (color.print?.pms) lines.push(`  Pantone  ${color.print.pms}`);
    if (color.print?.ral) lines.push(`  RAL  ${color.print.ral}`);
    if (color.usedAs.length > 0) lines.push(`  Also named  ${color.usedAs.join(', ')}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
