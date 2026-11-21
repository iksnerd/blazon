import { cleanFontMeta } from '../font-roles.js';
import type { BlazonConfig, BlazonData, FontMeta, ThemeRole } from '../../types/index.js';
import { firstFamily, fontFaceRule, fontFormat, isLocalFont, loadFonts, SYSTEM_FAMILIES } from '../fonts.js';

export interface FontFileEntry {
  family: string;
  /** From the project root */
  file: string;
  weight?: number | string;
  style?: 'normal' | 'italic';
}

export interface FamilyUse {
  family: string;
  /** The tokens that name it first: a font family token, or the family of a typography token */
  tokens: string[];
  /** The whole stack of the first font family token that names it, for the fallbacks */
  stack?: string[];
  /** A family the browser has without a download (a keyword or a common system font) */
  system: boolean;
  /** Whether an entry of `fonts` loads it. Null when a stylesheet blazon cannot read is listed, so what it loads is not known */
  loaded: boolean | null;
  /** The token's own word on it: `webFont: false` or a sentence, and its `font` source and license */
  webFont?: false | string;
  font?: FontMeta;
}

export interface FontsDescription {
  /** The stylesheet addresses the brand loads, as the config lists them */
  stylesheets: string[];
  /** The font files of the project that blazon embeds */
  files: FontFileEntry[];
  /** The brand book roles that are fonts, with the token behind each */
  roles: Partial<Record<Extract<ThemeRole, 'fontDisplay' | 'fontBody'>, { token?: string; value?: string }>>;
  families: FamilyUse[];
}

/** The fonts the brand loads, from `fonts` in the config, and the families its tokens name. */
export function describeFonts(data: BlazonData, config: BlazonConfig, cwd: string): FontsDescription {
  const entries = config.fonts ?? [];
  const loaded = loadFonts(config.fonts, cwd);
  const byFamily = new Map<string, FamilyUse>();
  for (const item of data.tokens.items) {
    const resolved = item.resolvedValue;
    const stack = item.type === 'fontFamily' ? (Array.isArray(resolved) ? resolved : [resolved]).filter((v): v is string => typeof v === 'string') : undefined;
    const family =
      item.type === 'fontFamily'
        ? firstFamily(resolved)
        : item.type === 'typography' && typeof resolved === 'object' && resolved !== null
          ? firstFamily((resolved as Record<string, unknown>).fontFamily)
          : undefined;
    if (!family) continue;
    const key = family.toLowerCase();
    const known = byFamily.get(key);
    if (known) {
      known.tokens.push(item.path);
      if (!known.stack && stack) known.stack = stack;
      continue;
    }
    byFamily.set(key, {
      family,
      tokens: [item.path],
      ...(stack && { stack }),
      system: SYSTEM_FAMILIES.has(key),
      loaded: loaded.families.has(key) ? true : loaded.opaque ? null : false,
      ...(item.blazon.webFont !== undefined && { webFont: item.blazon.webFont }),
      ...(item.blazon.font && { font: cleanFontMeta(item.blazon.font) }),
    });
  }
  const role = (name: 'fontDisplay' | 'fontBody') => (data.theme[name] || data.themeTokens?.[name] ? { token: data.themeTokens?.[name], value: data.theme[name] } : undefined);
  return {
    stylesheets: entries.filter((entry): entry is string => !isLocalFont(entry)),
    files: entries
      .filter(isLocalFont)
      .map((entry) => ({ family: entry.family, file: entry.file, ...(entry.weight !== undefined && { weight: entry.weight }), ...(entry.style && { style: entry.style }) })),
    roles: { ...(role('fontDisplay') && { fontDisplay: role('fontDisplay') }), ...(role('fontBody') && { fontBody: role('fontBody') }) },
    families: [...byFamily.values()],
  };
}

/**
 * The `@font-face` rules for the font files of `description`, for a site that serves them itself. `src` is the path as the config
 * gives it, from the brand folder; with `base` it is `base` and the file's name, so a site can point it at its own public folder.
 * A stylesheet is a comment with its address: blazon does not fetch it, so it has no rule. A file that is not a font blazon embeds is a comment too.
 */
export function fontFaceCss(description: Pick<FontsDescription, 'stylesheets' | 'files'>, base?: string): string {
  const blocks = description.stylesheets.map((url) => `/* Stylesheet, not fetched by blazon: ${url.replace(/\*\//g, '*%2F')} */`);
  for (const entry of description.files) {
    const format = fontFormat(entry.file);
    if (!format) {
      blocks.push(`/* ${entry.file.replace(/\*\//g, '*%2F')}: not a font file blazon embeds, so no rule */`);
      continue;
    }
    const where = base === undefined ? entry.file : `${base.endsWith('/') ? base : `${base}/`}${entry.file.split('/').pop()}`;
    blocks.push(fontFaceRule(entry, `url("${encodeURI(where).replace(/"/g, '%22')}") format("${format}")`, true));
  }
  return blocks.length === 0 ? '/* The config lists no fonts. */\n' : `${blocks.join('\n\n')}\n`;
}
