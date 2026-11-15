import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * `prepare` does not install the git hooks (`npm run hooks` does, CONTRIBUTING, "The hooks"), so a contributor who forgets commits with no
 * gate. The vitest global setup prints this notice once per run. It reads git and never writes to it, and it never throws.
 */
export function hooksNotice(state: { inCheckout: boolean; hooksPath: string | null }): string | null {
  if (!state.inCheckout) return null;
  const value = (state.hooksPath ?? '').trim().replace(/\/+$/, '');
  if (value === '.githooks' || value === './.githooks') return null;
  return 'blazon: the git hooks are not installed in this checkout, so commits and pushes are not checked. Run `npm run hooks`.';
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return null; // git is absent, or this is not a checkout
  }
}

/** Whether `root` is the top of blazon's own git checkout, and what `core.hooksPath` is there. Null top means no git or no checkout. */
export function hooksState(root: string): { inCheckout: boolean; hooksPath: string | null } {
  if (!fs.existsSync(path.join(root, '.githooks'))) return { inCheckout: false, hooksPath: null };
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top || fs.realpathSync(top) !== fs.realpathSync(root)) return { inCheckout: false, hooksPath: null };
  const configured = git(root, ['config', 'core.hooksPath']);
  return { inCheckout: true, hooksPath: configured && pointsAtHooksOfThisRepo(root, configured) ? '.githooks' : configured };
}

/** A hooks path (absolute, or relative to `root`) that is the `.githooks` of any checkout of this repository: the main one or a worktree. */
function pointsAtHooksOfThisRepo(root: string, configured: string): boolean {
  const target = path.resolve(root, configured);
  if (path.basename(target) !== '.githooks') return false;
  const common = (dir: string) => git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const mine = common(root);
  if (!mine || !fs.existsSync(target)) return false;
  const theirs = common(path.dirname(target));
  return !!theirs && fs.realpathSync(theirs) === fs.realpathSync(mine);
}
