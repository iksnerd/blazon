// Run by `npm run hooks` (not a prepare script: npm 12 warns an installer about one in a package's manifest): point git at the hooks in .githooks, so every commit in this checkout is
// checked by .githooks/pre-commit. It does nothing, and does not fail, where there is no git checkout or no .githooks folder.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

try {
  if (!fs.existsSync('.githooks')) process.exit(0);
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.error('blazon: git hooks installed from .githooks (skip one commit with git commit --no-verify)');
} catch {
  // not a git checkout, or git is not installed
}
