import { describe, it, expect } from 'vitest';
import { tempDir } from '../support/project';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { BASE, commit, repo, stage, which, write, git } from '../support/hook-commit';

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
    it('says the full suite waits for the push, for a path that asks for it', () => {
      const dir = repo();
      stage(dir, { 'examples/x/blazon.json': '// config\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('the full suite runs at push, not at commit');
    }, 120_000);

    it('runs only the tests that read a hook or a script by name', () => {
      const hooks = repo({ 'test/hooks/keep.txt': 'x\n' });
      stage(hooks, { '.githooks/note.sh': '#!/bin/sh\necho hi\n' });
      expect(which(commit(hooks).out)).toEqual(['files']);
      const lock = repo({ 'test/scripts/shipped-lock.test.ts': '// t\n' });
      stage(lock, { 'scripts/shipped-lock.mjs': '// lock\n' });
      expect(which(commit(lock).out)).toEqual(['files']);
    }, 240_000);

    it.each([
      ['a README in a plugin folder', { 'plugins/blazon.x/README.md': '# changed\n' }],
      ['a package.json in a plugin folder', { 'plugins/blazon.x/package.json': '{"type":"commonjs"}\n' }],
    ])(
      'runs the tests that check the lock against the plugin folders, for %s, and not the manual tests',
      (_what, files) => {
        // The lock holds a digest of each plugin folder, so a changed README alters it. A README there is not a page of the manual.
        const dir = repo({ 'test/plugins/shipped/shipped.test.ts': '// t\n', 'test/plugins/shipped/conformance.test.ts': '// t\n' });
        stage(dir, files);
        expect(which(commit(dir).out)).toEqual(['files']);
      },
      240_000,
    );

    it('asks for the whole suite when a commit changes vite.config.ts, which builds every bundle of the package but the plugins', () => {
      const dir = repo({ 'vite.config.ts': "export default { external: ['vite'] };\n" });
      stage(dir, { 'vite.config.ts': "export default { external: ['vite', 'cac'] };\n" });
      expect(which(commit(dir).out)).toEqual([]);
    }, 240_000);

    it('runs the tests that read the plugin build, and not the whole suite, when a commit changes it', () => {
      const dir = repo({
        'test/scripts/shipped-lock.test.ts': '// t\n',
        'test/plugins/shipped/conformance.test.ts': '// t\n',
        'test/plugins/shipped/print-book.test.ts': '// t\n',
      });
      stage(dir, { 'scripts/build-plugins.mjs': '// build\n' });
      expect(which(commit(dir).out)).toEqual(['files']);
    }, 240_000);

    it('runs no test for a deleted test file: there is nothing left to run', () => {
      const dir = repo({ 'test/gone.test.ts': '// gone\n' });
      git(dir, ['rm', '-q', 'test/gone.test.ts']);
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(which(result.out)).toEqual([]);
    }, 120_000);

    it('gives the related run the staged files that exist, and only those', () => {
      const manifest = JSON.parse(BASE['package.json']!);
      manifest.scripts['test:related'] =
        `node -e "const a = process.argv.slice(1); process.exit(a.includes('src/a.ts') && a.includes('test/x.test.ts') && !a.includes('README.md') && !a.includes('test/gone.test.ts') ? 0 : 1)" --`;
      const dir = repo({ 'package.json': JSON.stringify(manifest), 'test/gone.test.ts': '// gone\n' });
      git(dir, ['rm', '-q', 'test/gone.test.ts']);
      stage(dir, { 'src/a.ts': 'export const a: number = 14;\n', 'test/x.test.ts': '// t\n', 'README.md': '# r\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
    }, 120_000);

    it("runs the tests of a deleted file's kind: removing a doc runs the doc tests, removing a script runs the deck tests", () => {
      const docs = repo({ 'docs/manual/gone.md': '# gone\n' });
      git(docs, ['rm', '-q', 'docs/manual/gone.md']);
      expect(which(commit(docs).out)).toEqual(['docs']);
      const deck = repo({ 'scripts/gone.py': 'print(1)\n' });
      git(deck, ['rm', '-q', 'scripts/gone.py']);
      expect(which(commit(deck).out)).toEqual(['deck']);
    }, 240_000);

    it('fails the commit when a suite it runs fails, and says which', () => {
      const failing = (script: string) =>
        JSON.stringify({ ...JSON.parse(BASE['package.json']!), scripts: { ...JSON.parse(BASE['package.json']!).scripts, [script]: 'echo "a test failed" && exit 1' } });
      const cases: [string, Record<string, string>, string][] = [
        ['test:files', { '.githooks/note.sh': '#!/bin/sh\necho hi\n', 'test/hooks/keep.txt': 'x\n' }, '✗ tests: hooks and scripts'],
        ['test:related', { 'src/a.ts': 'export const a: number = 8;\n' }, '✗ tests: related to the staged files'],
        ['test:deck', { 'scripts/x.py': 'print(1)\n' }, '✗ tests: deck and plugins'],
        ['test:docs', { 'README.md': '# x\n' }, '✗ tests: manual and RFC'],
      ];
      for (const [script, files, label] of cases) {
        const dir = repo({ 'package.json': failing(script) });
        stage(dir, files);
        const result = commit(dir);
        expect(result.status, label).not.toBe(0);
        expect(result.out, label).toContain(label);
        expect(result.out, label).toContain('a test failed');
      }
    }, 240_000);
  });

  it('does not leak the git variables of the commit into the suites, which may run git of their own', () => {
    const manifest = JSON.parse(BASE['package.json']!);
    manifest.scripts['test:related'] = 'node -e "process.exit(process.env.GIT_INDEX_FILE || process.env.GIT_DIR || process.env.GIT_WORK_TREE ? 1 : 0)" --';
    const dir = repo({ 'package.json': JSON.stringify(manifest) });
    const env = { GIT_INDEX_FILE: path.join(dir, '.git', 'private-index') };
    expect(git(dir, ['read-tree', 'HEAD'], env).status).toBe(0);
    write(dir, { 'src/a.ts': 'export const a: number = 9;\n' });
    expect(git(dir, ['add', 'src/a.ts'], env).status).toBe(0);
    const result = commit(dir, env);
    expect(result.status, result.out).toBe(0);
  }, 120_000);

  describe('a tree that already passed', () => {
    const counting = (counter: string, exit = 0) => {
      const manifest = JSON.parse(BASE['package.json']!);
      manifest.scripts['test:related'] = `node -e "require('fs').appendFileSync('${counter}', 'r'); process.exit(${exit})" --`;
      return JSON.stringify(manifest);
    };
    const count = (counter: string) => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf-8').length : 0);
    const counterFile = () => path.join(tempDir('blazon-hook-count-'), 'count');

    it('is not tested again: the same staged tree after a reset runs the suite once', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 15;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
      git(dir, ['reset', '-q', '--soft', 'HEAD~1']);
      const again = commit(dir);
      expect(again.status, again.out).toBe(0);
      expect(count(counter)).toBe(1);
      expect(again.out).toContain('passed before');
    }, 120_000);

    it('is tested again when the same tree is reached by a change to other files', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 21;\n', 'src/b.ts': 'export const b: number = 22;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
      // The same tree again, but as a change to one file on a parent that already has the other
      git(dir, ['reset', '-q', '--hard', 'HEAD~1']);
      stage(dir, { 'src/a.ts': 'export const a: number = 21;\n' });
      expect(git(dir, ['commit', '-q', '--no-verify', '-m', 'half']).status).toBe(0);
      stage(dir, { 'src/b.ts': 'export const b: number = 22;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is tested again when the tree differs', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 16;\n' });
      expect(commit(dir).status).toBe(0);
      stage(dir, { 'src/a.ts': 'export const a: number = 17;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is not remembered when the suite failed', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter, 1) });
      stage(dir, { 'src/a.ts': 'export const a: number = 18;\n' });
      expect(commit(dir).status).not.toBe(0);
      expect(commit(dir).status).not.toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is remembered for the suite that passed and not for another: a docs run does not stand for a related run', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'README.md': '# one\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(0);
      stage(dir, { 'test/x.test.ts': '// t\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
    }, 120_000);

    it("is kept in the repository's common git folder, where every worktree finds it", () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 19;\n' });
      expect(commit(dir).status).toBe(0);
      const cache = path.join(dir, '.git', 'blazon-hook-cache');
      expect(fs.readdirSync(cache).length).toBeGreaterThan(0);
    }, 120_000);

    it('is ignored when BLAZON_HOOK_NO_CACHE is set', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 20;\n' });
      expect(commit(dir, { BLAZON_HOOK_NO_CACHE: '1' }).status).toBe(0);
      git(dir, ['reset', '-q', '--soft', 'HEAD~1']);
      expect(commit(dir, { BLAZON_HOOK_NO_CACHE: '1' }).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);
  });

  describe('what it says when a suite fails', () => {
    // The hook appends its arguments to the script, and `node -e` would take them for its own options: `--` ends them
    const noisy = (script: string) =>
      JSON.stringify({ ...JSON.parse(BASE['package.json']!), scripts: { ...JSON.parse(BASE['package.json']!).scripts, 'test:related': `${script} --` } });

    it('shows the failing test even when a hundred lines of banner and warnings come before it', () => {
      const dir = repo({
        'package.json': noisy(
          `node -e "for (let i = 0; i < 100; i++) console.log('Not implemented: scrollTo ' + i); console.log(String.fromCharCode(32, 215) + ' appears in the navigation only when the brand has motion tokens'); process.exit(1)"`,
        ),
      });
      stage(dir, { 'src/a.ts': 'export const a: number = 10;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('× appears in the navigation only when the brand has motion tokens');
      // The noise jsdom prints is not what the person reads
      expect(result.out).not.toContain('Not implemented: scrollTo 50');
    }, 120_000);

    it('shows the tail of an output that has no failing-test line, and says where the whole of it is', () => {
      const dir = repo({ 'package.json': noisy(`node -e "for (let i = 0; i < 100; i++) console.log('line ' + i); process.exit(1)"`) });
      stage(dir, { 'src/a.ts': 'export const a: number = 11;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('line 99');
      expect(result.out).not.toContain('line 10\n');
      const log = result.out.match(/full output: (\S+)/)?.[1];
      expect(log, result.out).toBeTruthy();
      expect(fs.readFileSync(log!, 'utf-8')).toContain('line 0');
    }, 120_000);

    it('runs the suites with at most four workers and one retry, so a busy machine does not fail a correct commit', () => {
      const checker = "process.exit(process.argv.includes('--maxWorkers=4') && process.argv.includes('--retry=1') ? 0 : 1)";
      const dir = repo({ 'package.json': noisy(`node -e "${checker}"`) });
      stage(dir, { 'src/a.ts': 'export const a: number = 12;\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
    }, 120_000);

    it('takes other arguments for the suites from BLAZON_HOOK_TEST_ARGS, and none when it is empty', () => {
      const checker = "process.exit(process.argv.includes('--maxWorkers=2') && !process.argv.includes('--retry=1') ? 0 : 1)";
      const dir = repo({ 'package.json': noisy(`node -e "${checker}"`) });
      stage(dir, { 'examples/x/blazon.json': '// 13\n' });
      const result = commit(dir, { BLAZON_HOOK_TEST_ARGS: '--maxWorkers=2' });
      expect(result.status, result.out).toBe(0);
    }, 120_000);
  });

  describe('the snapshot', () => {
    it('refuses to pass when the commit leaves nothing to check, rather than printing success', () => {
      const dir = repo();
      expect(git(dir, ['rm', '-q', 'package.json']).status).toBe(0);
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ snapshot');
      expect(result.out).not.toContain('✓');
    }, 120_000);

    it('says so when the checkout has no node_modules, and does not run the checks', () => {
      const dir = repo();
      fs.unlinkSync(path.join(dir, 'node_modules'));
      stage(dir, { 'src/a.ts': 'export const a: number = 7;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('npm install');
    }, 120_000);
  });

  describe('the install script, run by `npm run hooks`', () => {
    const INSTALL = path.join(REPO, 'scripts/install-hooks.mjs');
    const run = (cwd: string) => spawnSync(process.execPath, [INSTALL], { cwd, encoding: 'utf-8' });

    it('points core.hooksPath at .githooks in a git checkout', () => {
      const dir = repo();
      git(dir, ['config', '--unset', 'core.hooksPath']);
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(git(dir, ['config', 'core.hooksPath']).stdout.trim()).toBe('.githooks');
    });

    it('does nothing, and does not fail, outside a git checkout', () => {
      const dir = tempDir('blazon-nogit-');
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    const hooksPath = (dir: string) => git(dir, ['config', '--get', 'core.hooksPath']).stdout.trim();

    it('rewrites an absolute core.hooksPath to .githooks, and says what it replaced and why', () => {
      const dir = repo();
      git(dir, ['config', 'core.hooksPath', path.join(dir, '.githooks')]);
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(hooksPath(dir)).toBe('.githooks');
      expect(result.stderr).toContain(`core.hooksPath was ${path.join(dir, '.githooks')}; set to .githooks so a git worktree runs its own hooks`);
    });

    it('rewrites any other folder to .githooks', () => {
      const dir = repo();
      git(dir, ['config', 'core.hooksPath', 'elsewhere']);
      const result = run(dir);
      expect(hooksPath(dir)).toBe('.githooks');
      expect(result.stderr).toContain('core.hooksPath was elsewhere; set to .githooks');
    });

    it('leaves a core.hooksPath that is already .githooks alone, and prints no "was" line', () => {
      const dir = repo();
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(hooksPath(dir)).toBe('.githooks');
      expect(result.stderr).not.toContain('was');
    });

    it('does nothing, and does not fail, in a checkout with no .githooks folder', () => {
      const dir = tempDir('blazon-nohooks-');
      git(dir, ['init', '-q', '-b', 'main']);
      git(dir, ['config', 'core.hooksPath', '/somewhere/else']);
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(hooksPath(dir)).toBe('/somewhere/else');
      expect(result.stderr).toBe('');
    });

    it('makes a git worktree run its own .githooks, not the main checkout', () => {
      const main = tempDir('blazon-wt-main-');
      git(main, ['init', '-q', '-b', 'main']);
      const hook = (name: string) => `#!/bin/sh\necho ${name}-hook-ran\nexit 1\n`;
      write(main, { '.githooks/pre-commit': hook('main'), 'a.txt': 'a\n' });
      fs.chmodSync(path.join(main, '.githooks/pre-commit'), 0o755);
      git(main, ['add', '-A']);
      expect(git(main, ['commit', '-q', '--no-verify', '-m', 'base']).status).toBe(0);
      // the trap: an absolute path, shared by every worktree through .git/config
      git(main, ['config', 'core.hooksPath', path.join(main, '.githooks')]);
      const wt = path.join(tempDir('blazon-wt-'), 'tree');
      expect(git(main, ['worktree', 'add', '-q', wt, '-b', 'wt']).status).toBe(0);
      const hooksIn = () => git(wt, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']).stdout.trim();
      expect(hooksIn()).toBe(path.join(main, '.githooks'));

      expect(run(wt).status).toBe(0);
      expect(fs.realpathSync(hooksIn())).toBe(fs.realpathSync(path.join(wt, '.githooks')));
      // a hook that exists only in the worktree runs on a commit there
      fs.writeFileSync(path.join(wt, '.githooks/pre-commit'), hook('worktree'));
      write(wt, { 'b.txt': 'b\n' });
      git(wt, ['add', 'b.txt']);
      const result = commit(wt);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('worktree-hook-ran');
      expect(result.out).not.toContain('main-hook-ran');
    });

    it('is the hooks script, not a prepare script (the published manifest must carry none), and the suites the hook names are scripts of the package', () => {
      const scripts = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')).scripts;
      expect(scripts.hooks).toBe('node scripts/install-hooks.mjs');
      expect(scripts.prepare).toBeUndefined();
      for (const name of ['typecheck', 'test', 'test:deck', 'test:docs']) expect(scripts[name], name).toBeTruthy();
      // The suites it runs for a docs-only commit and a scripts-only commit are real test files
      for (const file of scripts['test:docs'].replace('vitest run ', '').split(' ').concat(scripts['test:deck'].replace('vitest run ', '').split(' '))) {
        expect(fs.existsSync(path.join(REPO, file)), file).toBe(true);
      }
    });
  });

  it('is skipped by `git commit --no-verify`, the way out the hook names', () => {
    const dir = repo();
    stage(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
    const result = commit(dir, {}, ['--no-verify']);
    expect(result.status, result.out).toBe(0);
  }, 120_000);
});
