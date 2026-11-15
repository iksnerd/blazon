import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// .githooks/pre-commit is the gate on every commit (CI also runs on pull requests, but does not replace the hook). It tests the staged
// snapshot, not the working tree. Each test makes a throwaway git repo with the real hook and a few tiny files, stages
// something, and runs a real `git commit`, so the exit status and the output are the hook's own.

const HOOKS = path.join(REPO, '.githooks');
const gitleaks = spawnSync('gitleaks', ['version']).status === 0;
// A missing gitleaks skips its test and says so; set BLAZON_REQUIRE_GITLEAKS=1 where it is installed and a missing one fails.
if (!gitleaks && process.env.BLAZON_REQUIRE_GITLEAKS) throw new Error('BLAZON_REQUIRE_GITLEAKS is set, and gitleaks is not installed');
if (!gitleaks) console.warn('pre-commit hook test: the secret scan test is skipped, gitleaks is not installed');

const BASE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'throwaway',
    private: true,
    scripts: {
      typecheck: 'tsc --noEmit -p .',
      lint: 'node lint.js',
      'format:files': 'node format.js',
      'lint:py': 'echo ruff',
      test: 'echo full',
      'test:related': 'echo related',
      'test:deck': 'echo deck',
      'test:docs': 'echo docs',
      'test:files': 'echo files',
    },
  }),
  // Stands for ESLint: it fails when a file under src/ holds the word LINT_ERROR
  'lint.js':
    "const fs = require('fs'); const bad = fs.readdirSync('src').filter((f) => fs.readFileSync('src/' + f, 'utf8').includes('LINT_ERROR')); if (bad.length) { console.log('lint error in ' + bad.join(', ')); process.exit(1); }\n",
  // Stands for Prettier: it fails when a file it is given holds the word FORMAT_ERROR
  'format.js':
    "const fs = require('fs'); const bad = process.argv.slice(2).filter((f) => fs.readFileSync(f, 'utf8').includes('FORMAT_ERROR')); if (bad.length) { console.log('not formatted: ' + bad.join(', ')); process.exit(1); }\n",
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler' }, include: ['src'] }),
  '.gitignore': 'node_modules\n',
  'src/a.ts': 'export const a: number = 1;\n',
  'src/b.ts': "import { a } from './a';\nexport const b: number = a;\n",
  'README.md': '# throwaway\n',
};

// The hook of the repository being committed may be running these tests with its own BLAZON_HOOK_TEST_ARGS: the throwaway repos get the defaults
const { BLAZON_HOOK_TEST_ARGS: _outer, ...inherited } = process.env;
const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...inherited, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env },
  });

