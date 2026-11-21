import fs from 'node:fs';
import path from 'node:path';
import { ASSET_URL_BASE, type Asset, type AssetCatalog, type AssetFormat, type Finding, type ParsedTokens } from '../../types/index.js';
import { readSidecar } from './sidecar.js';
import type { CategoryRoot } from './categories.js';
import { HEADER_BYTES, imageSize } from './image-size.js';
import { finding } from '../checker/catalogue.js';

/** File extension → format and media type. Anything else in the assets folder is ignored. */
export const ASSET_TYPES: Record<string, { format: AssetFormat; mediaType: string }> = {
  '.svg': { format: 'svg', mediaType: 'image/svg+xml' },
  '.png': { format: 'png', mediaType: 'image/png' },
  '.jpg': { format: 'jpg', mediaType: 'image/jpeg' },
  '.jpeg': { format: 'jpg', mediaType: 'image/jpeg' },
  '.gif': { format: 'gif', mediaType: 'image/gif' },
  '.webp': { format: 'webp', mediaType: 'image/webp' },
  '.avif': { format: 'avif', mediaType: 'image/avif' },
};

/** Category for files directly inside the assets folder. */
const TOP_LEVEL_CATEGORY = 'assets';

function cleanSvg(raw: string): string {
  return raw
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
}

function svgAttribute(svg: string, name: string): string | undefined {
  return svg.match(new RegExp(`<svg[^>]*\\s${name}=["']([^"']+)["']`, 'i'))?.[1];
}

function readHeader(fullPath: string): Buffer {
  const fd = fs.openSync(fullPath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, HEADER_BYTES, 0));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Reads one image. `root` is the folder its path is measured from; for a category scanned from its own
 * folder (`key`), the path is written as if the file sat in `assets/<key>/`, so ids and URLs have one shape.
 */
function readAsset(root: string, fullPath: string, category: string, key: string | undefined, options: ScanOptions): Asset | undefined {
  const ext = path.extname(fullPath).toLowerCase();
  const type = ASSET_TYPES[ext];
  if (!type) return undefined;

  const name = path.basename(fullPath, path.extname(fullPath));
  const filePath = virtualPath(root, fullPath, key);
  const base: Asset = {
    id: `${category}/${name}`,
    name,
    category,
    filePath,
    format: type.format,
    mediaType: type.mediaType,
    url: `${ASSET_URL_BASE}/${filePath.split('/').map(encodeURIComponent).join('/')}`,
    bytes: fs.statSync(fullPath).size,
  };

  const sidecar = readSidecar(root, fullPath.slice(0, -ext.length) + '.json', base.id, options.tokens, key ? `${key}/` : '', options.lockups);
  options.problems?.push(...sidecar.problems);
  if (sidecar.meta) base.meta = sidecar.meta;

  if (type.format === 'svg') {
    const svg = cleanSvg(fs.readFileSync(fullPath, 'utf-8'));
    return {
      ...base,
      svg,
      viewBox: svg.match(/viewBox=["']([^"']+)["']/i)?.[1],
      width: svgAttribute(svg, 'width'),
      height: svgAttribute(svg, 'height'),
    };
  }

  const size = imageSize(type.format, readHeader(fullPath));
  return size ? { ...base, ...size } : base;
}

/** A file's path as the catalog writes it: relative to `assets/`, or `<key>/…` for a category's own folder. */
function virtualPath(root: string, fullPath: string, key: string | undefined): string {
  const relative = path.relative(root, fullPath).split(path.sep).join('/');
  return key ? `${key}/${relative}` : relative;
}

/** Plain code-unit order, so a scan is the same on every machine. */
const byName = (a: fs.Dirent, b: fs.Dirent) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export interface ScanOptions {
  /** Resolved tokens, for a sidecar that aliases a dimension token */
  tokens?: ParsedTokens;
  /** Receives sidecar problems, orphaned sidecars and ids that two files share */
  problems?: Finding[];
  /** Folders scanned as a category of their own, by category key (the `dir` of an `assets` entry) */
  extraRoots?: Record<string, CategoryRoot>;
  /** The lockups a sidecar may state; the standard ones when absent */
  lockups?: readonly string[];
}

