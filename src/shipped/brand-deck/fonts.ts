import fs from 'node:fs';
import path from 'node:path';
import { has, isNumber, isObject, type Brand } from './brand.js';
import { DeckError } from './favicons.js';
import { sizePx } from './plan/index.js';

// The brand's own fonts. The deck is drawn in a browser, which can use any font file it is given, but the deck still never
// downloads one: it sets text in the TrueType and OpenType files in the folders BLAZON_DECK_FONTS names, and in the fonts the
// project's `fonts` config embeds in brand.json as data: stylesheets (theme.fonts). A font is known by the family and weight it
// says it has, not by its file name; a family with no file is set in Helvetica, and the slide says so.

const FONT_FILES = ['.ttf', '.otf', '.ttc'];
const SFNT_MAGIC = ['\x00\x01\x00\x00', 'true', 'OTTO'];
const WEIGHT_WORDS: Record<string, number> = { normal: 400, regular: 400, bold: 700, bolder: 700, lighter: 300 };

/** A family name as a key: "Space Grotesk", "space grotesk" and "SpaceGrotesk" are one family. */
export const familyKey = (name: unknown): string =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** The folders named in an environment variable, separated as a PATH is. */
export const fontFolders = (value: string | undefined): string[] => (value ?? '').split(path.delimiter).filter((folder) => folder !== '');

/** A CSS font weight as a number: 600, "600", "bold"; anything else is a regular. */
export function weightOf(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return /^\d+$/.test(text) ? Number(text) : (WEIGHT_WORDS[text] ?? 400);
}

export interface FontInfo {
  family: string;
  style: string;
  weight: number;
}

/** What the deck needs to know of a font file: its family, style and weight, or why the file cannot be used. */
export function readFont(data: Buffer): { font: FontInfo } | { why: string } {
  const notFont = { why: 'not a font file' };
  const magic = data.subarray(0, 4).toString('latin1');
  if (magic === 'ttcf') return { why: 'a font collection, which holds several fonts in one file' };
  if (data.length < 12 || !SFNT_MAGIC.includes(magic)) return notFont;
  try {
    const count = data.readUInt16BE(4);
    const tables = new Map<string, Buffer>();
    for (let index = 0; index < count; index++) {
      const at = 12 + 16 * index;
      const tag = data.subarray(at, at + 4).toString('latin1');
      const offset = data.readUInt32BE(at + 8);
      const length = data.readUInt32BE(at + 12);
      tables.set(tag, data.subarray(offset, offset + length));
    }
    const nameTable = tables.get('name');
    const os2 = tables.get('OS/2');
    if (!nameTable || !os2) return notFont;
    if (tables.has('fvar')) return { why: 'a variable font, whose axes the deck cannot set: give static files' };
    const names = new Map<number, string>();
    const records = nameTable.readUInt16BE(2);
    const strings = nameTable.readUInt16BE(4);
    for (let index = 0; index < records; index++) {
      const at = 6 + 12 * index;
      const platform = nameTable.readUInt16BE(at);
      const nameId = nameTable.readUInt16BE(at + 6);
      const length = nameTable.readUInt16BE(at + 8);
      const offset = nameTable.readUInt16BE(at + 10);
      const raw = nameTable.subarray(strings + offset, strings + offset + length);
      const text = platform === 0 || platform === 3 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
      if (!names.has(nameId) || platform === 3) names.set(nameId, text);
    }
    const weight = os2.readUInt16BE(4);
    const fsType = os2.readUInt16BE(8);
    const fsSelection = os2.readUInt16BE(62);
    const family = (names.get(16) || names.get(1) || '').trim();
    const style = names.get(17) || names.get(2) || 'Regular';
    if (!family) return notFont;
    if (fsType & 0x0002) return { why: 'its license forbids embedding' };
    if (fsType & 0x0100) return { why: 'its license forbids subsetting, which embedding needs' };
    if (fsSelection & 0x0001 || /italic|oblique/i.test(style)) return { why: 'an italic face: the deck sets upright text' };
    return { font: { family, style, weight: weight || WEIGHT_WORDS[style.toLowerCase()] || 400 } };
  } catch {
    return notFont;
  }
}

