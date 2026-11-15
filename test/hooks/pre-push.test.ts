import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// .githooks/pre-push checks the tree being pushed, once, before a commit leaves the machine: typecheck, lint and format, then the
// suites the changed files ask for, or the whole suite when a changed file asks for it. It tests the pushed commit's own tree,
// exported from git, not the working tree, and skips a step a tree already passed. A push to a remote that holds nothing yet has no
// base to compare with, so it runs the whole suite. Each test pushes from a throwaway clone to a throwaway bare repository, with
// the real hooks.

const HOOKS = path.join(REPO, '.githooks');

const { BLAZON_HOOK_TEST_ARGS: _outer, ...inherited } = process.env;
const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...inherited, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env },
  });
const counterFile = () => path.join(tempDir('blazon-push-count-'), 'count');
const count = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').length : 0);
/** The arguments the suite was started with, one line for each run. */
const suiteArgs = (counter: string) => (fs.existsSync(`${counter}.args`) ? fs.readFileSync(`${counter}.args`, 'utf-8').trim().split('\n') : []);

/** A package.json whose `test` script appends to a counter and exits with `exit`, so a test can tell whether the suite ran. */
const manifest = (counter: string, exit = 0) =>
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
const FILES: Record<string, string> = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' }, include: ['src'] }),
  '.gitignore': 'node_modules\n',
  'src/a.ts': 'export const a: number = 1;\n',
};
const write = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
};

