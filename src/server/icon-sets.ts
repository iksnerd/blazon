import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IconSetConfig } from '../types/index.js';
import { iconSetDir } from '../core/icons/icon-sets.js';
import { notFound, resolveInside } from './assets.js';

/**
 * Serves an icon set's SVGs from its package under `/brand-assets/icon-sets/<name>/<icon>.svg`. Only a
 * `.svg` directly inside the set's folder is served: anything else in the package (README, package.json,
 * a link out of it) gets a 404 like any missing file.
 */
export function serveIconSets(sets: () => IconSetConfig[], cwd: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const [, name, ...rest] = (req.url ?? '').split('?')[0]!.split('/');
    const set = sets().find((candidate) => candidate.name === name);
    const dir = set && rest.length === 1 && rest[0]!.endsWith('.svg') ? iconSetDir(set, cwd) : undefined;
    const file = dir ? resolveInside(dir, `/${rest[0]}`) : undefined;
    if (!file) return notFound(res);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // An SVG opened directly must not run scripts it carries
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    fs.createReadStream(file)
      .on('error', () => next())
      .pipe(res);
  };
}
