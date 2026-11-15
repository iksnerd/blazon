import fs from 'node:fs';
import path from 'node:path';

// The tests that run the real commands copy the prebuilt viewer from dist/ui, so a run builds it first. The build empties dist/ui, so two runs
// at once used to delete it under each other ("No prebuilt viewer in dist/ui"). A run now builds only when dist/ui is older than what it is made
// from, and takes a lock to do it, so a second run waits for the first and finds the viewer built.

/** What the viewer bundle is made from: its own sources, the core and the types it imports, and the files that configure the build. */
const SOURCE_DIRS = ['src/viewer', 'src/core', 'src/types'];
const SOURCE_FILES = ['vite.viewer.config.ts', 'package.json', 'tsconfig.json'];

/** The marker of a finished build: the build writes index.html last, so a source newer than it was edited after the build. */
const MARKER = 'dist/ui/index.html';
const LOCK = 'dist/.ui-build.lock';

/** The newest modification time under a folder, in ms; 0 for a folder that is not there. */
export function newest(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let latest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : fs.statSync(full).mtimeMs);
  }
  return latest;
}

/** Whether dist/ui was built after the last change to anything it is made from. A missing build is not fresh. */
export function viewerIsFresh(root: string): boolean {
  const marker = path.join(root, MARKER);
  if (!fs.existsSync(marker)) return false;
  const sources = Math.max(
    ...SOURCE_DIRS.map((dir) => newest(path.join(root, dir))),
    ...SOURCE_FILES.map((file) => (fs.existsSync(path.join(root, file)) ? fs.statSync(path.join(root, file)).mtimeMs : 0)),
  );
  return fs.statSync(marker).mtimeMs >= sources;
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Takes the lock if it is free: an atomic mkdir, with the owner's pid written inside. A lock whose owner is gone, or that is older than `staleMs`,
 * is removed and not taken, so the caller's next try is the same as for a free lock.
 */
function takeLock(lock: string, staleMs: number): boolean {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try {
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  let owner = NaN;
  try {
    owner = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf-8'));
  } catch {
    /* no pid yet: the owner has just made the folder */
  }
  const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
  if ((Number.isInteger(owner) && !alive(owner)) || age > staleMs) fs.rmSync(lock, { recursive: true, force: true });
  return false;
}

export interface EnsureOptions {
  /** How long to wait for another run's build, in ms */
  waitMs?: number;
  /** How old a lock may be before it is taken to be left behind, in ms */
  staleMs?: number;
  pollMs?: number;
}

/**
 * Makes sure a build is fresh: nothing when `fresh` says so, otherwise `build` under `lock` (a path under `root`). A run that finds the lock held
 * waits for it and then looks again, since the run that held it has built. Returns what it did.
 */
export async function ensureBuilt(
  root: string,
  lockPath: string,
  fresh: () => boolean,
  build: () => Promise<void>,
  { waitMs = 300_000, staleMs = 600_000, pollMs = 100 }: EnsureOptions = {},
): Promise<'fresh' | 'built'> {
  const lock = path.join(root, lockPath);
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (fresh()) return 'fresh';
    if (takeLock(lock, staleMs)) {
      try {
        if (fresh()) return 'fresh';
        await build();
        return 'built';
      } finally {
        fs.rmSync(lock, { recursive: true, force: true });
      }
    }
    if (Date.now() > deadline)
      throw new Error(`another run has held ${lock} for more than ${Math.round(waitMs / 1000)} s while building: delete that folder if no vitest run is building`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Makes sure dist/ui is fresh (`ensureBuilt` on the viewer's marker and lock). */
export function ensureViewer(root: string, build: () => Promise<void>, options: EnsureOptions = {}): Promise<'fresh' | 'built'> {
  return ensureBuilt(root, LOCK, () => viewerIsFresh(root), build, options);
}
