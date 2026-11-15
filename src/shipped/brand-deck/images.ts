import fs from 'node:fs';
import path from 'node:path';
import { DeckError } from './favicons.js';
import type { Measure } from './measure.js';

/** The URL (under the page the deck is drawn on) an image is served at, its media type, and its bytes */
export interface Served {
  url: string;
  mime: string;
  bytes: Buffer;
  width: number;
  height: number;
}

const startsWith = (bytes: Buffer, ...codes: number[]): boolean => codes.every((code, index) => bytes[index] === code);

/** The media type of an image by what its first bytes say: a browser draws an SVG only when it is served as one */
export function mimeOf(bytes: Buffer, ref: string): string | undefined {
  const head = bytes.subarray(0, 512).toString('utf-8').trimStart();
  if (ref.toLowerCase().endsWith('.svg') || ref.startsWith('data:image/svg') || /^(<\?xml|<svg[\s>])/.test(head)) return 'image/svg+xml';
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(bytes, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (startsWith(bytes, 0x52, 0x49, 0x46, 0x46) && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (bytes.subarray(4, 12).toString('latin1').startsWith('ftypavif')) return 'image/avif';
  return undefined;
}

/** The size of an SVG in its own units: its width and height, else its viewBox. undefined when it has neither or is no SVG. */
export function svgSize(text: string): { width: number; height: number } | undefined {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return undefined;
  const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const length = (value: string | undefined) => {
    const match = value === undefined ? null : /^\s*([\d.]+)\s*(px|pt)?\s*$/.exec(value);
    return match ? Number(match[1]) * (match[2] === 'pt' ? 4 / 3 : 1) : undefined;
  };
  const width = length(attribute('width'));
  const height = length(attribute('height'));
  if (width && height) return { width, height };
  const box = attribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  return box && box.length === 4 && box[2]! > 0 && box[3]! > 0 ? { width: box[2]!, height: box[3]! } : undefined;
}

/** What a reader says went wrong with a file, as the Python deck's message did: the file's name and the system's reason */
const reasonOf = (error: unknown): string => (error as NodeJS.ErrnoException).message ?? String(error);

/** Reads the images the slides name: from beside brand.json (the site), from the favicons folder, or from a data: URI. Each is served once. */
export class Images {
  private byKey = new Map<string, Served>();
  private byUrl = new Map<string, Served>();

  constructor(private measure: Measure) {}

  /** `ref` read from inside `root`, or throws a DeckError that names it */
  load(ref: string, root: string): Served {
    const key = `${root}\0${ref}`;
    const cached = this.byKey.get(key);
    if (cached) return this.sized(cached, ref);
    const bytes = this.read(ref, root);
    const mime = mimeOf(bytes, ref);
    if (!mime) throw new DeckError(`cannot read ${ref}: not an image the deck can draw (PNG, JPEG, GIF, WebP, AVIF or SVG)`);
    let size = { width: 1, height: 1 };
    if (mime === 'image/svg+xml') {
      const found = svgSize(bytes.toString('utf-8'));
      if (!found) throw new DeckError(`cannot read ${ref}: not a readable SVG`);
      size = found;
    }
    const served: Served = { url: `/img/${this.byKey.size}`, mime, bytes, ...size };
    if (mime === 'image/svg+xml') this.measure.setNatural(served.url, size);
    this.byKey.set(key, served);
    this.byUrl.set(served.url, served);
    return this.sized(served, ref);
  }

  private sized(served: Served, ref: string): Served {
    const found = this.measure.natural(served.url);
    if (found === null) throw new DeckError(`cannot read ${ref}: the browser cannot draw this image`);
    return found ? { ...served, width: found.width, height: found.height } : served;
  }

  private read(ref: string, root: string): Buffer {
    try {
      if (ref.startsWith('data:')) {
        const [header = '', payload = ''] = [ref.slice(0, ref.indexOf(',')), ref.slice(ref.indexOf(',') + 1)];
        return header.includes(';base64') ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'binary');
      }
      const base = fs.realpathSync(root);
      const file = fs.realpathSync(path.resolve(base, ref));
      if (file !== base && !file.startsWith(base + path.sep)) throw new Error('is outside the folder it is read from');
      return fs.readFileSync(file);
    } catch (error) {
      throw new DeckError(`cannot read ${ref.startsWith('data:') ? 'the embedded logo' : ref}: ${reasonOf(error)}`);
    }
  }

  /** The image served at a URL, for the route that answers the browser */
  file(url: string): Served | undefined {
    return this.byUrl.get(url);
  }
}
