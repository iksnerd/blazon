import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { BASE, commit, repo, stage, write, git, counting, count, counterFile } from '../support/hook-commit';

// The pre-commit hook's memory of a tree that already passed (part 1 of 2; the rest is in pre-commit-rest), and the git variables of a private index.

describe('the pre-commit hook', () => {
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
  });
});
