import { expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// Shared by the pre-push-*.test.ts files, which are one suite split in two so that vitest runs them on separate workers.
// .githooks/pre-push checks the tree being pushed, once, before a commit leaves the machine: typecheck, lint and format, then the
// suites the changed files ask for, or the whole suite when a changed file asks for it. It tests the pushed commit's own tree,
// exported from git, not the working tree, and skips a step a tree already passed. A push to a remote that holds nothing yet has no
// base to compare with, so it runs the whole suite. Each test pushes from a throwaway clone to a throwaway bare repository, with
// the real hooks.

export const HOOKS = path.join(REPO, '.githooks');

const { BLAZON_HOOK_TEST_ARGS: _outer, ...inherited } = process.env;
export const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...inherited, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env },
  });
export const counterFile = () => path.join(tempDir('blazon-push-count-'), 'count');
export const count = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').length : 0);
/** The arguments the suite was started with, one line for each run. */
export const suiteArgs = (counter: string) => (fs.existsSync(`${counter}.args`) ? fs.readFileSync(`${counter}.args`, 'utf-8').trim().split('\n') : []);

/** A package.json whose `test` script appends to a counter and exits with `exit`, so a test can tell whether the suite ran. */
export const manifest = (counter: string, exit = 0) =>
  JSON.stringify({
    name: 'throwaway',
    private: true,
    scripts: {
      typecheck: 'tsc --noEmit -p .',
      lint: 'echo lint',
      'format:check': 'echo format',
      'format:files': 'echo format',
      'test:files': 'echo files',
      test: `node -e "require('fs').appendFileSync('${counter}', 'f'); require('fs').appendFileSync('${counter}.args', process.argv.slice(1).join(' ') + '\\n'); process.exit(${exit})" --`,
      'test:related': 'echo related',
      'test:deck': 'echo deck',
      'test:docs': 'echo docs',
    },
  });
export const FILES: Record<string, string> = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' }, include: ['src'] }),
  '.gitignore': 'node_modules\n',
  'src/a.ts': 'export const a: number = 1;\n',
};
export const write = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
};

/** A clone with the hooks installed and one commit pushed, and the bare repository it pushes to. */
export function clone(counter: string, exit = 0): { dir: string; remote: string } {
  const remote = tempDir('blazon-remote-');
  git(remote, ['init', '-q', '--bare', '-b', 'main']);
  const dir = tempDir('blazon-clone-');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(dir, '.githooks'));
  for (const name of fs.readdirSync(HOOKS)) {
    fs.copyFileSync(path.join(HOOKS, name), path.join(dir, '.githooks', name));
    fs.chmodSync(path.join(dir, '.githooks', name), 0o755);
  }
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  write(dir, { ...FILES, 'package.json': manifest(counter, exit) });
  git(dir, ['add', '-A']);
  expect(git(dir, ['commit', '-q', '--no-verify', '-m', 'base']).status).toBe(0);
  return { dir, remote };
}
export const commit = (dir: string, files: Record<string, string>, ...extra: string[]) => {
  write(dir, files);
  git(dir, ['add', '-A']);
  const result = git(dir, ['commit', '-q', '--no-verify', '-m', 'change', ...extra]);
  expect(result.status, result.stderr).toBe(0);
  return git(dir, ['rev-parse', 'HEAD']).stdout.trim();
};
export const push = (dir: string, args: string[] = ['origin', 'main'], extra: string[] = []) => {
  const result = git(dir, ['push', ...extra, ...args]);
  return { status: result.status, out: result.stdout + result.stderr };
};
export const remoteHead = (remote: string, ref = 'main') => git(remote, ['rev-parse', '--verify', '-q', ref]).stdout.trim();
