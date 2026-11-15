import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ASSET_TYPES } from '../core/assets/scanner.js';

/**
 * Serves image files from the assets folder under `/brand-assets/`, and a category's files from its own
 * folder when the config gives it one (`categoryDirs`, by category key). The dev server listens on all
 * interfaces, so this is reachable from the network: only image types are served, and a path that
 * resolves outside the folder it is looked up in (`..`, encoded `..`, or a symlink) gets a 404 like any
 * missing file.
 */
export function serveAssetFiles(assetsDir: () => string, categoryDirs: () => Record<string, string> = () => ({})) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? '';
    const file = inCategoryDir(categoryDirs(), url) ?? resolveInside(assetsDir(), url);
    const type = file ? ASSET_TYPES[path.extname(file).toLowerCase()] : undefined;
    if (!file || !type) return notFound(res);

    res.setHeader('Content-Type', type.mediaType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // An SVG opened directly must not run scripts it carries
    if (type.format === 'svg') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    fs.createReadStream(file)
      .on('error', () => next())
      .pipe(res);
  };
}

/** The file a request names inside its category's own folder, if the category has one and the file is there. */
function inCategoryDir(dirs: Record<string, string>, url: string): string | undefined {
  const match = url.match(/^\/([^/?]+)(\/[^?]*)?/);
  if (!match) return undefined;
  let key: string;
  try {
    key = decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
  return Object.hasOwn(dirs, key) ? resolveInside(dirs[key]!, match[2] ?? '/') : undefined;
}

/** The real path of a request below `root`, or undefined when it is missing, not a file, or escapes `root`. */
export function resolveInside(root: string, url: string): string | undefined {
  let relative: string;
  try {
    relative = decodeURIComponent(url.split('?')[0]!);
  } catch {
    return undefined;
  }
  if (relative.includes('\0')) return undefined;

  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(path.join(realRoot, path.normalize(`/${relative}`)));
    if (!real.startsWith(realRoot + path.sep) || !fs.statSync(real).isFile()) return undefined;
    return real;
  } catch {
    return undefined;
  }
}

export function notFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Not found');
}