interface Entry {
  family: string;
  /** Where it came from, for a message */
  label: string;
  mime: string;
  bytes: () => Buffer;
}

/** A face the deck sets text in: the CSS family to name, and the weight to ask for. */
export interface Face {
  css: string;
  weight: number;
  id: string;
}

/**
 * The brand's own fonts, found in folders and in the config by what each font says it is (its family and weight), not by its file
 * name. Files that cannot be used are listed with the reason, and the deck sets that text in Helvetica.
 */
export class FontTable {
  private names = new Map<string, string>();
  private entries = new Map<string, Map<number, Entry>>();
  private used = new Map<string, Face & { entry: Entry }>();
  skipped: [string, string][] = [];

  static scan(folders: string[]): FontTable {
    const table = new FontTable();
    const files: string[] = [];
    for (const folder of folders) {
      if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw new DeckError(`font folder ${folder} does not exist`);
      const walk = (dir: string): void => {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) walk(full);
          else if (item.isFile() && FONT_FILES.includes(path.extname(item.name).toLowerCase())) files.push(full);
        }
      };
      walk(folder);
    }
    for (const file of files.sort()) {
      let data: Buffer;
      try {
        data = fs.readFileSync(file);
      } catch (error) {
        table.skipped.push([file, (error as Error).message]);
        continue;
      }
      table.add(readFont(data), file, path.extname(file).toLowerCase() === '.otf' ? 'font/otf' : 'font/ttf', () => data);
    }
    return table;
  }

  private add(read: { font: FontInfo } | { why: string }, label: string, mime: string, bytes: () => Buffer): void {
    if ('why' in read) {
      this.skipped.push([label, read.why]);
      return;
    }
    const { font } = read;
    const key = familyKey(font.family);
    const known = this.entries.get(key) ?? new Map<number, Entry>();
    this.entries.set(key, known);
    const same = known.get(font.weight);
    if (same) {
      this.skipped.push([label, `a duplicate of ${same.label}`]);
      return;
    }
    known.set(font.weight, { family: font.family, label, mime, bytes });
    if (!this.names.has(key)) this.names.set(key, font.family);
  }

  /**
   * The fonts a project's `fonts` config embeds in brand.json: `data:text/css;base64,` stylesheets with one @font-face each. A TrueType or
   * OpenType font is known by what the file says, as a font in a folder is; a .woff or .woff2 cannot be read here, so it is known by
   * the family and weight the config declared. A stylesheet that is a web address is never fetched.
   */
  addSheets(sheets: unknown[]): void {
    for (const sheet of sheets) {
      if (typeof sheet !== 'string' || !sheet.startsWith('data:text/css;base64,')) continue;
      const css = Buffer.from(sheet.slice('data:text/css;base64,'.length), 'base64').toString('utf-8');
      for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const rule = block[1]!;
        const family = /font-family:\s*"([^"]*)"/.exec(rule)?.[1];
        const source = /url\(data:font\/([a-z0-9]+);base64,([A-Za-z0-9+/=]*)\)/.exec(rule);
        if (!family || !source) continue;
        const [, kind, base64] = source;
        const data = Buffer.from(base64!, 'base64');
        const label = `${family} from the config`;
        if (kind === 'ttf' || kind === 'otf') {
          this.add(readFont(data), label, `font/${kind}`, () => data);
        } else if (kind === 'woff' || kind === 'woff2') {
          const declared = /font-weight:\s*([^;]+)/.exec(rule)?.[1];
          const italic = /font-style:\s*(italic|oblique)/.test(rule);
          this.add(
            italic ? { why: 'an italic face: the deck sets upright text' } : { font: { family, style: 'Regular', weight: weightOf(declared?.trim().split(/\s+/)[0]) } },
            label,
            `font/${kind}`,
            () => data,
          );
        } else {
          this.skipped.push([label, `a .${kind} file, which the deck cannot use: give a .ttf, .otf, .woff or .woff2 file`]);
        }
      }
    }
  }

  families(): string[] {
    return [...this.names.values()];
  }

  has(family: string): boolean {
    return this.entries.has(familyKey(family));
  }

  weights(family: string): number[] {
    return [...(this.entries.get(familyKey(family))?.keys() ?? [])].sort((a, b) => a - b);
  }

  /** The weight of this family that is nearest `weight`; a tie goes to the heavier. undefined if the family has no file. */
  nearest(family: string, weight: unknown): number | undefined {
    const available = this.weights(family);
    const wanted = weightOf(weight);
    let best: number | undefined;
    for (const have of available) {
      if (best === undefined || Math.abs(have - wanted) < Math.abs(best - wanted) || (Math.abs(have - wanted) === Math.abs(best - wanted) && have > best)) best = have;
    }
    return best;
  }

  /** The face to set text in: this family at the nearest weight, or undefined. */
  face(family: string, weight: unknown): Face | undefined {
    const have = this.nearest(family, weight);
    if (have === undefined) return undefined;
    const id = `${familyKey(family)}-${have}`;
    if (!this.used.has(id)) this.used.set(id, { css: `brand-${id}`, weight: have, id, entry: this.entries.get(familyKey(family))!.get(have)! });
    const { css, weight: w } = this.used.get(id)!;
    return { css, weight: w, id };
  }

  /** The @font-face rules of the faces the deck used, naming each by `url(<base>/<id>)` */
  rules(base: string): string {
    return [...this.used.values()].map((face) => `@font-face{font-family:"${face.css}";font-weight:${face.weight};src:url(${base}/${face.id})}`).join('\n');
  }

  /** The bytes and media type of a face the deck used */
  file(id: string): { mime: string; bytes: Buffer } | undefined {
    const face = this.used.get(id);
    return face && { mime: face.entry.mime, bytes: face.entry.bytes() };
  }

  /** The footnote that says which of the brand's families are set in their own fonts and which are not. */
  note(families: string[]): string {
    if (this.entries.size === 0) return 'Shown in Helvetica: the typeface itself is not embedded in this file.';
    const once = new Map<string, string>();
    for (const family of families) if (!once.has(familyKey(family))) once.set(familyKey(family), family);
    const named = [...once.values()];
    const embedded = named.filter((family) => this.has(family));
    const fallback = named.filter((family) => !this.has(family));
    const parts: string[] = [];
    if (embedded.length > 0) parts.push(`Set in ${embedded.join(', ')}, embedded from the font files given.`);
    if (fallback.length > 0) parts.push(`${fallback.join(', ')}: no font file given, shown in Helvetica.`);
    return parts.join(' ');
  }
}

