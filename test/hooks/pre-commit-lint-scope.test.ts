import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import { BASE, commit, ran, repo, stage, LINT_BROKEN as broken } from '../support/hook-commit';

// The scope of the pre-commit lint step (part 3 of 3): a folder run for src/cli, nothing ESLint reads, and Python through the project script.

describe('the pre-commit hook', () => {
  describe('lint', () => {
    describe('which files', () => {
      it('lints the folder for a change in src/cli, not the whole tree', () => {
        const dir = repo({ 'src/cli/old.ts': 'export const o = 1;\n' });
        stage(dir, { 'src/cli/new.ts': 'export const n = 1;\n' });
        const result = commit(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('✓ lint: staged files');
      }, 120_000);

      it('says so when no staged file is one ESLint reads', () => {
        const dir = repo(broken);
        stage(dir, { 'README.md': '# changed\n' });
        const result = commit(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('no staged file ESLint reads');
      }, 120_000);
    });

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
