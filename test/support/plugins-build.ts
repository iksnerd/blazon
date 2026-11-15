import fs from 'node:fs';
import path from 'node:path';
import { newest } from './viewer-build.js';

// The shipped plugins' programs and plugins/shipped.lock are build output (scripts/build-plugins.mjs), so a checkout has none until it is built.
// The suite builds them the way it builds the viewer: only when they are older than what they are made from, and under a lock.

/** What a plugin bundle and the lock are made from: the plugin source, what it imports, the host's digest, the build scripts and each plugin folder's own files. */
const SOURCE_DIRS = ['src/shipped', 'src/core', 'src/types', 'src/plugins/pins'];
const SOURCE_FILES = ['scripts/build-plugins.mjs', 'scripts/shipped-lock.mjs', 'package.json', 'package-lock.json'];

export const PLUGINS_LOCK = 'dist/.plugins-build.lock';

/** Whether shipped.lock was written after the last change to anything the plugins and the lock are made from. A missing lock is not fresh. */
export function pluginsAreFresh(root: string): boolean {
  const marker = path.join(root, 'plugins/shipped.lock');
  if (!fs.existsSync(marker)) return false;
  const folders = fs.readdirSync(path.join(root, 'plugins'), { withFileTypes: true }).filter((item) => item.isDirectory());
  let sources = Math.max(
    ...SOURCE_DIRS.map((dir) => newest(path.join(root, dir))),
    ...SOURCE_FILES.map((file) => (fs.existsSync(path.join(root, file)) ? fs.statSync(path.join(root, file)).mtimeMs : 0)),
  );
  for (const folder of folders) {
    const dir = path.join(root, 'plugins', folder.name);
    // A plugin's program must exist; its README and package.json are part of the pin, so a change to them makes the lock stale
    const program = path.join(dir, 'bin', `blazon-${folder.name}.🔌`);
    if (!fs.existsSync(program)) return false;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) if (item.isFile()) sources = Math.max(sources, fs.statSync(path.join(dir, item.name)).mtimeMs);
  }
  return fs.statSync(marker).mtimeMs >= sources;
}
