import { describe, it, expect } from 'vitest';
import { BASE, commit, repo, stage, which, git } from '../support/hook-commit';

// Which tests a commit runs, part 2 of 2 (the other half is pre-commit-which-hooks): deleted files, the arguments the related run gets,
// and a failing suite.

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
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
});
