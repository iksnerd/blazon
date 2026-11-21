import { describe, it, expect } from 'vitest';
import { BASE, commit, repo, stage, which } from '../support/hook-commit';

// Which tests the pre-commit hook runs for staged paths, part 1 of 3: files in src/, test/, test/support/, examples/ and package.json.
// The table is split with pre-commit-which-tests-scripts and pre-commit-which-tests-docs so that vitest runs the three on separate workers.

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
    it.each([
      ['a file in src/', { 'src/a.ts': 'export const a: number = 5;\n' }, ['related', 'docs']],
      ['a file in test/', { 'test/x.test.ts': '// a test\n' }, ['related']],
      ['a support file in test/', { 'test/support/x.ts': '// helper\n' }, ['related']],
      ['a file in examples/', { 'examples/x/blazon.json': '// config\n' }, []],
      ['a golden under test/, which a test reads by path and imports never reach', { 'test/examples/golden/x/check.json': '{}\n' }, []],
      ['a fixture under test/support/', { 'test/support/fixture.json': '{}\n' }, []],
      ['package.json', { 'package.json': BASE['package.json']!.replace('throwaway', 'throwaway2') }, []],
    ])(
      '%s runs %j',
      (_what, files, expected) => {
        const dir = repo();
        stage(dir, files);
        const result = commit(dir);
        expect(result.status, result.out).toBe(0);
        expect(which(result.out).sort()).toEqual([...expected].sort());
      },
      240_000,
    );
  });
});
