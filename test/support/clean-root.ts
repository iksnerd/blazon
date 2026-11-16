import path from 'node:path';
import { spawnSync } from './spawn.js';

// A test that writes into the repository root (a stand-in plugin that was given a relative path, a command run with the root as its
// folder) leaves a file in a public repository. The suite takes the root's `git status` when it starts and again when it ends, and
// fails with the paths that appeared or changed in between.

/** The lines of `git status --porcelain` for `root`, or undefined when `root` is not the top of a git checkout (a tarball, an exported snapshot). */
export function dirtyPaths(root: string): Set<string> | undefined {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf-8' });
  if (top.status !== 0 || path.resolve(top.stdout.trim()) !== path.resolve(root)) return undefined;
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf-8' });
  if (status.status !== 0) return undefined;
  return new Set(status.stdout.split('\n').filter(Boolean));
}

/** What `after` holds that `before` did not: the status lines of the paths a run left behind. */
export function leftBehind(before: Set<string>, after: Set<string>): string[] {
  return [...after].filter((line) => !before.has(line)).sort();
}
