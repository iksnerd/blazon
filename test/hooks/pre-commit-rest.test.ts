import { describe, it, expect } from 'vitest';
import { tempDir } from '../support/project';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { BASE, commit, repo, stage, write, git, counting, count, counterFile } from '../support/hook-commit';

// The rest of the pre-commit hook: where the memory of a passed tree lives and when it is ignored (part 2 of 2; part 1 is pre-commit-cache), what it says when
// a suite fails, the snapshot, the install script run by `npm run hooks`, and `--no-verify`.

describe('the pre-commit hook', () => {
  describe('a tree that already passed', () => {
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
