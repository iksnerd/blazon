import fs from 'node:fs';
import path from 'node:path';

/** The file at `file` in the built site, or undefined when it is not there or leaves the site by a path or a link */
export function siteFile(siteDir: string, file: string): Buffer | undefined {
  const root = fs.realpathSync(siteDir);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return undefined;
  const real = fs.realpathSync(full);
  return real.startsWith(root + path.sep) ? fs.readFileSync(real) : undefined;
}
