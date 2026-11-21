import type { AssetMeta } from '../../types/index.js';
import { isObject, requireBrand } from '../shared/plugin.js';
import { keepRepresentation } from '../../core/assets/representations.js';
import { readBaseAsset, readLogo, readMeta, readRoles, text } from '../shared/brand.js';

// What the plugin reads from brand.json (the `brand` of the request): the title and description, the color and font tokens, the font
// stylesheets and the assets with their sidecars. It trusts none of it: a field of the wrong shape is a field that is not there.

export interface PressAsset {
  id: string;
  category: string;
  /** Where the file is, relative to the built site */
  file: string;
  format: string;
  meta: AssetMeta;
}

export interface ColorToken {
  path: string;
  /** What the token resolves to, as written: "#FF5A1F" */
  value: string;
  cssVariable?: string;
  description?: string;
  /** The token this one is another name for */
  aliasOf?: string;
  review?: { status: string; note?: string };
  print?: { cmyk?: number[]; pms?: string; ral?: string };
}

export interface FontToken {
  path: string;
  /** The CSS stack as written: "'Big Shoulders Display', sans-serif" */
  stack: string;
  /** The license, from the token's `dev.blazon` `font` (an SPDX id or a name) or else the license text its `$extensions` carry */
  license?: string;
  /** The `dev.blazon` `font`'s license address */
  licenseUrl?: string;
  /** Where the typeface comes from, from the token's `dev.blazon` `font`: a name or an address */
  source?: string;
}

/** The license file blazon found beside a family's font files (`theme.fontLicenses`): the project path and the text, since a plugin is never given the project folder */
export interface FontLicenseRead {
  family: string;
  licenseFile: string;
  licenseText: string;
}

export interface BrandRead {
  title: string;
  /** False when the brand has no title and `title` is the stand-in */
  named: boolean;
  description?: string;
  /** The theme roles as brand.json gives them: CSS colors and font stacks, by role name */
  roles: Record<string, string>;
  colors: ColorToken[];
  fontTokens: FontToken[];
  /** The stylesheets the brand loads its fonts from: URLs, and data: stylesheets for the font files it embeds */
  stylesheets: string[];
  /** The license files beside the font files the brand embeds, one per family */
  fontLicenses: FontLicenseRead[];
  assets: Map<string, PressAsset>;
  /** The files brand.json names as the logo for a light and for a dark surface */
  logo: { onLight?: string; onDark?: string };
}

/** The license a token's extensions state: a `license` or `licence` text in any extension's object */
function licenseOf(extensions: unknown): string | undefined {
  if (!isObject(extensions)) return undefined;
  for (const value of Object.values(extensions)) if (isObject(value)) return text(value.license) ?? text(value.licence);
  return undefined;
}

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const theme = isObject(root.theme) ? root.theme : {};
  const roles = readRoles(root);

  const colors: ColorToken[] = [];
  const fontTokens: FontToken[] = [];
  for (const item of Array.isArray(root.tokens) ? root.tokens : []) {
    if (!isObject(item) || typeof item.path !== 'string') continue;
    const blazon = isObject(item.blazon) ? item.blazon : {};
    if (item.type === 'color') {
      const value = text(item.resolvedValue) ?? text(item.value);
      if (!value) continue;
      const review = isObject(blazon.review) && typeof blazon.review.status === 'string' ? { status: blazon.review.status, note: text(blazon.review.note) } : undefined;
      colors.push({
        path: item.path,
        value,
        ...(text(item.cssVariable) && { cssVariable: item.cssVariable as string }),
        ...(text(item.description) && { description: item.description as string }),
        ...(text(item.aliasOf) && { aliasOf: item.aliasOf as string }),
        ...(review && { review }),
        ...(isObject(blazon.print) && { print: blazon.print as ColorToken['print'] }),
      });
    } else if (item.type === 'fontFamily' && !item.aliasOf) {
      const stack = Array.isArray(item.resolvedValue) ? item.resolvedValue.map(String).join(', ') : (text(item.value) ?? text(item.resolvedValue));
      const font = isObject(blazon.font) ? blazon.font : {};
      const license = text(font.license) ?? licenseOf(item.extensions);
      if (stack) {
        fontTokens.push({
          path: item.path,
          stack,
          ...(license && { license }),
          ...(text(font.licenseUrl) && { licenseUrl: font.licenseUrl as string }),
          ...(text(font.source) && { source: font.source as string }),
        });
      }
    }
  }

  const assets = new Map<string, PressAsset>();
  for (const raw of Array.isArray(root.assets) ? root.assets : []) {
    const base = readBaseAsset(raw);
    if (base && isObject(raw)) keepRepresentation(assets, { ...base, meta: readMeta(raw) });
  }

  const about = isObject(root.brand) ? root.brand : {};
  return {
    title: text(about.title) ?? 'Brand',
    named: text(about.title) !== undefined,
    description: text(about.description)?.trim(),
    roles,
    colors,
    fontTokens,
    stylesheets: (Array.isArray(theme.fonts) ? theme.fonts : []).filter((sheet): sheet is string => typeof sheet === 'string'),
    fontLicenses: (Array.isArray(theme.fontLicenses) ? theme.fontLicenses : []).flatMap((raw): FontLicenseRead[] =>
      isObject(raw) && text(raw.family) && text(raw.licenseFile) && typeof raw.licenseText === 'string' && raw.licenseText.trim() !== ''
        ? [{ family: raw.family as string, licenseFile: raw.licenseFile as string, licenseText: raw.licenseText }]
        : [],
    ),
    assets,
    logo: readLogo(root),
  };
}
