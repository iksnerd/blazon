import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import path from 'node:path';
import { canonical, isWithin } from '../core/confine.js';

/**
 * Refuses a request for a file of the built site that is a link leaving the site's folder. Vite's preview server follows links, so a
 * `dist/site` that carries `leak.txt -> ~/.ssh/id_rsa` (a built folder is easy to ship in a repository) would serve what it points at. A
 * path that does not exist passes on, to the 404 or the page fallback.
 */
export function guardSiteLinks(outDir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    let relative: string;
    try {
      relative = decodeURIComponent((req.url ?? '').split('?')[0]!);
    } catch {
      return next();
    }
    if (relative.includes('\0')) return next();
    const file = path.join(outDir, path.normalize(`/${relative}`));
    if (isWithin(canonical(outDir), canonical(file))) return next();
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain');
    res.end('blazon preview serves only files inside the built site: this path is a link that leaves it');
  };
}

/** The Vite plugin that puts the guard in front of the preview server's own file serving. */
export const siteLinkGuard = (outDir: string): Plugin => ({
  name: 'blazon-site-link-guard',
  configurePreviewServer(server) {
    server.middlewares.use(guardSiteLinks(outDir));
  },
});
