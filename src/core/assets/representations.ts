import { compareText } from '../order.js';

/**
 * An asset id with several files is one asset, and its files are its representations (RFC 0001 section 7): `logos/mark.svg` and
 * `logos/mark.png` are two records with the id `logos/mark`. A reader that needs one file for an id asks here, so every reader
 * picks the same one whatever order the records are in.
 */
export interface Representation {
  id: string;
  /** `svg`, `png`, `jpg`, `gif`, `webp`, `avif`: what the catalog and brand.json call the format */
  format: string;
  /** The file's path as the asset catalog writes it (`Asset.filePath`) */
  filePath?: string;
  /** The file's path beside brand.json (`file` in brand.json) */
  file?: string;
}

/** The order a reader follows when it has no preference of its own: vector first, then the rasters, then any other format by name. */
export const DEFAULT_FORMAT_ORDER: readonly string[] = ['svg', 'png', 'webp', 'jpg', 'gif'];

export interface PickOptions {
  /** The formats the caller can use, best first. Without it every format counts and the default order decides. */
  formats?: readonly string[];
}

const pathOf = (record: Pick<Representation, 'filePath' | 'file'>): string => record.filePath ?? record.file ?? '';

/** The file name of a representation, the last segment of its path. */
export function fileNameOf(record: Pick<Representation, 'filePath' | 'file'>): string {
  const path = pathOf(record);
  return path.slice(path.lastIndexOf('/') + 1);
}

const defaultRank = (format: string): number => {
  const at = DEFAULT_FORMAT_ORDER.indexOf(format === 'jpeg' ? 'jpg' : format);
  return at === -1 ? DEFAULT_FORMAT_ORDER.length : at;
};

/** The order of two representations of one id: the caller's formats first, then the default order, then the file name. */
export function compareRepresentations(a: Representation, b: Representation, options: PickOptions = {}): number {
  const preferred = options.formats;
  if (preferred) {
    const rank = (r: Representation) => {
      const at = preferred.indexOf(r.format);
      return at === -1 ? preferred.length : at;
    };
    const byWish = rank(a) - rank(b);
    if (byWish !== 0) return byWish;
  }
  return defaultRank(a.format) - defaultRank(b.format) || compareText(a.format, b.format) || compareText(fileNameOf(a), fileNameOf(b)) || compareText(pathOf(a), pathOf(b));
}

/** Every file of an id, in the default order. */
export function representationsOf<T extends Representation>(records: readonly T[], id: string): T[] {
  return records.filter((record) => record.id === id).sort((a, b) => compareRepresentations(a, b));
}

/**
 * The one file an id means for a reader. With `formats`, the first of them that the id has (none when it has none of them: the
 * caller says what to do, such as "needs an SVG: logos/mark has png only"); without, the first in the default order.
 */
export function pickRepresentation<T extends Representation>(records: readonly T[], id: string, options: PickOptions = {}): T | undefined {
  const own = records.filter((record) => record.id === id && (!options.formats || options.formats.includes(record.format)));
  return own.sort((a, b) => compareRepresentations(a, b, options))[0];
}

/**
 * For a reader that keys a map by id while it reads the records: puts `record` in the map unless the map already holds a better
 * representation of that id. A record in a format the caller does not list is kept only when the id has no other, so the caller
 * can say what is wrong with it. The map ends the same whatever order the records come in.
 */
export function keepRepresentation<T extends Representation>(map: Map<string, T>, record: T, options: PickOptions = {}): void {
  const held = map.get(record.id);
  if (!held || compareRepresentations(record, held, options) < 0) map.set(record.id, record);
}

/**
 * The record of one named file among all the records, for a logo or other setting that names a FILE and not an id: the file is that
 * one, whatever else its id has, so the lookup runs over every record and never over the one a reader kept for the id. `file` is a
 * path as brand.json writes it (`file`) or as the catalog does (`filePath`).
 */
export function findByFile<T extends Representation>(records: readonly T[], file: string): T | undefined {
  return records.find((record) => record.file === file || record.filePath === file);
}