export interface BrandFaces {
  display: [string, number] | null;
  body: [string, number] | null;
}

/**
 * The two families a deck sets its own text in: the display family, of the largest text style, and the body family, of the
 * style nearest 16 pixels, each with its weight. A style with no family is not considered.
 */
export function brandFaces(brand: Brand): BrandFaces {
  const styles: { family: string; weight: number; px: number }[] = [];
  for (const token of brand.tokens) {
    const parts = token.resolvedValue;
    if (token.type !== 'typography' || has(token.aliasOf) || !isObject(parts)) continue;
    const raw = parts.fontFamily;
    const family = Array.isArray(raw) && raw.length > 0 ? raw[0] : typeof raw === 'string' && raw !== '' ? raw : undefined;
    const px = sizePx(parts.fontSize);
    if (typeof family === 'string' && family !== '' && px !== undefined && isNumber(px)) styles.push({ family, weight: weightOf(parts.fontWeight), px });
  }
  if (styles.length === 0) return { display: null, body: null };
  let display = styles[0]!;
  for (const style of styles) if (style.px > display.px) display = style;
  let body = styles[0]!;
  for (const style of styles) if (Math.abs(style.px - 16) < Math.abs(body.px - 16)) body = style;
  return { display: [display.family, display.weight], body: [body.family, body.weight] };
}
