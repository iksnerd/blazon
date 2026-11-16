import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import { BASE, commit, head, ran, repo, stage, write } from '../support/hook-commit';

describe('the pre-commit hook', () => {
  describe('format', () => {
    it('passes staged code that is formatted, and says it ran', () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'format')).toBe(true);
    }, 120_000);

    it('fails staged code the formatter would change, names the step, and makes no commit', () => {
      const dir = repo();
      const before = head(dir);
      stage(dir, { 'src/a.ts': 'export const a: number = 2; // FORMAT_ERROR\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ format');
      expect(head(dir)).toBe(before);
    }, 120_000);

    it('checks what is staged, not the working tree, and only the code files', () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 2; // FORMAT_ERROR\n' });
      write(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
      expect(commit(dir).status).not.toBe(0);

      const docs = repo();
      stage(docs, { 'README.md': '# FORMAT_ERROR is only a word in a Markdown file\n' });
      const result = commit(docs);
      expect(result.status, result.out).toBe(0);
      expect(result.out).not.toContain('format');
    }, 240_000);
  });

  describe('lint', () => {
    it('passes a staged change with nothing to report, and says it ran', () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'lint')).toBe(true);
    }, 120_000);

    it('fails a staged change the linter refuses, names the step, and makes no commit', () => {
      const dir = repo();
      const before = head(dir);
      stage(dir, { 'src/a.ts': 'export const a: number = 2; // LINT_ERROR\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ lint');
      expect(result.out).toContain('--no-verify');
      expect(head(dir)).toBe(before);
    }, 120_000);

    it('is not rescued by an unstaged fix: it lints what is staged, not the working tree', () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 2; // LINT_ERROR\n' });
      write(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ lint');
    }, 120_000);

    // Ruff runs through uv; a machine without it skips the step and says so
    const uv = spawnSync('uvx', ['--version']).status === 0;
    it.skipIf(!uv)(
      'lints staged Python with the project script, and fails the commit when it fails',
      () => {
        const ok = repo();
        stage(ok, { 'scripts/ok.py': 'print("ok")\n' });
        const passed = commit(ok);
        expect(passed.status, passed.out).toBe(0);
        expect(ran(passed.out, 'python lint')).toBe(true);

        const failing = repo({
          'package.json': JSON.stringify({
            ...JSON.parse(BASE['package.json']!),
            scripts: { ...JSON.parse(BASE['package.json']!).scripts, 'lint:py': 'echo "ruff found one"; exit 1' },
          }),
        });
        stage(failing, { 'scripts/ok.py': 'print("ok")\n' });
        const refused = commit(failing);
        expect(refused.status).not.toBe(0);
        expect(refused.out).toContain('✗ python lint');
      },
      240_000,
    );
  });
});
