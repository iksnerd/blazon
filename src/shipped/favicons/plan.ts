import fs from 'node:fs';
import path from 'node:path';
import Color from 'colorjs.io';
import { Cannot, isObject, OptionError, type Request } from './request.js';
import { readSymbol, type Glyph } from './symbol.js';

// What the options and the brand say, settled once: which drawing is the symbol, the colors, how large the symbol sits,
// and which files the project supplies. Nothing here touches the browser.

const KEYS = ['symbol', 'ground', 'ink', 'favicon', 'tabs', 'share', 'supplied', 'base', 'name', 'themeColor'];
/** Chrome's own tab colors, light and dark, unless the options give the brand's. */
const TABS = { light: '#FFFFFF', dark: '#202124' };
const SHARE = { app: 0.52, favicon: 0.88 };

/** The files a project may supply, by the id they have in the `supplied` category, and what each must be. */
export const SUPPLIED: Record<string, { file: string; format: 'svg' | 'png'; size?: number }> = {
  favicon: { file: 'favicon.svg', format: 'svg' },
  'apple-touch-icon': { file: 'apple-touch-icon.png', format: 'png', size: 180 },
  'icon-192': { file: 'icon-192.png', format: 'png', size: 192 },
  'icon-512': { file: 'icon-512.png', format: 'png', size: 512 },
  'app-icon-1024': { file: 'app-icon-1024.png', format: 'png', size: 1024 },
};

export interface Plan {
  name: string;
  base: string;
  symbolId: string;
  /** The symbol's size in its own file, as the brand states it: enough for a check, which has no files */
  symbolSize: { width: number; height: number };
  /** The symbol's drawing: read for a build only */
  glyph?: Glyph;
  /** The symbol's sidecar `minSize`, in pixels, as far as it is written as numbers */
  minSize: { width?: number; height?: number };
  ground: string;
  ink: string;
  favicon: string;
  tabs: { light: string; dark: string };
  themeColor: string;
  share: { app: number; favicon: number };
  /** Supplied files by output name: the file's bytes */
  supplied: Map<string, Buffer>;
}

const asString = (value: unknown, what: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new OptionError(`${what} must be a non-empty string`);
  return value.trim();
};

