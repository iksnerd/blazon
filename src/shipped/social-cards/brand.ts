import { parseColor, type RGB } from './contrast.js';
import { requireBrand } from '../shared/plugin.js';
import { readLogo, text } from '../shared/brand.js';

// What the plugin reads from brand.json (the `brand` of the request): the social formats, the display type, the theme
// colors, the logos and the assets. It trusts none of it: a field of the wrong shape is a field that is not there.

export interface Format {
  width: number;
  height: number;
  /** The safe area: the card's edge to the text and the logo */
  margin: number;
  columns: number;
}

export interface Display {
  /** The largest display type, in px: where the headline starts */
  start: number;
  /** The smallest display type, in px: the headline is never set smaller */
  floor: number;
  family: string;
  weight: number;
  lineHeight: number;
  letterSpacing: string;
}

export interface BrandAsset {
  id: string;
  category: string;
  file: string;
  format: string;
  width?: number;
  height?: number;
  meta?: Record<string, unknown>;
}

export interface BrandToken {
  type: string;
  value: string;
}

export interface BrandRead {
  formats: Map<string, Format>;
  display: Display;
  bodyFamily: string;
  /** The theme's colors, as CSS: inverse, inverseText, text, accent */
  colors: { inverse?: string; inverseText?: string; text?: string; accent?: string };
  fonts: string[];
  tokens: Map<string, BrandToken>;
  assets: Map<string, BrandAsset>;
  logo: { onLight?: string; onDark?: string };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A dimension's px: `{ value, unit }` from the resolved token, or a CSS length such as "96px" or "2rem". */
function px(value: unknown): number | undefined {
  if (isObject(value) && typeof value.value === 'number') return value.unit === 'rem' ? value.value * 16 : value.value;
  if (typeof value === 'string') {
    const match = /^(-?\d+(?:\.\d+)?)(px|rem)?$/.exec(value.trim());
    if (match) return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
  }
  return undefined;
}

/** The pixel size of a length written as a number in a sidecar or a token: used by the logo plan too. */
export { px as lengthInPx };

const EMPTY_DISPLAY: Display = { start: 96, floor: 40, family: 'sans-serif', weight: 700, lineHeight: 1, letterSpacing: '0em' };

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const theme = isObject(root.theme) ? root.theme : {};
  const roles = isObject(theme.roles) ? theme.roles : {};

  const tokens = new Map<string, BrandToken & { resolved: unknown; parts?: Record<string, unknown> }>();
  for (const item of list(root.tokens)) {
    if (!isObject(item) || typeof item.path !== 'string') continue;
    tokens.set(item.path, { type: text(item.type) ?? '', value: String(item.value ?? ''), resolved: item.resolvedValue, ...(isObject(item.parts) && { parts: item.parts }) });
  }

  const groups = new Map<string, Partial<Record<'width' | 'height' | 'margin' | 'columns', number>>>();
  for (const [path, token] of tokens) {
    const match = /^social\.format\.([^.]+)\.(width|height|margin|columns)$/.exec(path);
    if (!match) continue;
    const value = match[2] === 'columns' ? Number(token.resolved) : px(token.resolved);
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) groups.set(match[1]!, { ...groups.get(match[1]!), [match[2]!]: value });
  }
  const formats = new Map<string, Format>();
  for (const [name, g] of groups) {
    if (g.width === undefined || g.height === undefined) continue;
    formats.set(name, {
      width: g.width,
      height: g.height,
      margin: g.margin ?? Math.round(Math.min(g.width, g.height) * 0.05),
      columns: Number.isInteger(g.columns) ? g.columns! : 6,
    });
  }

  const displayFamily = text(roles.fontDisplay);
  const typed = [...tokens.values()].flatMap((token) => (token.type === 'typography' && token.parts && px(token.parts.fontSize) !== undefined ? [token.parts] : []));
  const family = displayFamily ?? (typed.length > 0 ? text([...typed].sort((a, b) => px(b.fontSize)! - px(a.fontSize)!)[0]!.fontFamily) : undefined);
  const inFamily = typed.filter((parts) => text(parts.fontFamily) === family).sort((a, b) => px(b.fontSize)! - px(a.fontSize)!);
  const largest = inFamily[0];
  const display: Display = largest
    ? {
        start: px(largest.fontSize)!,
        floor: Math.max(20, px(inFamily.at(-1)!.fontSize)!),
        family: family ?? EMPTY_DISPLAY.family,
        weight: typeof largest.fontWeight === 'number' ? largest.fontWeight : EMPTY_DISPLAY.weight,
        lineHeight: typeof largest.lineHeight === 'number' ? largest.lineHeight : EMPTY_DISPLAY.lineHeight,
        letterSpacing: text(largest.letterSpacing) ?? EMPTY_DISPLAY.letterSpacing,
      }
    : { ...EMPTY_DISPLAY, ...(family && { family }) };
  if (display.floor >= display.start) display.floor = Math.max(20, Math.round(display.start / 2));

  const assets = new Map<string, BrandAsset>();
  for (const item of list(root.assets)) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.file !== 'string') continue;
    assets.set(item.id, {
      id: item.id,
      category: text(item.category) ?? '',
      file: item.file,
      format: text(item.format) ?? '',
      ...(typeof item.width === 'number' && { width: item.width }),
      ...(typeof item.height === 'number' && { height: item.height }),
      ...(isObject(item.meta) && { meta: item.meta }),
    });
  }

  return {
    formats,
    display,
    bodyFamily: text(roles.fontBody) ?? 'sans-serif',
    colors: { inverse: text(roles.inverse), inverseText: text(roles.inverseText), text: text(roles.text), accent: text(roles.accent) },
    fonts: list(theme.fonts).filter((url): url is string => typeof url === 'string' && /^(https?:\/\/|data:text\/css[;,])/.test(url)),
    tokens,
    assets,
    logo: readLogo(root),
  };
}

/** A token's color, when it is a color token the plugin can read. */
export function colorOf(brand: BrandRead, path: string | undefined): RGB | undefined {
  const token = path === undefined ? undefined : brand.tokens.get(path);
  return token?.type === 'color' ? parseColor(token.value) : undefined;
}
