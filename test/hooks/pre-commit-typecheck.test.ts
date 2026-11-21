import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { commit, head, ran, repo, stage, write, git } from '../support/hook-commit';

// The pre-commit hook typecheck step (part 1 of 2; the checks on staged scripts, the secret scan, the starter and the MCP workspace are in pre-commit-script-checks).

describe('the pre-commit hook', () => {
  describe('typecheck', () => {
    it('passes a staged change that is valid, and the commit is made', () => {
      const dir = repo();
      const before = head(dir);
      stage(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'typecheck')).toBe(true);
      expect(head(dir)).not.toBe(before);
    }, 120_000);

    it('fails a staged type error, names the step, and makes no commit', () => {
      const dir = repo();
      const before = head(dir);
      stage(dir, { 'src/a.ts': 'export const a: number = "not a number";\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ typecheck');
      expect(result.out).toContain('--no-verify');
      expect(head(dir)).toBe(before);
    }, 120_000);

    it('is not rescued by an unstaged fix: it tests what is staged, not the working tree', () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
      write(dir, { 'src/a.ts': 'export const a: number = 1;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ typecheck');
    }, 120_000);

    it('is not rescued by an untracked file the staged code imports', () => {
      const dir = repo();
      stage(dir, { 'src/c.ts': "import { d } from './d';\nexport const c: number = d;\n" });
      write(dir, { 'src/d.ts': 'export const d: number = 4;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ typecheck');
    }, 120_000);

    it('counts a deletion: a commit that only removes a file other code imports fails', () => {
      const dir = repo();
      expect(git(dir, ['rm', '-q', 'src/a.ts']).status).toBe(0);
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ typecheck');
    }, 120_000);
  });

  describe('a commit made with a private index and a plain `git commit`', () => {
    it('is checked too, and fails on a staged error', () => {
      const dir = repo();
      const index = path.join(dir, '.git', 'private-index');
      const env = { GIT_INDEX_FILE: index };
      expect(git(dir, ['read-tree', 'HEAD'], env).status).toBe(0);
      write(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
      expect(git(dir, ['add', 'src/a.ts'], env).status).toBe(0);
      const result = commit(dir, env);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ typecheck');
    }, 120_000);

    it('passes a valid one, and the commit is made from that index', () => {
      const dir = repo();
      const index = path.join(dir, '.git', 'private-index');
      const env = { GIT_INDEX_FILE: index };
      const before = head(dir);
      expect(git(dir, ['read-tree', 'HEAD'], env).status).toBe(0);
      write(dir, { 'src/a.ts': 'export const a: number = 3;\n' });
      expect(git(dir, ['add', 'src/a.ts'], env).status).toBe(0);
      const result = commit(dir, env);
      expect(result.status, result.out).toBe(0);
      expect(head(dir)).not.toBe(before);
    }, 120_000);
  });
});
