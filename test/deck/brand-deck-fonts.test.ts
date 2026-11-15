import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { readBrand } from '../../src/shipped/brand-deck/brand.js';
import { DeckError } from '../../src/shipped/brand-deck/favicons.js';
import { brandFaces, FontTable, fontFolders } from '../../src/shipped/brand-deck/fonts.js';

// The brand fonts of src/shipped/brand-deck/fonts.ts: finding them in folders and in the config, matching a family and a weight, and the
// faces a brand uses. These are the cases of test_brand_deck_fonts.py, which tested the Python deck before it was ported. The fonts are
// built here, byte by byte, as the smallest sfnt that has the tables the reader looks at: no glyphs, because nothing here draws.
// (The Python tests used the Bitstream Vera files that ship inside reportlab, which a TypeScript test cannot depend on.)

interface SfntOptions {
  style?: string;
  weight?: number;
  kind?: string;
  tables?: string[];
  fsType?: number;
  fsSelection?: number;
  legacy?: [string, string];
}

/** The smallest font file the reader accepts: a table directory with a name table and an OS/2 table. `legacy` is the (family, style) of the old name IDs 1 and 2 when they differ from the typographic ones (IDs 16 and 17). */
function sfnt(family: string, { style = 'Regular', weight = 400, kind = '\x00\x01\x00\x00', tables = [], fsType = 0, fsSelection = 0x40, legacy }: SfntOptions = {}): Buffer {
  const utf16 = (text: string) => Buffer.from(text, 'utf16le').swap16();
  const [oldFamily, oldStyle] = legacy ?? [family, style];
  const records: [number, Buffer][] = [
    [1, utf16(oldFamily)],
    [2, utf16(oldStyle)],
    [16, utf16(family)],
    [17, utf16(style)],
  ];
  const header = Buffer.alloc(6 + 12 * records.length);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(6 + 12 * records.length, 4);
  let offset = 0;
  records.forEach(([id, text], index) => {
    const at = 6 + 12 * index;
    [3, 1, 0x409, id, text.length, offset].forEach((value, field) => header.writeUInt16BE(value, at + 2 * field));
    offset += text.length;
  });
  const nameTable = Buffer.concat([header, ...records.map(([, text]) => text)]);
  const os2 = Buffer.alloc(78);
  os2.writeUInt16BE(weight, 4);
  os2.writeUInt16BE(fsType, 8);
  os2.writeUInt16BE(fsSelection, 62);
  const present = new Map<string, Buffer>([['name', nameTable], ['OS/2', os2], ...tables.map((tag): [string, Buffer] => [tag, Buffer.alloc(16)])]);
  const directory = Buffer.alloc(12);
  directory.write(kind, 0, 'latin1');
  directory.writeUInt16BE(present.size, 4);
  let position = 12 + 16 * present.size;
  const entries: Buffer[] = [];
  const blocks: Buffer[] = [];
  for (const [tag, data] of [...present].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const entry = Buffer.alloc(16);
    entry.write(tag, 0, 'latin1');
    entry.writeUInt32BE(position, 8);
    entry.writeUInt32BE(data.length, 12);
    entries.push(entry);
    const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    blocks.push(padded);
    position += padded.length;
  }
  return Buffer.concat([directory, ...entries, ...blocks]);
}

const ROMAN = sfnt('Bitstream Vera Sans', { style: 'Roman', weight: 400 });
const BOLD = sfnt('Bitstream Vera Sans', { style: 'Bold', weight: 700 });

