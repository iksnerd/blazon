import { expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// Shared by the pre-commit-*.test.ts files, which are one suite split by topic so that vitest runs them on separate workers.
// .githooks/pre-commit is the gate on every commit (CI also runs on pull requests, but does not replace the hook). It tests the staged
// snapshot, not the working tree. Each test makes a throwaway git repo with the real hook and a few tiny files, stages
// something, and runs a real `git commit`, so the exit status and the output are the hook's own.

export const HOOKS = path.join(REPO, '.githooks');
export const gitleaks = spawnSync('gitleaks', ['version']).status === 0;
// A missing gitleaks skips its test and says so; set BLAZON_REQUIRE_GITLEAKS=1 where it is installed and a missing one fails.
if (!gitleaks && process.env.BLAZON_REQUIRE_GITLEAKS) throw new Error('BLAZON_REQUIRE_GITLEAKS is set, and gitleaks is not installed');
if (!gitleaks) console.warn('pre-commit hook test: the secret scan test is skipped, gitleaks is not installed');

export const BASE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'throwaway',
    private: true,
    scripts: {
      typecheck: 'tsc --noEmit -p .',
      lint: 'node lint.js',
      'lint:files': 'node lint-files.js',
      'format:files': 'node format.js',
      'lint:py': 'echo ruff',
      test: 'echo full',
      'test:related': 'echo related',
      'test:deck': 'echo deck',
      'test:docs': 'echo docs',
      'test:files': 'echo files',
      'test:guards': 'echo guards',
    },
  }),
  // Stands for ESLint: it fails when a file under src/ holds the word LINT_ERROR
  'lint.js':
    "const fs = require('fs'); const bad = fs.readdirSync('src').filter((f) => fs.readFileSync('src/' + f, 'utf8').includes('LINT_ERROR')); if (bad.length) { console.log('lint error in ' + bad.join(', ')); process.exit(1); }\n",
  // Stands for `eslint <files>`: it fails when a file it is given holds the word LINT_ERROR
  'lint-files.js':
    "const fs = require('fs'); const files = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => files(p + '/' + n)) : [p]); const bad = process.argv.slice(2).flatMap(files).filter((f) => fs.readFileSync(f, 'utf8').includes('LINT_ERROR')); if (bad.length) { console.log('lint error in ' + bad.join(', ')); process.exit(1); }\n",
  // Stands for Prettier: it fails when a file it is given holds the word FORMAT_ERROR
  'format.js':
    "const fs = require('fs'); const bad = process.argv.slice(2).filter((f) => fs.readFileSync(f, 'utf8').includes('FORMAT_ERROR')); if (bad.length) { console.log('not formatted: ' + bad.join(', ')); process.exit(1); }\n",
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' }, include: ['src'] }),
  '.gitignore': 'node_modules\n',
  'src/a.ts': 'export const a: number = 1;\n',
  'src/b.ts': "import { a } from './a';\nexport const b: number = a;\n",
  'README.md': '# throwaway\n',
};

// The hook of the repository being committed may be running these tests with its own BLAZON_HOOK_TEST_ARGS: the throwaway repos get the defaults
const {
  BLAZON_HOOK_TEST_ARGS: _outer,
  BLAZON_HOOK_NO_LOCK: _noLock,
  BLAZON_HOOK_LOCK_WAIT_SECONDS: _wait,
  BLAZON_HOOK_LOCK_POLL_SECONDS: _poll,
  BLAZON_HOOK_LOCK_NOTICE_SECONDS: _notice,
  BLAZON_HOOK_TEST_SLOTS: _slots,
  ...inherited
} = process.env;
/** The environment a throwaway repo's hook runs in: this process's, without the knobs of the hook being run. */
export const hookEnv = inherited;
export const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...inherited, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env },
  });

/** A repo with the real hook installed and BASE committed (without the hook). */
export function repo(extra: Record<string, string> = {}): string {
  const dir = tempDir('blazon-hook-');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(dir, '.githooks'));
  // The whole hooks folder, as installed: pre-commit and pre-push share lib.sh
  for (const name of fs.readdirSync(HOOKS)) {
    fs.copyFileSync(path.join(HOOKS, name), path.join(dir, '.githooks', name));
    fs.chmodSync(path.join(dir, '.githooks', name), 0o755);
  }
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  write(dir, { ...BASE, ...extra });
  git(dir, ['add', '-A']);
  const base = git(dir, ['commit', '-q', '--no-verify', '-m', 'base']);
  expect(base.status, base.stderr).toBe(0);
  return dir;
}
export const write = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
};
export const stage = (dir: string, files: Record<string, string>) => {
  write(dir, files);
  const added = git(dir, ['add', ...Object.keys(files)]);
  expect(added.status, added.stderr).toBe(0);
};
export const head = (dir: string) => git(dir, ['rev-parse', 'HEAD']).stdout.trim();
/** `git commit` with the hook, and what it printed. */
export const commit = (dir: string, env: Record<string, string> = {}, extra: string[] = []) => {
  const result = git(dir, ['commit', '-m', 'change', ...extra], env);
  return { status: result.status, out: result.stdout + result.stderr };
};
export const ran = (out: string, label: string) => out.includes(`✓ ${label}`);

// A stand-in for the related suite that counts its runs in a file, for the tests of the hook's memory of a tree that passed.
export const counting = (counter: string, exit = 0) => {
  const manifest = JSON.parse(BASE['package.json']!);
  manifest.scripts['test:related'] = `node -e "require('fs').appendFileSync('${counter}', 'r'); process.exit(${exit})" --`;
  return JSON.stringify(manifest);
};
export const count = (counter: string) => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf-8').length : 0);
export const counterFile = () => path.join(tempDir('blazon-hook-count-'), 'count');

// The stand-in for the whole-tree ESLint finds this mistake; the stand-in for `eslint <files>` finds it only when handed the file
export const LINT_BROKEN = { 'src/broken.ts': 'export const x: number = 1; // LINT_ERROR\n' };
const labels = {
  full: 'tests: full suite',
  related: 'tests: related to the staged files',
  deck: 'tests: deck and plugins',
  docs: 'tests: manual and RFC',
  files: 'tests: hooks and scripts',
};
/** Which of the suites a commit ran, from what the hook printed. */
export const which = (out: string) => (Object.entries(labels) as [keyof typeof labels, string][]).filter(([, label]) => ran(out, label)).map(([key]) => key);
