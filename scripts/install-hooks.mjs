// Run by `npm run hooks` (not a prepare script: npm 12 warns an installer about one in a package's manifest): point git at the hooks in .githooks, so every commit in this checkout is
// checked by .githooks/pre-commit. The path is the relative `.githooks`, which git resolves against the worktree where a hook runs, so each git worktree runs its
// own hooks; an absolute value (the config is shared by every worktree) would run the main checkout's. A value other than `.githooks` is rewritten and named on
// stderr. It does nothing, and does not fail, where there is no git checkout or no .githooks folder.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

try {
  if (!fs.existsSync('.githooks')) process.exit(0);
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  let old = '';
  try {
    old = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // unset: git config --get exits 1
  }
  if (old !== '.githooks') {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
    if (old) console.error(`blazon: core.hooksPath was ${old}; set to .githooks so a git worktree runs its own hooks`);
  }
  console.error('blazon: git hooks installed from .githooks (skip one commit with git commit --no-verify)');
} catch {
  // not a git checkout, or git is not installed
}
