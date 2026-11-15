import path from 'node:path';
import { build } from 'vite';
import { execFileSync } from './spawn.js';
import { pluginsAreFresh, PLUGINS_LOCK } from './plugins-build.js';
import { ensureBuilt, ensureViewer } from './viewer-build.js';
import { hooksNotice, hooksState } from './hooks-notice.js';
import { hasReference, REFERENCE_ROOT } from './reference.js';

/**
 * blazon build copies the prebuilt viewer from dist/ui, so the suite compiles it first, as `npm run build` does at publish time. It does so
 * only when dist/ui is older than what it is made from, and under a lock, so that two runs at once do not delete it under each other.
 * The shipped plugins' programs and plugins/shipped.lock are build output too (`npm run build:plugins`), and are made the same way.
 */
export default async function setup(): Promise<void> {
  const root = path.resolve(import.meta.dirname, '../..');
  try {
    const notice = hooksNotice(hooksState(root));
    if (notice) process.stderr.write(`${notice}\n`);
  } catch {
    // a notice never fails a run
  }
  if (!hasReference('examples')) {
    process.stderr.write(`No reference material in ${REFERENCE_ROOT}: the tests that need it are skipped (CONTRIBUTING, "Reference material").\n`);
  }
  await ensureViewer(root, async () => {
    await build({ configFile: path.resolve(root, 'vite.viewer.config.ts'), logLevel: 'silent' });
  });
  await ensureBuilt(
    root,
    PLUGINS_LOCK,
    () => pluginsAreFresh(root),
    async () => {
      execFileSync('npm', ['run', 'build:plugins', '--silent'], { cwd: root, encoding: 'utf-8' });
    },
  );
}
