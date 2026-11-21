import { describe, it, expect } from 'vitest';
import { commit, repo, stage, which } from '../support/hook-commit';

// Which tests the pre-commit hook runs for staged paths, part 3 of 3: docs, README, .github, mixed commits and config files no test reads.

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
    it.each([
      ['a page in docs/', { 'docs/manual/x.md': '# x\n' }, ['docs']],
      ['the README', { 'README.md': '# changed\n' }, ['docs']],
      ['CONTRIBUTING.md', { 'CONTRIBUTING.md': '# contributing\n' }, ['docs']],
      ['a file in .github/', { '.github/pull_request_template.md': 'x\n' }, ['docs']],
      ['docs and a Python script', { 'README.md': '# again\n', 'scripts/y.py': 'print(2)\n' }, ['deck', 'docs']],
      ['source and docs', { 'src/a.ts': 'export const a: number = 6;\n', 'README.md': '# again\n' }, ['related', 'docs']],
      ['a test and a Python script', { 'test/x.test.ts': '// t\n', 'scripts/y.py': 'print(2)\n' }, ['related', 'deck']],
      ['source and an example', { 'src/a.ts': 'export const a: number = 6;\n', 'examples/x/blazon.json': '// c\n' }, ['related', 'docs']],
      ['the ESLint config, which no test reads', { 'eslint.config.js': '// cfg\n' }, []],
      ['the Prettier ignore file', { '.prettierignore': 'dist/\n' }, []],
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