/**
 * Catalogs SVG and raster images under `assetsDir`, and under any extra folder a category names. A file's
 * category is its first folder (`logos`, `icons`, or any other name); files at the top level get the
 * category "assets"; every file under an extra folder gets that folder's category. A `<name>.json` beside
 * an image is its sidecar (RFC 0001 §7); one with no image of that name is reported. Two files that share
 * an id from different folders are reported too: the id would name both. Files are read in name order.
 */
export function scanAssets(assetsDir: string, options: ScanOptions = {}): AssetCatalog {
  // A prototype-free dictionary: a folder may be named `constructor` or `__proto__`, and a plain object would treat those as its own members
  const catalog: AssetCatalog = { logos: [], icons: [], custom: Object.create(null) as AssetCatalog['custom'], all: [] };

  const seen = new Map<string, { directory: string; source: string }>();
  const add = (asset: Asset, fullPath: string, source: string) => {
    const earlier = seen.get(asset.id);
    if (earlier && earlier.directory !== path.dirname(fullPath)) {
      options.problems?.push(finding('asset-id-duplicate', { path: asset.id, message: `"${asset.id}" names two files, ${earlier.source} and ${source}; rename one` }));
    }
    if (!earlier) seen.set(asset.id, { directory: path.dirname(fullPath), source });
    catalog.all.push(asset);
    if (asset.category === 'logos') catalog.logos.push(asset);
    else if (asset.category === 'icons') catalog.icons.push(asset);
    else (catalog.custom[asset.category] ??= []).push(asset);
  };

  const sidecars: string[] = [];
  /** Image paths (no extension) that exist but could not be read: their sidecar is not orphaned */
  const unreadable = new Set<string>();
  /** `sourcePrefix` is how the config wrote the folder, for messages; empty for `assets/` itself. */
  const walk = (root: string, dir: string, key: string | undefined, category: string | undefined, sourcePrefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(byName)) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(root, fullPath, key, category ?? key ?? entry.name, sourcePrefix);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        sidecars.push(virtualPath(root, fullPath, key));
      } else if (entry.isFile()) {
        try {
          const asset = readAsset(root, fullPath, category ?? key ?? TOP_LEVEL_CATEGORY, key, options);
          if (asset) add(asset, fullPath, key ? `${sourcePrefix}${path.relative(root, fullPath).split(path.sep).join('/')}` : asset.filePath);
        } catch (err) {
          // The code (EACCES) rather than the message, which holds an absolute path that differs by machine
          const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
          const reason = code ?? (err instanceof Error ? err.message.split('\n')[0]! : String(err));
          unreadable.add(virtualPath(root, fullPath, key).replace(/\.[^./]*$/, ''));
          const shown = key ? `${sourcePrefix}${path.relative(root, fullPath).split(path.sep).join('/')}` : virtualPath(root, fullPath, key);
          options.problems?.push(finding('asset-unreadable', { path: shown, message: `Cannot read this file (${reason}); it is left out of the book` }));
        }
      }
    }
  };

  if (fs.existsSync(assetsDir)) walk(assetsDir, assetsDir, undefined, undefined, '');
  for (const key of Object.keys(options.extraRoots ?? {}).sort()) {
    const { dir, label } = options.extraRoots![key]!;
    walk(dir, dir, key, key, `${label.replace(/\/+$/, '')}/`);
  }

  const named = new Set([...catalog.all.map((a) => a.filePath.slice(0, a.filePath.lastIndexOf('.'))), ...unreadable]);
  for (const file of sidecars) {
    if (!named.has(file.slice(0, -'.json'.length))) {
      options.problems?.push(finding('asset-sidecar-orphaned', { path: file, message: 'No image of this name sits beside it, so it describes nothing' }));
    }
  }
  // Sidecar `order` first, then the name order the files were read in (the sort is stable)
  const orderOf = (asset: Asset) => asset.meta?.order ?? Infinity;
  const byOrder = (a: Asset, b: Asset) => (orderOf(a) === orderOf(b) ? 0 : orderOf(a) < orderOf(b) ? -1 : 1);
  const rank = new Map<string, number>();
  for (const asset of catalog.all) if (!rank.has(asset.category)) rank.set(asset.category, rank.size);
  catalog.all.sort((a, b) => rank.get(a.category)! - rank.get(b.category)! || byOrder(a, b));
  catalog.logos.sort(byOrder);
  catalog.icons.sort(byOrder);
  for (const assets of Object.values(catalog.custom)) assets.sort(byOrder);
  return catalog;
}