class Folder {
  path = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-fonts-'));
  put(name: string, data: Buffer | string): string {
    const target = path.join(this.path, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    return target;
  }
}

describe('scanning a folder', () => {
  const setup = () => {
    const folder = new Folder();
    return { folder, scan: () => FontTable.scan([folder.path]), reasons: (table: FontTable) => Object.fromEntries(table.skipped.map(([file, why]) => [path.basename(file), why])) };
  };

  it('a font is known by the family and weight it says it has, not by its file name', () => {
    const { folder, scan } = setup();
    folder.put('one.ttf', ROMAN);
    folder.put('two-heavy.ttf', BOLD);
    const table = scan();
    expect(table.families()).toEqual(['Bitstream Vera Sans']);
    expect(table.weights('Bitstream Vera Sans')).toEqual([400, 700]);
    expect(table.skipped).toEqual([]);
  });

  it('a family is matched whatever its case and spacing', () => {
    const { folder, scan } = setup();
    folder.put('a.ttf', ROMAN);
    const table = scan();
    for (const name of ['Bitstream Vera Sans', 'bitstream vera sans', 'BitstreamVeraSans', ' Bitstream  Vera Sans ']) expect(table.has(name), name).toBe(true);
    expect(table.has('Bitstream Vera Serif')).toBe(false);
  });

  it('the nearest weight is used and a tie goes to the heavier', () => {
    const { folder, scan } = setup();
    folder.put('a.ttf', ROMAN);
    folder.put('b.ttf', BOLD);
    const table = scan();
    const weights = Object.fromEntries([100, 400, 500, 549, 550, 600, 700, 900].map((w) => [w, table.nearest('Bitstream Vera Sans', w)]));
    expect(weights).toEqual({ 100: 400, 400: 400, 500: 400, 549: 400, 550: 700, 600: 700, 700: 700, 900: 700 });
    expect(table.nearest('Nobody', 400)).toBeUndefined();
  });

  it('a weight that is not a number is a regular', () => {
    const { folder, scan } = setup();
    folder.put('a.ttf', ROMAN);
    folder.put('b.ttf', BOLD);
    const table = scan();
    expect(table.nearest('Bitstream Vera Sans', 'bold')).toBe(700);
    expect(table.nearest('Bitstream Vera Sans', 'normal')).toBe(400);
    expect(table.nearest('Bitstream Vera Sans', null)).toBe(400);
  });

  it('folders below are scanned and files that are not fonts are left alone', () => {
    const { folder, scan } = setup();
    folder.put('deep/er/Vera.ttf', ROMAN);
    folder.put('README.txt', 'fonts');
    folder.put('notes.md', '# fonts');
    const table = scan();
    expect(table.families()).toEqual(['Bitstream Vera Sans']);
    expect(table.skipped).toEqual([]);
  });

  it('a font that is variable is skipped and says why', () => {
    const { folder, scan, reasons } = setup();
    folder.put('Inter[wght].ttf', sfnt('Inter', { tables: ['fvar'] }));
    const table = scan();
    expect(table.families()).toEqual([]);
    expect(reasons(table)['Inter[wght].ttf']).toContain('variable');
  });

  // The Python deck refused OpenType with CFF outlines, which its PDF library cannot embed. A browser prints them, so the port uses them.
  it('an opentype font with cff outlines is used, as a browser prints it', () => {
    const { folder, scan } = setup();
    folder.put('Inter.otf', sfnt('Inter', { kind: 'OTTO', tables: ['CFF '] }));
    const table = scan();
    expect(table.skipped).toEqual([]);
    expect(table.families()).toEqual(['Inter']);
  });

  it('a font whose license forbids embedding is skipped and says why', () => {
    const { folder, scan, reasons } = setup();
    folder.put('a.ttf', sfnt('Locked', { fsType: 0x0002 }));
    folder.put('b.ttf', sfnt('NoSubset', { fsType: 0x0100 }));
    const found = reasons(scan());
    expect(found['a.ttf']).toContain('embedding');
    expect(found['b.ttf']).toContain('subset');
  });

  it('a font that allows embedding in any way that is not restricted is kept', () => {
    const { folder, scan } = setup();
    [0x0000, 0x0004, 0x0008].forEach((fsType, index) => folder.put(`f${index}.ttf`, sfnt(`Family${index}`, { fsType })));
    expect(scan().families().sort()).toEqual(['Family0', 'Family1', 'Family2']);
  });

  it('a font is known by its typographic family and not by the one the old name ids give', () => {
    const { folder, scan } = setup();
    folder.put('m.ttf', sfnt('Space Grotesk', { style: 'Medium', weight: 500, legacy: ['Space Grotesk Medium', 'Regular'] }));
    const table = scan();
    expect(table.families()).toEqual(['Space Grotesk']);
    expect(table.weights('Space Grotesk')).toEqual([500]);
  });

  it('an italic is found by the flag alone and by the style name alone', () => {
    const { folder, scan, reasons } = setup();
    folder.put('flag.ttf', sfnt('A', { fsSelection: 0x41 }));
    folder.put('name.ttf', sfnt('B', { style: 'Oblique', fsSelection: 0x40 }));
    folder.put('upright.ttf', sfnt('C', { fsSelection: 0x40 }));
    const table = scan();
    expect(Object.keys(reasons(table)).sort()).toEqual(['flag.ttf', 'name.ttf']);
    expect(table.families()).toEqual(['C']);
  });

  it('an italic face is skipped because the deck sets upright text', () => {
    const { folder, scan, reasons } = setup();
    folder.put('a.ttf', sfnt('Bitstream Vera Sans', { style: 'Oblique', fsSelection: 0x41 }));
    expect(reasons(scan())['a.ttf']).toContain('italic');
  });

  it('a file that is not a font is skipped and says so', () => {
    const { folder, scan, reasons } = setup();
    folder.put('broken.ttf', 'this is not a font at all');
    folder.put('short.ttf', Buffer.from([0, 1]));
    const found = reasons(scan());
    expect(found['broken.ttf']).toContain('not a font');
    expect(found['short.ttf']).toContain('not a font');
  });

  it('two files for one family and weight keep the first by path and skip the other', () => {
    const { folder, scan } = setup();
    folder.put('b/Vera.ttf', ROMAN);
    folder.put('a/Vera.ttf', ROMAN);
    const table = scan();
    expect(table.skipped.map(([file]) => path.basename(path.dirname(file)))).toEqual(['b']);
    expect(table.skipped[0]![1]).toContain('duplicate');
  });

  it('a missing folder is an error the user can read', () => {
    const { folder } = setup();
    expect(() => FontTable.scan([path.join(folder.path, 'nowhere')])).toThrow(DeckError);
    expect(() => FontTable.scan([path.join(folder.path, 'nowhere')])).toThrow('nowhere');
  });

  it('no folder is an empty table that knows no family', () => {
    const table = FontTable.scan([]);
    expect([table.families(), table.skipped]).toEqual([[], []]);
    expect(table.has('Anything')).toBe(false);
  });

  it('the folders of the environment variable are split on the path separator', () => {
    const d = path.delimiter;
    expect(fontFolders(`a${d}b${d}${d}c`)).toEqual(['a', 'b', 'c']);
    expect(fontFolders('')).toEqual([]);
    expect(fontFolders(undefined)).toEqual([]);
  });
});

const styleToken = (p: string, size: number, family: string | null, weight = 400) => ({
  path: p,
  type: 'typography',
  value: 'x',
  rawValue: 'x',
  resolvedValue: { fontFamily: family ? [family] : null, fontSize: { value: size, unit: 'px' }, fontWeight: weight, lineHeight: 1.2 },
});
const brandWith = (...tokens: object[]) =>
  readBrand({
    format: 'blazon-brand',
    version: 1,
    brand: { title: 'T' },
    tokens,
    groups: [],
    assets: [],
    pages: [],
    categories: [],
    theme: { roles: {}, tokens: {}, fonts: [] },
    logo: {},
  });

describe('faces', () => {
  it('the display family is the one of the largest style and the body one the style nearest sixteen pixels', () => {
    const tokens = [
      styleToken('type.display', 72, 'Space Grotesk', 600),
      styleToken('type.h1', 48, 'Inter', 600),
      styleToken('type.base', 16, 'Inter', 400),
      styleToken('type.small', 12, 'Inter', 400),
    ];
    expect(brandFaces(brandWith(...tokens))).toEqual({ display: ['Space Grotesk', 600], body: ['Inter', 400] });
  });

  it('a brand with no type style has no faces', () => {
    expect(brandFaces(brandWith())).toEqual({ display: null, body: null });
  });

  it('a style with no family is not a face', () => {
    expect(brandFaces(brandWith(styleToken('type.display', 72, null), styleToken('type.base', 16, 'Inter')))).toEqual({ display: ['Inter', 400], body: ['Inter', 400] });
  });

  it('the first style wins a tie', () => {
    expect(brandFaces(brandWith(styleToken('type.a', 24, 'First'), styleToken('type.b', 24, 'Second'))).display).toEqual(['First', 400]);
  });
});

describe('the footnote', () => {
  const table = () => {
    const folder = new Folder();
    folder.put('a.ttf', ROMAN);
    return FontTable.scan([folder.path]);
  };
  const SET = 'Set in Bitstream Vera Sans, embedded from the font files given.';

  it('names the families set in their files and those that fell back', () => {
    expect(table().note(['Bitstream Vera Sans', 'Kinto', 'Inter'])).toBe(`${SET} Kinto, Inter: no font file given, shown in Helvetica.`);
  });

  it('a family named twice is named once in the order it first came', () => {
    expect(table().note(['Kinto', 'Bitstream Vera Sans', 'kinto', 'BitstreamVeraSans', 'Inter'])).toBe(`${SET} Kinto, Inter: no font file given, shown in Helvetica.`);
  });

  it('with no font files the footnote is the one there always was', () => {
    expect(FontTable.scan([]).note(['Inter'])).toBe('Shown in Helvetica: the typeface itself is not embedded in this file.');
  });

  it('when every family has a file there is nothing to say about Helvetica', () => {
    expect(table().note(['Bitstream Vera Sans'])).toBe(SET);
  });
});

describe('the fonts of the config, which blazon embeds in brand.json as data: stylesheets', () => {
  const sheet = (family: string, kind: string, data: Buffer, extra = '') => {
    const face = `@font-face{font-family:"${family}";src:url(data:font/${kind};base64,${data.toString('base64')}) format("x")${extra}}`;
    return `data:text/css;base64,${Buffer.from(face).toString('base64')}`;
  };

  it('a truetype font of the config is found by the family it says it has', () => {
    const table = new FontTable();
    table.addSheets(['https://fonts.example/a.css', sheet('Mulish', 'ttf', ROMAN)]);
    expect(table.has('Bitstream Vera Sans')).toBe(true);
    expect(table.has('Mulish')).toBe(false);
  });

  // The Python deck said a .woff2 could not be embedded. A browser takes it, so it is used, by the family and weight the config declares.
  it('a woff2 font is used by the family and weight the config declares', () => {
    const table = new FontTable();
    table.addSheets([sheet('Mulish', 'woff2', Buffer.from('wOF2'), ';font-weight:600')]);
    expect(table.skipped).toEqual([]);
    expect(table.weights('Mulish')).toEqual([600]);
  });

  it('a font of a kind the deck cannot use is said not to be used', () => {
    const table = new FontTable();
    table.addSheets([sheet('Mulish', 'eot', Buffer.from('x'))]);
    expect(table.skipped[0]![1]).toContain('.eot');
    expect(table.families()).toEqual([]);
  });

  it('a brand with no theme or no fonts has none', () => {
    const table = new FontTable();
    table.addSheets([]);
    table.addSheets(['https://fonts.example/a.css', 'data:text/css;base64,!!!', 7]);
    expect([table.families(), table.skipped]).toEqual([[], []]);
  });

  it('a face the deck asks for is named for the browser and its bytes are served', () => {
    const table = new FontTable();
    table.addSheets([sheet('Mulish', 'ttf', ROMAN)]);
    const face = table.face('Bitstream Vera Sans', 700)!;
    expect(face).toEqual({ css: 'brand-bitstreamverasans-400', weight: 400, id: 'bitstreamverasans-400' });
    expect(table.rules('http://x/fonts')).toBe('@font-face{font-family:"brand-bitstreamverasans-400";font-weight:400;src:url(http://x/fonts/bitstreamverasans-400)}');
    expect(table.file(face.id)!.bytes.equals(ROMAN)).toBe(true);
  });
});
