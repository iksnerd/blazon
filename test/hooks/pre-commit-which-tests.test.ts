import { describe, it, expect } from 'vitest';
import { BASE, commit, repo, stage, which } from '../support/hook-commit';

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
      ['a script in TypeScript', { 'scripts/x.ts': '// script\n' }, []],
      ['the generator of the finding tables, whose output the docs tests compare', { 'scripts/gen-checks-docs.ts': '// generator\n' }, ['docs']],
      ['a file the mapping does not know', { 'mystery.bin': 'x\n' }, []],
      ['a Python script', { 'scripts/x.py': 'print(1)\n' }, ['deck']],
      ['a Python launcher with no extension', { 'scripts/blazon-blazon.x': '#!/usr/bin/env python3\nprint(1)\n' }, ['deck']],
      ['a file in test/deck/python/', { 'test/deck/python/x.py': 'print(1)\n' }, ['deck']],
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
