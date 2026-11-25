import fs from 'node:fs';
import path from 'node:path';
import type { Finding, BlazonConfig, FontEntry, FontLicense, LocalFont, ParsedTokens } from '../types/index.js';
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

/** The most of a license file that is read: the OFL is about 4 KiB, the Apache License 2.0 about 11 KiB */
export const LICENSE_MAX_BYTES = 64 * 1024;

/** The names of a license file, in the order one is preferred. Matched whole and without regard to case: `OFL.txt`, `LICENSE`, `LICENCE-Plex.md`, `COPYING` */
const LICENSE_NAMES = [/^ofl(\.(txt|md))?$/i, /^license(\.(txt|md))?$/i, /^licence/i, /^copying(\.(txt|md))?$/i];

/**
 * The license file in `dir` (the folder of a font file): the first of OFL, LICENSE, LICENCE and COPYING by name, and among equals the lowest
 * name in code point order. Only that folder is looked at, never a parent, and only a regular file counts.
 */
export function licenseFileIn(dir: string): string | undefined {
  return licenseFilesIn(dir)[0];
}

/** Every license file in `dir`, the one `licenseFileIn` reads first, then the ones it ignores, each group in code point order. */
export function licenseFilesIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const files = names.filter((name) => LICENSE_NAMES.some((pattern) => pattern.test(name)) && fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.isFile());
  const rank = (name: string) => LICENSE_NAMES.findIndex((pattern) => pattern.test(name));
  return files.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)).map((name) => path.join(dir, name));
}

/** A warning when the folder of a font file holds more than one license file: only the first is read. Its path is the folder. */
function ambiguousLicense(fontFile: string, cwd: string): Finding | undefined {
  const dir = path.dirname(fontFile);
  const files = licenseFilesIn(dir);
  if (files.length < 2) return undefined;
  const rel = (file: string) => path.relative(cwd, file).split(path.sep).join('/') || '.';
  return finding('font-license-duplicate', {
    path: rel(dir),
    message: `The font folder ${rel(dir)} holds ${files.length} license files (${files.map((file) => path.basename(file)).join(', ')}); ${rel(files[0]!)} is used for every family in it and the others are ignored`,
  });
}

/**
 * The text of the license file beside a font file, or why it is not read. The file must really be inside the project (a link that leaves it is
 * refused, as the font file is), at most LICENSE_MAX_BYTES, and valid UTF-8 without a NUL byte. A skipped file is a finding, never an error:
 * the license is a courtesy to the plugins, and the font still loads.
 */
function readFontLicense(family: string, fontFile: string, cwd: string): { license?: FontLicense; problem?: Finding } {
  const file = licenseFileIn(path.dirname(fontFile));
  if (!file) return {};
  const shown = path.relative(cwd, file).split(path.sep).join('/');
  const skip = (why: string) => ({
    problem: finding('font-license-invalid', { path: shown, message: `The license file ${shown} beside the font file of "${family}" ${why}, so it is not read` }),
  });
  if (!isInside(fs.realpathSync(file), cwd)) return skip('is outside the project folder, or is a link that leaves it');
  if (fs.statSync(file).size > LICENSE_MAX_BYTES) return skip(`is over ${LICENSE_MAX_BYTES / 1024} KiB`);
  const bytes = fs.readFileSync(file);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return skip('is not UTF-8 text');
  }
  if (text.includes('\0')) return skip('is not UTF-8 text');
  return { license: { family, licenseFile: shown, licenseText: text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') } };
}

export interface LoadedFonts {
  /** Stylesheet URLs for the brand book, in the order the config lists them: a local font is a `data:` stylesheet among the URLs */
  stylesheets: string[];
  /** The families the config loads, lower case: every local font's, and those a Google Fonts URL names. `fontFindings` compares against it */
  families: Set<string>;
  /** True when the config lists any font: a project that lists none has not asked for fonts to be loaded, and the next family of a stack is what it means */
  declared: boolean;
  /** True when a URL names no family blazon can read (a self-hosted stylesheet), so what it loads is not known */
  opaque: boolean;
  /** The license file beside a local font's file, once per family: the first font of a family that has one gives it */
  licenses: FontLicense[];
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
  const loaded: LoadedFonts = { stylesheets: [], families: new Set(), declared: (fonts ?? []).length > 0, opaque: false, licenses: [], problems: [] };
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
      const ambiguous = ambiguousLicense(full, cwd);
      if (ambiguous && !loaded.problems.some((p) => p.code === ambiguous.code && p.path === ambiguous.path)) loaded.problems.push(ambiguous);
      if (!loaded.licenses.some((l) => l.family.toLowerCase() === entry.family.toLowerCase())) {
        const { license, problem } = readFontLicense(entry.family, full, cwd);
        if (license) loaded.licenses.push(license);
        if (problem && !loaded.problems.some((p) => p.path === problem.path)) loaded.problems.push(problem);
      }
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
      finding('font-family-missing', {
        path: item.path,
        message: `"${family}" is not loaded by any entry of \`fonts\`, so the brand book and its PDF use the next font of the stack. Add its file as {"family": "${family}", "file": path} or its stylesheet URL, or set \`webFont\` on the token`,
      }),
    );
  }
  return found;
}