/** A color as #RRGGBB: a token of the brand (`brand.primary` or `{brand.primary}`), or a CSS color. Not see-through. */
export function colorOf(spec: string, brand: Record<string, unknown>, what: string): string {
  const tokenPath = spec.replace(/^\{(.*)\}$/, '$1');
  const tokens = Array.isArray(brand.tokens) ? brand.tokens.filter(isObject) : [];
  const token = tokens.find((item) => item.path === tokenPath && item.type === 'color');
  // `value` is the CSS-ready text; `resolvedValue` is the DTCG structure, which is an object for a color object
  const text = token ? ([token.value, token.resolvedValue].find((candidate): candidate is string => typeof candidate === 'string') ?? '') : spec;
  let color: Color;
  try {
    color = new Color(text);
  } catch {
    throw new OptionError(`${what} is ${JSON.stringify(spec)}, which is neither a color token of the brand nor a CSS color`);
  }
  if ((color.alpha ?? 1) < 1) throw new OptionError(`${what} is see-through; an icon ground and a symbol color must be solid`);
  const [r, g, b] = color.to('srgb').coords.map((channel) => Math.round(Math.min(1, Math.max(0, channel ?? 0)) * 255));
  return `#${[r, g, b].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** The contrast ratio of two #RRGGBB colors (WCAG 2.1). */
export const contrast = (a: string, b: string): number => Color.contrast(new Color(a), new Color(b), 'WCAG21');

const share = (value: unknown, what: string, fallback: number): number => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !(value > 0 && value <= 1)) throw new OptionError(`${what} must be a number above 0 and up to 1`);
  return value;
};

/** The bytes of an asset's file, read from the built site: the file must be inside it, whatever links it holds. */
function readAsset(root: string, file: string, what: string): Buffer {
  const base = fs.realpathSync(root);
  const real = fs.existsSync(path.join(base, file)) ? fs.realpathSync(path.join(base, file)) : '';
  if (!real.startsWith(base + path.sep) || !fs.statSync(real).isFile()) throw new Cannot(`${what} is not a file in the built site (${file})`);
  return fs.readFileSync(real);
}

/** A dimension of a sidecar in pixels: `{ value, unit }` with px or rem. An alias or anything else is not read. */
const pixels = (dimension: unknown): number | undefined => {
  if (!isObject(dimension) || typeof dimension.value !== 'number') return undefined;
  return dimension.unit === 'px' ? dimension.value : dimension.unit === 'rem' ? dimension.value * 16 : undefined;
};

/** The settled plan for a request. A check has no site folder, so it plans from the brand alone. */
export function planFor(request: Request): Plan {
  const { options, brand } = request;
  for (const key of Object.keys(options)) if (!KEYS.includes(key)) throw new OptionError(`unknown option ${JSON.stringify(key)}; known: ${KEYS.join(', ')}`);

  const assets = Array.isArray(brand.assets) ? brand.assets.filter(isObject) : [];
  const named = asString(options.symbol, 'symbol');
  const marks = assets.filter((asset) => isObject(asset.meta) && asset.meta.lockup === 'mark' && asset.format === 'svg');
  const symbol = named ? assets.find((asset) => asset.id === named) : marks.length === 1 ? marks[0] : undefined;
  if (!symbol) {
    if (named) throw new OptionError(`symbol names the asset ${named}, and the brand has none with that id`);
    throw new Cannot(
      `no symbol to draw from: name an SVG asset in the option symbol (such as "logos/mark"), or give exactly one SVG asset the sidecar lockup "mark" (${marks.length} have it)`,
    );
  }
  const symbolId = String(symbol.id);
  if (symbol.format !== 'svg') throw new Cannot(`the symbol ${symbolId} is a ${String(symbol.format)} file; the plugin draws from an SVG`);
  const symbolSize = { width: Number(symbol.width), height: Number(symbol.height) };
  const glyph =
    request.type === 'build' ? readSymbol(readAsset(request.siteDir, String(symbol.file), `the symbol ${symbolId}`).toString('utf-8'), `the symbol ${symbolId}`) : undefined;

  // brand.json holds the theme's colors under theme.roles
  const theme = isObject(brand.theme) ? brand.theme : {};
  const roles = isObject(theme.roles) ? theme.roles : {};
  const groundSpec = asString(options.ground, 'ground') ?? (typeof roles.accent === 'string' ? roles.accent : undefined);
  if (!groundSpec) throw new OptionError('no ground color: set the option ground to a color token or a CSS color, or give the theme an accent');
  const ground = colorOf(groundSpec, brand, 'ground');
  const ink = colorOf(asString(options.ink, 'ink') ?? '#FFFFFF', brand, 'ink');
  const favicon = colorOf(asString(options.favicon, 'favicon') ?? ground, brand, 'favicon');
  const tabsOption = options.tabs ?? {};
  if (!isObject(tabsOption) || Object.keys(tabsOption).some((key) => key !== 'light' && key !== 'dark')) throw new OptionError('tabs must be an object with light and dark colors');
  const tabs = {
    light: colorOf(asString(tabsOption.light, 'tabs.light') ?? TABS.light, brand, 'tabs.light'),
    dark: colorOf(asString(tabsOption.dark, 'tabs.dark') ?? TABS.dark, brand, 'tabs.dark'),
  };
  const themeColor = colorOf(asString(options.themeColor, 'themeColor') ?? ground, brand, 'themeColor');
  const shareOption = options.share ?? {};
  if (!isObject(shareOption) || Object.keys(shareOption).some((key) => key !== 'app' && key !== 'favicon')) throw new OptionError('share must be an object with app and favicon');
  const shares = { app: share(shareOption.app, 'share.app', SHARE.app), favicon: share(shareOption.favicon, 'share.favicon', SHARE.favicon) };

  const base = asString(options.base, 'base') ?? '/';
  if (!/^\/([A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*$/.test(base)) throw new OptionError('base must be a path that starts and ends with a slash, such as "/" or "/brand/"');
  const title = isObject(brand.brand) && typeof brand.brand.title === 'string' ? brand.brand.title : '';
  const name = asString(options.name, 'name') ?? (title || 'Brand');

  const stated = isObject(symbol.meta) && isObject(symbol.meta.minSize) ? symbol.meta.minSize : {};
  const width = pixels(stated.width);
  const height = pixels(stated.height);

  const supplied = new Map<string, Buffer>();
  const category = asString(options.supplied, 'supplied');
  if (category && request.type === 'build') {
    for (const [stem, want] of Object.entries(SUPPLIED)) {
      const asset = assets.find((item) => item.id === `${category}/${stem}`);
      if (!asset) continue;
      const id = String(asset.id);
      if (asset.format !== want.format) throw new Cannot(`the supplied ${id} is a ${String(asset.format)} file; ${want.file} must be a ${want.format.toUpperCase()}`);
      if (want.size && (asset.width !== want.size || asset.height !== want.size))
        throw new Cannot(`the supplied ${id} is ${String(asset.width)} x ${String(asset.height)} px; ${want.file} must be ${want.size} x ${want.size}`);
      supplied.set(want.file, readAsset(request.siteDir, String(asset.file), `the supplied ${id}`));
    }
  }
  return {
    name,
    base,
    symbolId,
    symbolSize,
    glyph,
    minSize: { ...(width && { width }), ...(height && { height }) },
    ground,
    ink,
    favicon,
    tabs,
    themeColor,
    share: shares,
    supplied,
  };
}
