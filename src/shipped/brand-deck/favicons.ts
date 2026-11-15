import fs from 'node:fs';
import path from 'node:path';
import { isNumber, isObject, type Brand } from './brand.js';

/** A file the deck needs cannot be read; the message names it. */
export class DeckError extends Error {}

/** favicons.json as blazon.favicons writes it, with `folder` (where its files are) added. A part an older file lacks is absent. */
export interface Favicons {
  format: 'blazon-favicons';
  version: 1;
  symbol?: string;
  colors?: Record<string, string>;
  views?: { id: string; title: string; file: string; width: number; height: number }[];
  adaptive?: { symbolReach: number; safeRadius: number };
  files?: { file: string; size: string; use: string }[];
  head?: string;
  folder: string;
}

/**
 * Throws a DeckError for a favicons.json whose parts are not the shapes the slides read, so a hand-edited or damaged file is an
 * error naming it and not a failure from the middle of the drawing. A part a file lacks is not an error (an older file); a part
 * that is there must be right.
 */
function checkShape(file: string, data: Record<string, unknown>): void {
  const fail = (message: string): never => {
    throw new DeckError(`${file} ${message}`);
  };
  const views = data.views ?? [];
  if (!Array.isArray(views)) fail('has views that are not a list');
  (views as unknown[]).forEach((view, index) => {
    const where = `view ${index + 1}`;
    if (!isObject(view)) return fail(`has a ${where} that is not an object`);
    for (const key of ['id', 'title', 'file']) if (typeof view[key] !== 'string' || view[key] === '') fail(`has a ${where} with no ${key}`);
    const name = view.file as string;
    if (name === '.' || name === '..' || path.basename(name) !== name || name.includes('\\') || path.posix.basename(name) !== name) fail('names a file outside its own folder');
    for (const key of ['width', 'height']) if (!isNumber(view[key]) || (view[key] as number) <= 0) fail(`has a ${where} with no ${key} (a number above 0)`);
  });
  const files = data.files ?? [];
  if (!Array.isArray(files) || files.some((row) => !isObject(row) || ['file', 'size', 'use'].some((key) => typeof row[key] !== 'string')))
    fail('has files that are not a list of {file, size, use}');
  if ('head' in data && typeof data.head !== 'string') fail('has a head that is not text');
  if ('colors' in data && !isObject(data.colors)) fail('has colors that are not an object');
  const adaptive = data.adaptive;
  if (adaptive !== undefined && adaptive !== null && (!isObject(adaptive) || !isNumber(adaptive.symbolReach) || !isNumber(adaptive.safeRadius))) {
    fail('has an adaptive part without a symbolReach and a safeRadius (numbers)');
  }
}

/**
 * favicons.json in the plugin's folder with `folder` added, or null when there is none (no plugin ran, or it did not finish).
 * A file that is there but cannot be used is a DeckError, and one that is not about this brand's symbol is said through `warn`.
 */
export function readFavicons(folder: string, brand: Brand, warn: (message: string) => void = () => {}): Favicons | null {
  const file = path.join(folder, 'favicons.json');
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return null;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new DeckError(`cannot read ${file}: ${(error as Error).message}`);
  }
  if (!isObject(data) || data.format !== 'blazon-favicons' || data.version !== 1)
    throw new DeckError(`${file} is not a favicons.json this deck reads (format blazon-favicons, version 1)`);
  checkShape(file, data);
  if (typeof data.symbol !== 'string' || !brand.assets.some((asset) => asset.id === data.symbol)) {
    warn(`favicons not drawn: ${file} is for the symbol ${String(data.symbol)}, which this brand does not have`);
    return null;
  }
  return { ...(data as unknown as Favicons), folder };
}