/** A repo with the real hook installed and BASE committed (without the hook). */
function repo(extra: Record<string, string> = {}): string {
  const dir = tempDir('blazon-hook-');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(dir, '.githooks'));
  // The whole hooks folder, as installed: pre-commit and pre-push share lib.sh
  for (const name of fs.readdirSync(HOOKS)) {
    fs.copyFileSync(path.join(HOOKS, name), path.join(dir, '.githooks', name));
    fs.chmodSync(path.join(dir, '.githooks', name), 0o755);
  }
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  write(dir, { ...BASE, ...extra });
  git(dir, ['add', '-A']);
  const base = git(dir, ['commit', '-q', '--no-verify', '-m', 'base']);
  expect(base.status, base.stderr).toBe(0);
  return dir;
}
const write = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
};
const stage = (dir: string, files: Record<string, string>) => {
  write(dir, files);
  const added = git(dir, ['add', ...Object.keys(files)]);
  expect(added.status, added.stderr).toBe(0);
};
const head = (dir: string) => git(dir, ['rev-parse', 'HEAD']).stdout.trim();
/** `git commit` with the hook, and what it printed. */
const commit = (dir: string, env: Record<string, string> = {}, extra: string[] = []) => {
  const result = git(dir, ['commit', '-m', 'change', ...extra], env);
  return { status: result.status, out: result.stdout + result.stderr };
};
const ran = (out: string, label: string) => out.includes(`✓ ${label}`);

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

  describe('which tests a commit runs, by what is staged', () => {
    const labels = {
      full: 'tests: full suite',
      related: 'tests: related to the staged files',
      deck: 'tests: deck and plugins',
      docs: 'tests: manual and RFC',
      files: 'tests: hooks and scripts',
    };
    const which = (out: string) => (Object.entries(labels) as [keyof typeof labels, string][]).filter(([, label]) => ran(out, label)).map(([key]) => key);

    it.each([
      ['a file in src/', { 'src/a.ts': 'export const a: number = 5;\n' }, ['related', 'docs']],
      ['a file in test/', { 'test/x.test.ts': '// a test\n' }, ['related']],
      ['a support file in test/', { 'test/support/x.ts': '// helper\n' }, ['related']],
      ['a file in examples/', { 'examples/x/blazon.config.ts': '// config\n' }, []],
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
      ['source and an example', { 'src/a.ts': 'export const a: number = 6;\n', 'examples/x/blazon.config.ts': '// c\n' }, ['related', 'docs']],
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

    it('says the full suite waits for the push, for a path that asks for it', () => {
      const dir = repo();
      stage(dir, { 'examples/x/blazon.config.ts': '// config\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('the full suite runs at push, not at commit');
    }, 120_000);

    it('runs only the tests that read a hook or a script by name', () => {
      const hooks = repo({ 'test/hooks/keep.txt': 'x\n' });
      stage(hooks, { '.githooks/note.sh': '#!/bin/sh\necho hi\n' });
      expect(which(commit(hooks).out)).toEqual(['files']);
      const lock = repo({ 'test/scripts/shipped-lock.test.ts': '// t\n' });
      stage(lock, { 'scripts/shipped-lock.mjs': '// lock\n' });
      expect(which(commit(lock).out)).toEqual(['files']);
    }, 240_000);

    it.each([
      ['a README in a plugin folder', { 'plugins/blazon.x/README.md': '# changed\n' }],
      ['a package.json in a plugin folder', { 'plugins/blazon.x/package.json': '{"type":"commonjs"}\n' }],
    ])(
      'runs the tests that check the lock against the plugin folders, for %s, and not the manual tests',
      (_what, files) => {
        // The lock holds a digest of each plugin folder, so a changed README alters it. A README there is not a page of the manual.
        const dir = repo({ 'test/plugins/shipped/shipped.test.ts': '// t\n', 'test/plugins/shipped/conformance.test.ts': '// t\n' });
        stage(dir, files);
        expect(which(commit(dir).out)).toEqual(['files']);
      },
      240_000,
    );

    it('asks for the whole suite when a commit changes vite.config.ts, which builds every bundle of the package but the plugins', () => {
      const dir = repo({ 'vite.config.ts': "export default { external: ['vite'] };\n" });
      stage(dir, { 'vite.config.ts': "export default { external: ['vite', 'cac'] };\n" });
      expect(which(commit(dir).out)).toEqual([]);
    }, 240_000);

    it('runs the tests that read the plugin build, and not the whole suite, when a commit changes it', () => {
      const dir = repo({
        'test/scripts/shipped-lock.test.ts': '// t\n',
        'test/plugins/shipped/conformance.test.ts': '// t\n',
        'test/plugins/shipped/print-book.test.ts': '// t\n',
      });
      stage(dir, { 'scripts/build-plugins.mjs': '// build\n' });
      expect(which(commit(dir).out)).toEqual(['files']);
    }, 240_000);

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

  it('does not leak the git variables of the commit into the suites, which may run git of their own', () => {
    const manifest = JSON.parse(BASE['package.json']!);
    manifest.scripts['test:related'] = 'node -e "process.exit(process.env.GIT_INDEX_FILE || process.env.GIT_DIR || process.env.GIT_WORK_TREE ? 1 : 0)" --';
    const dir = repo({ 'package.json': JSON.stringify(manifest) });
    const env = { GIT_INDEX_FILE: path.join(dir, '.git', 'private-index') };
    expect(git(dir, ['read-tree', 'HEAD'], env).status).toBe(0);
    write(dir, { 'src/a.ts': 'export const a: number = 9;\n' });
    expect(git(dir, ['add', 'src/a.ts'], env).status).toBe(0);
    const result = commit(dir, env);
    expect(result.status, result.out).toBe(0);
  }, 120_000);

  describe('a tree that already passed', () => {
    const counting = (counter: string, exit = 0) => {
      const manifest = JSON.parse(BASE['package.json']!);
      manifest.scripts['test:related'] = `node -e "require('fs').appendFileSync('${counter}', 'r'); process.exit(${exit})" --`;
      return JSON.stringify(manifest);
    };
    const count = (counter: string) => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf-8').length : 0);
    const counterFile = () => path.join(tempDir('blazon-hook-count-'), 'count');

    it('is not tested again: the same staged tree after a reset runs the suite once', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 15;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
      git(dir, ['reset', '-q', '--soft', 'HEAD~1']);
      const again = commit(dir);
      expect(again.status, again.out).toBe(0);
      expect(count(counter)).toBe(1);
      expect(again.out).toContain('passed before');
    }, 120_000);

    it('is tested again when the same tree is reached by a change to other files', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 21;\n', 'src/b.ts': 'export const b: number = 22;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
      // The same tree again, but as a change to one file on a parent that already has the other
      git(dir, ['reset', '-q', '--hard', 'HEAD~1']);
      stage(dir, { 'src/a.ts': 'export const a: number = 21;\n' });
      expect(git(dir, ['commit', '-q', '--no-verify', '-m', 'half']).status).toBe(0);
      stage(dir, { 'src/b.ts': 'export const b: number = 22;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is tested again when the tree differs', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 16;\n' });
      expect(commit(dir).status).toBe(0);
      stage(dir, { 'src/a.ts': 'export const a: number = 17;\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is not remembered when the suite failed', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter, 1) });
      stage(dir, { 'src/a.ts': 'export const a: number = 18;\n' });
      expect(commit(dir).status).not.toBe(0);
      expect(commit(dir).status).not.toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);

    it('is remembered for the suite that passed and not for another: a docs run does not stand for a related run', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'README.md': '# one\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(0);
      stage(dir, { 'test/x.test.ts': '// t\n' });
      expect(commit(dir).status).toBe(0);
      expect(count(counter)).toBe(1);
    }, 120_000);

    it("is kept in the repository's common git folder, where every worktree finds it", () => {
      const dir = repo();
      stage(dir, { 'src/a.ts': 'export const a: number = 19;\n' });
      expect(commit(dir).status).toBe(0);
      const cache = path.join(dir, '.git', 'blazon-hook-cache');
      expect(fs.readdirSync(cache).length).toBeGreaterThan(0);
    }, 120_000);

    it('is ignored when BLAZON_HOOK_NO_CACHE is set', () => {
      const counter = counterFile();
      const dir = repo({ 'package.json': counting(counter) });
      stage(dir, { 'src/a.ts': 'export const a: number = 20;\n' });
      expect(commit(dir, { BLAZON_HOOK_NO_CACHE: '1' }).status).toBe(0);
      git(dir, ['reset', '-q', '--soft', 'HEAD~1']);
      expect(commit(dir, { BLAZON_HOOK_NO_CACHE: '1' }).status).toBe(0);
      expect(count(counter)).toBe(2);
    }, 120_000);
  });

  describe('what it says when a suite fails', () => {
    // The hook appends its arguments to the script, and `node -e` would take them for its own options: `--` ends them
    const noisy = (script: string) =>
      JSON.stringify({ ...JSON.parse(BASE['package.json']!), scripts: { ...JSON.parse(BASE['package.json']!).scripts, 'test:related': `${script} --` } });

    it('shows the failing test even when a hundred lines of banner and warnings come before it', () => {
      const dir = repo({
        'package.json': noisy(
          `node -e "for (let i = 0; i < 100; i++) console.log('Not implemented: scrollTo ' + i); console.log(String.fromCharCode(32, 215) + ' appears in the navigation only when the brand has motion tokens'); process.exit(1)"`,
        ),
      });
      stage(dir, { 'src/a.ts': 'export const a: number = 10;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('× appears in the navigation only when the brand has motion tokens');
      // The noise jsdom prints is not what the person reads
      expect(result.out).not.toContain('Not implemented: scrollTo 50');
    }, 120_000);

    it('shows the tail of an output that has no failing-test line, and says where the whole of it is', () => {
      const dir = repo({ 'package.json': noisy(`node -e "for (let i = 0; i < 100; i++) console.log('line ' + i); process.exit(1)"`) });
      stage(dir, { 'src/a.ts': 'export const a: number = 11;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('line 99');
      expect(result.out).not.toContain('line 10\n');
      const log = result.out.match(/full output: (\S+)/)?.[1];
      expect(log, result.out).toBeTruthy();
      expect(fs.readFileSync(log!, 'utf-8')).toContain('line 0');
    }, 120_000);

    it('runs the suites with at most four workers and one retry, so a busy machine does not fail a correct commit', () => {
      const checker = "process.exit(process.argv.includes('--maxWorkers=4') && process.argv.includes('--retry=1') ? 0 : 1)";
      const dir = repo({ 'package.json': noisy(`node -e "${checker}"`) });
      stage(dir, { 'src/a.ts': 'export const a: number = 12;\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
    }, 120_000);

    it('takes other arguments for the suites from BLAZON_HOOK_TEST_ARGS, and none when it is empty', () => {
      const checker = "process.exit(process.argv.includes('--maxWorkers=2') && !process.argv.includes('--retry=1') ? 0 : 1)";
      const dir = repo({ 'package.json': noisy(`node -e "${checker}"`) });
      stage(dir, { 'examples/x/blazon.config.ts': '// 13\n' });
      const result = commit(dir, { BLAZON_HOOK_TEST_ARGS: '--maxWorkers=2' });
      expect(result.status, result.out).toBe(0);
    }, 120_000);
  });

  describe('the snapshot', () => {
    it('refuses to pass when the commit leaves nothing to check, rather than printing success', () => {
      const dir = repo();
      expect(git(dir, ['rm', '-q', 'package.json']).status).toBe(0);
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('✗ snapshot');
      expect(result.out).not.toContain('✓');
    }, 120_000);

    it('says so when the checkout has no node_modules, and does not run the checks', () => {
      const dir = repo();
      fs.unlinkSync(path.join(dir, 'node_modules'));
      stage(dir, { 'src/a.ts': 'export const a: number = 7;\n' });
      const result = commit(dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toContain('npm install');
    }, 120_000);
  });

  describe('the install script, run by `npm run hooks`', () => {
    const INSTALL = path.join(REPO, 'scripts/install-hooks.mjs');
    const run = (cwd: string) => spawnSync(process.execPath, [INSTALL], { cwd, encoding: 'utf-8' });

    it('points core.hooksPath at .githooks in a git checkout', () => {
      const dir = repo();
      git(dir, ['config', '--unset', 'core.hooksPath']);
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(git(dir, ['config', 'core.hooksPath']).stdout.trim()).toBe('.githooks');
    });

    it('does nothing, and does not fail, outside a git checkout', () => {
      const dir = tempDir('blazon-nogit-');
      const result = run(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('is the hooks script, not a prepare script (the published manifest must carry none), and the suites the hook names are scripts of the package', () => {
      const scripts = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')).scripts;
      expect(scripts.hooks).toBe('node scripts/install-hooks.mjs');
      expect(scripts.prepare).toBeUndefined();
      for (const name of ['typecheck', 'test', 'test:deck', 'test:docs']) expect(scripts[name], name).toBeTruthy();
      // The suites it runs for a docs-only commit and a scripts-only commit are real test files
      for (const file of scripts['test:docs'].replace('vitest run ', '').split(' ').concat(scripts['test:deck'].replace('vitest run ', '').split(' '))) {
        expect(fs.existsSync(path.join(REPO, file)), file).toBe(true);
      }
    });
  });

  it('is skipped by `git commit --no-verify`, the way out the hook names', () => {
    const dir = repo();
    stage(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
    const result = commit(dir, {}, ['--no-verify']);
    expect(result.status, result.out).toBe(0);
  }, 120_000);
});
