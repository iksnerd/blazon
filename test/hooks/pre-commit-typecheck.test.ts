import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { commit, gitleaks, head, ran, repo, stage, write, git } from '../support/hook-commit';

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

  describe('the cheap checks on staged scripts', () => {
    it('fails a shell script with a syntax error', () => {
      const dir = repo();
      stage(dir, { 'scripts/broken.sh': '#!/bin/sh\nif true; then\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ shell syntax');
    }, 120_000);

    it('passes a shell script that parses', () => {
      const dir = repo();
      stage(dir, { 'scripts/ok.sh': '#!/bin/sh\nif true; then echo ok; fi\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'shell syntax')).toBe(true);
    }, 120_000);

    it('fails a Python file with a syntax error, and one with no .py name but a python shebang', () => {
      for (const name of ['scripts/broken.py', 'scripts/blazon-thing']) {
        const dir = repo();
        stage(dir, { [name]: '#!/usr/bin/env python3\ndef (:\n' });
        const result = commit(dir);
        expect(result.status, name).not.toBe(0);
        expect(result.out, name).toContain('✗ python syntax');
      }
    }, 240_000);

    it('passes Python that parses, and writes no bytecode into the repo', () => {
      const dir = repo();
      stage(dir, { 'scripts/ok.py': 'print("ok")\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'python syntax')).toBe(true);
      expect(fs.existsSync(path.join(dir, 'scripts/__pycache__'))).toBe(false);
    }, 120_000);
  });

  describe.skipIf(!gitleaks)('the secret scan', () => {
    it('fails a staged file that holds a token, and does not print the token', () => {
      const dir = repo();
      const token = `ghp_${'R7qLm2xPz9KdVt4NwYb8HcJf3UgSe6AaQoZi'}`;
      stage(dir, { 'notes.txt': `token = "${token}"\n` });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ secret scan');
      // It says where, so the file can be fixed, and the token itself is not printed
      expect(result.out).toContain('notes.txt');
      expect(result.out).toContain('github-pat');
      expect(result.out).not.toContain(token);
    }, 120_000);

    it('passes a commit with no secret', () => {
      const dir = repo();
      stage(dir, { 'notes.txt': 'nothing to see\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(ran(result.out, 'secret scan')).toBe(true);
    }, 120_000);
  });

  describe('the starter', () => {
    // classify_paths is the hook's table from a staged path to the tests that run. It is called here on the real tree, whose tests exist.
    const classify = (staged: string) => {
      const ran = spawnSync('bash', ['-c', `. .githooks/lib.sh; classify_paths "$PWD" <<< "$1"; echo "full=$full"; echo "extra=$extra_tests"`, 'bash', staged], {
        cwd: REPO,
        encoding: 'utf-8',
      });
      expect(ran.status, ran.stderr).toBe(0);
      return { full: /^full=(\d)$/m.exec(ran.stdout)?.[1], extra: (/^extra=(.*)$/m.exec(ran.stdout)?.[1] ?? '').split(' ').filter(Boolean) };
    };

    it('selects the tests that start from the starter when a file of examples/blazon/ is staged, and still asks for the full suite at push', () => {
      const { full, extra } = classify('examples/blazon/docs/11-voice.md');
      expect(full).toBe('1');
      expect(extra).toEqual(
        expect.arrayContaining(['test/core/starter.test.ts', 'test/build', 'test/init', 'test/brand', 'test/viewer/viewer-docs.test.tsx', 'test/plugins/roles']),
      );
    });

    it('selects none of them for another example, which no test starts from', () => {
      expect(classify('examples/conformance/docs/01-intro.md')).toEqual({ full: '1', extra: [] });
    });
  });

  describe('the MCP workspace', () => {
    const classify = (staged: string) => {
      const ran = spawnSync('bash', ['-c', `. .githooks/lib.sh; classify_paths "$PWD" <<< "$1"; echo "full=$full"; echo "docs=$docs"; echo "extra=$extra_tests"`, 'bash', staged], {
        cwd: REPO,
        encoding: 'utf-8',
      });
      expect(ran.status, ran.stderr).toBe(0);
      return {
        full: /^full=(\d)$/m.exec(ran.stdout)?.[1],
        docs: /^docs=(\d)$/m.exec(ran.stdout)?.[1],
        extra: (/^extra=(.*)$/m.exec(ran.stdout)?.[1] ?? '').split(' ').filter(Boolean),
      };
    };

    it.each(['mcp/src/server.ts', 'mcp/test/server.test.ts'])('runs the MCP tests, and nothing else, for %s', (staged) => {
      expect(classify(staged)).toEqual({ full: '0', docs: '0', extra: ['mcp/test'] });
    });

    it('runs the MCP tests for a change to a command line command or a read function it wraps', () => {
      expect(classify('src/cli/commands/can.ts').extra).toContain('mcp/test');
      expect(classify('src/core/read/rules.ts').extra).toContain('mcp/test');
    });

    it('asks for the whole suite for its package file or its build config, and for the docs for its README', () => {
      expect(classify('mcp/package.json').full).toBe('1');
      expect(classify('mcp/tsconfig.build.json').full).toBe('1');
      expect(classify('mcp/README.md')).toMatchObject({ full: '0', docs: '1' });
    });
  });
});
