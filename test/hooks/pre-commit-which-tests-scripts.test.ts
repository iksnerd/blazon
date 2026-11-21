import { describe, it, expect } from 'vitest';
import { commit, repo, stage, which } from '../support/hook-commit';

// Which tests the pre-commit hook runs for staged paths, part 2 of 3: scripts, the table generators and Python files.

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
    it.each([
      ['a script in TypeScript', { 'scripts/x.ts': '// script\n' }, []],
      ['the generator of the finding tables, whose output the docs tests compare', { 'scripts/gen-checks-docs.ts': '// generator\n' }, ['docs']],
      ['the generator of the layers diagram and its rules', { 'scripts/layers.json': '{}\n' }, ['docs']],
      ['a file the mapping does not know', { 'mystery.bin': 'x\n' }, []],
      ['a Python script', { 'scripts/x.py': 'print(1)\n' }, ['deck']],
      ['a Python launcher with no extension', { 'scripts/blazon-blazon.x': '#!/usr/bin/env python3\nprint(1)\n' }, ['deck']],
      ['a file in test/deck/python/', { 'test/deck/python/x.py': 'print(1)\n' }, ['deck']],
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
