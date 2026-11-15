import fs from 'node:fs';
import path from 'node:path';
import type { Finding, BlazonConfig, FontEntry, LocalFont, ParsedTokens } from '../types/index.js';
import { finding } from './checker/catalogue.js';

/** The font files blazon embeds, by extension: the media type of the data URL and the format the @font-face names. */
const FONT_FILES: Record<string, { type: string; format: string }> = {
  '.woff2': { type: 'font/woff2', format: 'woff2' },
  '.woff': { type: 'font/woff', format: 'woff' },
  '.ttf': { type: 'font/ttf', format: 'truetype' },
  '.otf': { type: 'font/otf', format: 'opentype' },
};
export const FONT_EXTENSIONS = Object.keys(FONT_FILES);

/** The CSS format name of a font file, from its extension. Undefined for a file blazon does not embed. */
export const fontFormat = (file: string): string | undefined => FONT_FILES[path.extname(file).toLowerCase()]?.format;

export const isLocalFont = (entry: FontEntry): entry is LocalFont => typeof entry === 'object';

/**
 * A family that can be written as CSS text: a quote, a backslash or a line break would end the string it sits in.
 * A family is a name, so this refuses nothing real.
 */
export const isFamilyName = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !/["\\\r\n]/.test(value);

export interface LoadedFonts {
  /** Stylesheet URLs for the brand book, in the order the config lists them: a local font is a `data:` stylesheet among the URLs */
  stylesheets: string[];
  /** The families the config loads, lower case: every local font's, and those a Google Fonts URL names. `fontFindings` compares against it */
  families: Set<string>;
  /** True when the config lists any font: a project that lists none has not asked for fonts to be loaded, and the next family of a stack is what it means */
  declared: boolean;
  /** True when a URL names no family blazon can read (a self-hosted stylesheet), so what it loads is not known */
  opaque: boolean;
  problems: Finding[];
}

/** The families a Google Fonts stylesheet URL asks for: `?family=Inter:wght@400;600&family=Mulish` is Inter and Mulish. */
function googleFamilies(url: string): string[] | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'fonts.googleapis.com') return undefined;
    return parsed.searchParams.getAll('family').map((family) => family.split(':')[0]!.replace(/\+/g, ' ').trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * The `@font-face` rule of a font file entry, with `src` as the CSS `src` value (a `url(...)` and its format). The one place the rule is
 * written: the embedded form (compact, a `data:` URL) and the one `blazon fonts --css` prints (one declaration a line, `font-display: swap`).
 */
export function fontFaceRule(entry: LocalFont, src: string, pretty = false): string {
  const declarations = [
    `font-family:"${entry.family}"`,
    `src:${src}`,
    ...(entry.weight !== undefined ? [`font-weight:${entry.weight}`] : []),
    ...(entry.style ? [`font-style:${entry.style}`] : []),
    ...(pretty ? ['font-display:swap'] : []),
  ];
  return pretty ? `@font-face {\n${declarations.map((d) => `  ${d.replace(':', ': ')};`).join('\n')}\n}` : `@font-face{${declarations.join(';')}}`;
}

/** True when `file` (already resolved through links) is within the project folder `cwd`, which is also resolved. */
function isInside(file: string, cwd: string): boolean {
  const root = fs.realpathSync(cwd);
  return file === root || file.startsWith(root + path.sep);
}

/**
 * Turns the config's `fonts` into what the brand book loads. A URL passes through. A local font file is read and written as a
 * `data:` stylesheet with one `@font-face`, so the book, its print version and a build need no file served beside them.
 * A file that is missing or is not a font blazon can embed is an error, and is left out.
 */
export function loadFonts(fonts: BlazonConfig['fonts'], cwd: string): LoadedFonts {
  const loaded: LoadedFonts = { stylesheets: [], families: new Set(), declared: (fonts ?? []).length > 0, opaque: false, problems: [] };
  for (const entry of fonts ?? []) {
    if (!isLocalFont(entry)) {
      loaded.stylesheets.push(entry);
      const named = googleFamilies(entry);
      if (named) named.forEach((family) => loaded.families.add(family));
      else loaded.opaque = true;
      continue;
    }
    const kind = FONT_FILES[path.extname(entry.file).toLowerCase()];
    const full = path.resolve(cwd, entry.file);
    const invalid = (why: string) => loaded.problems.push(finding('font-file-invalid', { path: entry.file, message: `Font ${entry.file} for "${entry.family}" ${why}` }));
    if (!kind) invalid(`is not a font blazon embeds: give ${FONT_EXTENSIONS.join(', ')}`);
    else if (!fs.existsSync(full) || !fs.statSync(full).isFile()) invalid('is not a file in the project');
    else if (!isInside(fs.realpathSync(full), cwd)) invalid('is outside the project folder: keep font files inside it');
    else {
      const src = `url(data:${kind.type};base64,${fs.readFileSync(full).toString('base64')}) format("${kind.format}")`;
      loaded.stylesheets.push(`data:text/css;base64,${Buffer.from(fontFaceRule(entry, src)).toString('base64')}`);
      loaded.families.add(entry.family.toLowerCase());
    }
  }
  return loaded;
}

/** Names a browser has without a download, or that a keyword stands for. A token naming one needs no `fonts` entry. */
export const SYSTEM_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'helvetica',
  'helvetica neue',
  'arial',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'georgia',
  'times',
  'times new roman',
  'courier',
  'courier new',
  'menlo',
  'monaco',
  'consolas',
  'sfmono-regular',
  'liberation mono',
  'sf pro',
  'sf pro text',
  'sf pro display',
]);

export const firstFamily = (value: unknown): string | undefined => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() !== '' ? first.trim().replace(/^["']|["']$/g, '') : undefined;
};

/**
 * A family a token names first that nothing loads, in a project that lists fonts: no entry of `fonts` is for it. The book, and a PDF made from it, then set
 * the text in the next family of the stack with no sign of it, and a declared `@font-face` of that name that does not load
 * would shadow an installed copy the same way. A token that has said what it does about the web (`webFont`) is left alone, and
 * so is every family when a stylesheet blazon cannot read is listed, because that one may load it.
 */
export function fontFindings(tokens: ParsedTokens, loaded: LoadedFonts): Finding[] {
  if (!loaded.declared || loaded.opaque) return [];
  const seen = new Set<string>();
  const found: Finding[] = [];
  for (const item of tokens.items) {
    if (item.aliasOf || item.blazon.webFont !== undefined) continue;
    const resolved = item.resolvedValue;
    const family =
      item.type === 'fontFamily'
        ? firstFamily(resolved)
        : item.type === 'typography' && typeof resolved === 'object' && resolved !== null
          ? firstFamily((resolved as Record<string, unknown>).fontFamily)
          : undefined;
    const key = family?.toLowerCase();
    if (!family || !key || SYSTEM_FAMILIES.has(key) || loaded.families.has(key) || seen.has(key)) continue;
    seen.add(key);
    found.push(
      finding('font-not-loaded', {
        path: item.path,
        message: `"${family}" is not loaded by any entry of \`fonts\`, so the brand book and its PDF use the next font of the stack. Add its file as {"family": "${family}", "file": path} or its stylesheet URL, or set \`webFont\` on the token`,
      }),
    );
  }
  return found;
}
