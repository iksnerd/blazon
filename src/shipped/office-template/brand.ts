import type { AssetMeta } from '../../types/index.js';
import { artworkSize } from '../../core/assets/measure.js';
import { keepRepresentation } from '../../core/assets/representations.js';
import { isObject, requireBrand } from '../shared/plugin.js';
import { readBaseAsset, readLogo, readMeta, readRoles, text } from '../shared/brand.js';

// What the plugin reads from brand.json (the `brand` of the request): the title, the theme roles, the color tokens and the logo assets
// with their sidecar rules. It trusts none of it: a field of the wrong shape is a field that is not there.

/** The formats an Office template takes, best first (`logoFor` in main.ts: SVG, PNG, JPEG, GIF); an id with none of them still keeps one file, so the plugin can say it is not supported. */
const OFFICE_FORMATS = ['svg', 'png', 'jpg', 'gif'];

export interface LogoAsset {
  id: string;
  /** Where the file is, relative to the built site */
  file: string;
  format: string;
  /** The artwork's own size in pixels; undefined when the file does not say */
  size?: { width: number; height: number };
  meta: AssetMeta;
}

/** A composite typography token, as far as the headline rule needs it */
export interface TypeStyle {
  path: string;
  /** The first family of its `fontFamily` */
  family?: string;
  /** Its font size in pixels (px and rem lengths) */
  sizePx?: number;
  /** Unitless, as a multiple of the font size */
  lineHeight?: number;
  /** In em; undefined for a unit this plugin does not convert */
  letterSpacingEm?: number;
}

export interface BrandRead {
  title: string;
  /** The theme roles as brand.json gives them: CSS colors and font stacks, by role name */
  roles: Record<string, string>;
  /** The brand's own colors, in token order: a color token that is not an alias, as the value its token resolves to */
  colors: { path: string; value: string }[];
  /** Every color token, aliases too, by path: what the `accents` option may name. `colors` leaves aliases out so that the plugin's own pick does not take one color twice */
  named: { path: string; value: string }[];
  /** The typography tokens that are not aliases, in token order */
  typography: TypeStyle[];
  assets: Map<string, LogoAsset>;
  /** Every file of every asset, for a logo that names a file and not an id (`findByFile`): `assets` keeps one for each id */
  files: LogoAsset[];
  /** The files brand.json names as the logo for a light and for a dark surface */
  logo: { onLight?: string; onDark?: string };
}

const REM_PX = 16;
const length = (value: unknown, unit: string[]): number | undefined =>
  isObject(value) && typeof value.value === 'number' && Number.isFinite(value.value) && typeof value.unit === 'string' && unit.includes(value.unit) ? value.value : undefined;

function readStyle(path: string, parts: Record<string, unknown>): TypeStyle {
  const family = Array.isArray(parts.fontFamily) ? text(parts.fontFamily[0]) : text(parts.fontFamily);
  const px = length(parts.fontSize, ['px']);
  const rem = length(parts.fontSize, ['rem']);
  const sizePx = px ?? (rem === undefined ? undefined : rem * REM_PX);
  const lineHeight = typeof parts.lineHeight === 'number' && Number.isFinite(parts.lineHeight) && parts.lineHeight > 0 ? parts.lineHeight : undefined;
  const letterSpacingEm = length(parts.letterSpacing, ['em']);
  return {
    path,
    ...(family && { family }),
    ...(sizePx !== undefined && { sizePx }),
    ...(lineHeight !== undefined && { lineHeight }),
    ...(letterSpacingEm !== undefined && { letterSpacingEm }),
  };
}

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const roles = readRoles(root);

  const colors: BrandRead['colors'] = [];
  const named: BrandRead['named'] = [];
  for (const item of Array.isArray(root.tokens) ? root.tokens : []) {
    if (!isObject(item) || item.type !== 'color' || typeof item.path !== 'string') continue;
    const value = text(item.resolvedValue) ?? text(item.value);
    if (!value) continue;
    named.push({ path: item.path, value });
    if (!item.aliasOf) colors.push({ path: item.path, value });
  }

  const typography: TypeStyle[] = [];
  for (const item of Array.isArray(root.tokens) ? root.tokens : []) {
    if (!isObject(item) || item.type !== 'typography' || typeof item.path !== 'string' || item.aliasOf || !isObject(item.resolvedValue)) continue;
    typography.push(readStyle(item.path, item.resolvedValue));
  }

  const assets = new Map<string, LogoAsset>();
  const files: LogoAsset[] = [];
  for (const raw of Array.isArray(root.assets) ? root.assets : []) {
    const base = readBaseAsset(raw);
    if (!base || !isObject(raw)) continue;
    const { id, file, format } = base;
    const size = artworkSize({ width: raw.width as number | undefined, height: raw.height as number | undefined, viewBox: text(raw.viewBox) });
    const read: LogoAsset = { id, file, format, ...(size && { size }), meta: readMeta(raw) };
    files.push(read);
    keepRepresentation(assets, read, { formats: OFFICE_FORMATS });
  }

  const title = isObject(root.brand) ? text(root.brand.title) : undefined;
  return { title: title ?? 'Brand', roles, colors, named, typography, assets, files, logo: readLogo(root) };
}
