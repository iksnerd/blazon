import { describe, it, expect } from 'vitest';
import { git, counterFile, count, suiteArgs, manifest, write, clone, commit, push, remoteHead } from '../support/hook-push';

describe('the pre-push hook', () => {
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
        commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
        const result = push(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('✓ tests: full suite');
        expect(suiteArgs(counter).join('\n')).toContain(HOOKS_EXCLUDED);
      }, 120_000);

      it.each([
        ['a hook', { 'examples/x/blazon.json': '// a brand\n', '.githooks/note.sh': '#!/bin/sh\necho hi\n' }],
        ['the install script', { 'examples/x/blazon.json': '// a brand\n', 'scripts/install-hooks.mjs': '// install\n' }],
        ['a test of the hooks', { 'examples/x/blazon.json': '// a brand\n', 'test/hooks/x.test.ts': '// t\n' }],
        ['package.json, which can change the tools they run', { 'examples/x/blazon.json': '// a brand\n', 'package-lock.json': '{}\n' }],
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
      commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
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
});
