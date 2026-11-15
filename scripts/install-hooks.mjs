// Run by `npm install` (the package's prepare script): point git at the hooks in .githooks, so every commit in this checkout is
// checked by .githooks/pre-commit. It does nothing, and does not fail, where there is no git checkout.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  // stderr, not stdout: npm 10 runs prepare even under --ignore-scripts, and a stdout line breaks `npm pack --json`.
  console.error('blazon: git hooks installed from .githooks (skip one commit with git commit --no-verify)');
} catch {
  // not a git checkout, or git is not installed
}
