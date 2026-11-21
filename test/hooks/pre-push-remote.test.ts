import { describe, it, expect } from 'vitest';
import { git, counterFile, count, manifest, write, commit, push, remoteHead, seeded } from '../support/hook-push';

// The pre-push hook on a remote that already holds the branch (part 1 of 2; the tests of the hooks themselves are in pre-push-remote-hooks): which suites a push runs.

describe('the pre-push hook', () => {
  describe('on a remote that already holds the branch', () => {
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