/** A clone with the hooks installed and one commit pushed, and the bare repository it pushes to. */
function clone(counter: string, exit = 0): { dir: string; remote: string } {
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
const commit = (dir: string, files: Record<string, string>, ...extra: string[]) => {
  write(dir, files);
  git(dir, ['add', '-A']);
  const result = git(dir, ['commit', '-q', '--no-verify', '-m', 'change', ...extra]);
  expect(result.status, result.stderr).toBe(0);
  return git(dir, ['rev-parse', 'HEAD']).stdout.trim();
};
const push = (dir: string, args: string[] = ['origin', 'main'], extra: string[] = []) => {
  const result = git(dir, ['push', ...extra, ...args]);
  return { status: result.status, out: result.stdout + result.stderr };
};
const remoteHead = (remote: string, ref = 'main') => git(remote, ['rev-parse', '--verify', '-q', ref]).stdout.trim();

describe('the pre-push hook', () => {
  it('runs the typecheck and the full suite on the commit being pushed, and lets a good push go', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('✓ typecheck');
    expect(result.out).toContain('✓ tests: full suite');
    expect(count(counter)).toBe(1);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('refuses a push whose suite fails, says which test, and sends nothing', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter, 1);
    commit(dir, { 'src/a.ts': 'export const a: number = 3;\n' });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ tests: full suite');
    expect(result.out).toContain('--no-verify');
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('refuses a commit made with --no-verify that does not typecheck: it is the backstop', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ typecheck');
    expect(count(counter)).toBe(0);
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('tests the pushed commit and not the working tree', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 4;\n' });
    write(dir, { 'src/a.ts': 'export const a: number = "an unsaved mistake";\n' });
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('does not run the suite again for a tree that passed it', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 5;\n' });
    expect(push(dir, ['origin', 'main:one']).status).toBe(0);
    expect(count(counter)).toBe(1);
    const again = push(dir, ['origin', 'main:two']);
    expect(again.status, again.out).toBe(0);
    expect(count(counter)).toBe(1);
    expect(again.out).toContain('passed before');
  }, 120_000);

  it('is where a broad change meets the whole suite: the commit does not run it, the push runs it once', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    write(dir, { 'examples/x/blazon.config.ts': '// broad\n' });
    git(dir, ['add', '-A']);
    const made = git(dir, ['commit', '-q', '-m', 'broad']);
    expect(made.status, made.stdout + made.stderr).toBe(0);
    expect(count(counter)).toBe(0);
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(count(counter)).toBe(1);
  }, 120_000);

  describe('on a remote that already holds the branch', () => {
    /** A clone whose remote already has the base commit, so the push has a base to compare with. */
    function seeded(counter: string) {
      const made = clone(counter);
      const sent = git(made.dir, ['push', '--no-verify', '-q', 'origin', 'main']);
      expect(sent.status, sent.stderr).toBe(0);
      return made;
    }

    it('runs only the suites the changed files ask for, and not the whole suite', () => {
      const counter = counterFile();
      const { dir, remote } = seeded(counter);
      const sha = commit(dir, { 'src/a.ts': 'export const a: number = 11;\n' });
      const result = push(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('✓ tests: related to the changed files');
      expect(result.out).toContain('✓ tests: manual and RFC');
      expect(result.out).not.toContain('full suite');
      expect(count(counter)).toBe(0);
      expect(remoteHead(remote)).toBe(sha);
    }, 120_000);

    it('runs the tests that read a hook, for a changed hook, and nothing else', () => {
      const counter = counterFile();
      const { dir } = seeded(counter);
      write(dir, { 'test/hooks/keep.txt': 'x\n' });
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '--no-verify', '-m', 'tests']);
      expect(git(dir, ['push', '--no-verify', '-q', 'origin', 'main']).status).toBe(0);
      commit(dir, { '.githooks/note.sh': '#!/bin/sh\necho hi\n' });
      const result = push(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('✓ tests: hooks and scripts');
      expect(count(counter)).toBe(0);
    }, 120_000);

    it('runs the whole suite for a push that changes vite.config.ts', () => {
      const counter = counterFile();
      const { dir } = seeded(counter);
      write(dir, { 'vite.config.ts': "export default { external: ['vite'] };\n" });
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '--no-verify', '-m', 'base config']);
      expect(git(dir, ['push', '--no-verify', '-q', 'origin', 'main']).status).toBe(0);
      commit(dir, { 'vite.config.ts': "export default { external: ['vite', 'cac'] };\n" });
      const result = push(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('the whole suite runs: a changed file asks for it');
      expect(count(counter)).toBe(1);
    }, 120_000);

    describe('the tests of the hooks themselves, which take about a third of the suite', () => {
      // test/hooks reads .githooks/ and the install script by path. The suite re-runs them only when what they read, or they, changed.
      const HOOKS_EXCLUDED = '--exclude=test/hooks/**';

      it('are left out of the whole suite when no hook, script, test of theirs or dependency changed', () => {
        const counter = counterFile();
        const { dir } = seeded(counter);
        commit(dir, { 'examples/x/blazon.config.ts': '// a brand\n' });
        const result = push(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('✓ tests: full suite');
        expect(suiteArgs(counter).join('\n')).toContain(HOOKS_EXCLUDED);
      }, 120_000);

      it.each([
        ['a hook', { 'examples/x/blazon.config.ts': '// a brand\n', '.githooks/note.sh': '#!/bin/sh\necho hi\n' }],
        ['the install script', { 'examples/x/blazon.config.ts': '// a brand\n', 'scripts/install-hooks.mjs': '// install\n' }],
        ['a test of the hooks', { 'examples/x/blazon.config.ts': '// a brand\n', 'test/hooks/x.test.ts': '// t\n' }],
        ['package.json, which can change the tools they run', { 'examples/x/blazon.config.ts': '// a brand\n', 'package-lock.json': '{}\n' }],
      ])(
        'are in the whole suite when %s changed',
        (_what, files) => {
          const counter = counterFile();
          const { dir } = seeded(counter);
          commit(dir, files);
          const result = push(dir);
          expect(result.status, result.out).toBe(0);
          expect(result.out).toContain('✓ tests: full suite');
          expect(suiteArgs(counter).join('\n')).not.toContain(HOOKS_EXCLUDED);
        },
        120_000,
      );

      it('are in the whole suite that BLAZON_PUSH_FULL asks for', () => {
        const counter = counterFile();
        const { dir } = seeded(counter);
        commit(dir, { 'src/a.ts': 'export const a: number = 21;\n' });
        const result = git(dir, ['push', 'origin', 'main'], { BLAZON_PUSH_FULL: '1' });
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(suiteArgs(counter).join('\n')).not.toContain(HOOKS_EXCLUDED);
      }, 120_000);
    });

    it('runs the whole suite when a changed file asks for it', () => {
      const counter = counterFile();
      const { dir } = seeded(counter);
      commit(dir, { 'examples/x/blazon.config.ts': '// a brand\n' });
      const result = push(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('the whole suite runs: a changed file asks for it');
      expect(result.out).toContain('✓ tests: full suite');
      expect(count(counter)).toBe(1);
    }, 120_000);

    it('refuses a push whose whole suite fails', () => {
      const counter = counterFile();
      const { dir, remote } = seeded(counter);
      git(dir, ['config', 'user.name', 't']);
      // A failing suite: the exit code is the manifest's, so it is committed with the change that asks for it
      commit(dir, { 'package.json': manifest(counter, 1) });
      const result = push(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ tests: full suite');
      expect(remoteHead(remote)).not.toBe(git(dir, ['rev-parse', 'HEAD']).stdout.trim());
    }, 120_000);

    it('runs the whole suite for a tag, and when BLAZON_PUSH_FULL is set', () => {
      const counter = counterFile();
      const { dir } = seeded(counter);
      commit(dir, { 'src/a.ts': 'export const a: number = 12;\n' });
      git(dir, ['tag', 'v1']);
      const tagged = push(dir, ['origin', 'v1']);
      expect(tagged.status, tagged.out).toBe(0);
      expect(tagged.out).toContain('the whole suite runs: a tag is pushed');
      expect(count(counter)).toBe(1);

      commit(dir, { 'src/a.ts': 'export const a: number = 13;\n' });
      const forced = git(dir, ['push', 'origin', 'main'], { BLAZON_PUSH_FULL: '1' });
      expect(forced.status, forced.stdout + forced.stderr).toBe(0);
      expect(forced.stdout + forced.stderr).toContain('the whole suite runs: BLAZON_PUSH_FULL is set');
      expect(count(counter)).toBe(2);
    }, 120_000);
  });

  it('takes `git push origin <sha>:refs/heads/main` and tests that sha', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 6;\n' });
    commit(dir, { 'src/a.ts': 'export const a: number = 7;\n' });
    const result = push(dir, ['origin', `${sha}:refs/heads/main`]);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('runs nothing for the deletion of a remote branch', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    expect(push(dir, ['origin', 'main:topic']).status).toBe(0);
    const before = count(counter);
    const result = push(dir, ['origin', ':topic']);
    expect(result.status, result.out).toBe(0);
    expect(count(counter)).toBe(before);
    expect(remoteHead(remote, 'topic')).toBe('');
  }, 120_000);

  it('runs the suite once when two refs carry the same tree', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 8;\n' });
    expect(push(dir, ['origin', 'main:one', 'main:two']).status).toBe(0);
    expect(count(counter)).toBe(1);
  }, 120_000);

  it('is skipped by `git push --no-verify`', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter, 1);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 9;\n' });
    const result = push(dir, ['origin', 'main'], ['--no-verify']);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('says how to run it by hand when node_modules is missing, and sends nothing', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 10;\n' });
    fs.unlinkSync(path.join(dir, 'node_modules'));
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('npm install');
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('shows the failing lines of a suite that prints a lot first', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    // The suite is a file, so the quoting of a shell command cannot spoil it; the failing line is built at run time, because npm echoes a script's own text
    const suite = "for (let i = 0; i < 100; i++) console.log('noise ' + i); console.log(String.fromCharCode(32, 215) + ' the failing test'); process.exit(1);\n";
    const noisy = JSON.stringify({
      name: 'throwaway',
      private: true,
      scripts: { typecheck: 'tsc --noEmit -p .', lint: 'echo lint', 'format:check': 'echo format', 'format:files': 'echo format', test: 'node suite.js --' },
    });
    commit(dir, { 'package.json': noisy, 'suite.js': suite });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('× the failing test');
    expect(result.out).toContain('full output:');
  }, 120_000);
});
