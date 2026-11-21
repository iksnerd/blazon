import { describe, it, expect } from 'vitest';
import { commit, repo, stage, LINT_BROKEN as broken } from '../support/hook-commit';

// Which files the pre-commit lint step reads (part 2 of 3): only the staged files, and the whole tree for a change other files depend on.

describe('the pre-commit hook', () => {
  describe('lint', () => {
    describe('which files', () => {
      it('lints only the staged files for a change no other file depends on, so an unstaged mistake waits for the push', () => {
        const dir = repo(broken);
        stage(dir, { 'test/x.test.ts': '// t\n' });
        const result = commit(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('✓ lint: staged files');
      }, 120_000);

      it('fails a staged file with a mistake, in the files-only run', () => {
        const dir = repo();
        stage(dir, { 'test/x.test.ts': '// LINT_ERROR\n' });
        const result = commit(dir);
        expect(result.status).not.toBe(0);
        expect(result.out).toContain('✗ lint: staged files');
      }, 120_000);

      it.each([
        ['a file in src/ that other folders import', { 'src/c.ts': 'export const c: number = 1;\n' }],
        ['a declaration file', { 'types.d.ts': 'declare const x: number;\n' }],
        ['the ESLint config', { 'eslint.config.js': '// cfg\n' }],
        [
          'a tsconfig',
          {
            'tsconfig.json': JSON.stringify({
              compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true },
              include: ['src'],
            }),
          },
        ],
      ])(
        'lints the whole tree for %s, and so finds the mistake nobody staged',
        (_what, files) => {
          const dir = repo(broken);
          stage(dir, files);
          const result = commit(dir);
          expect(result.status).not.toBe(0);
          expect(result.out).toContain('✗ lint');
          expect(result.out).not.toContain('lint: staged files');
        },
        120_000,
      );
    });
  });
});
