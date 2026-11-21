import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { git, counterFile, count, write, clone, commit, push, remoteHead } from '../support/hook-push';

// The pre-push hook, part 2 of 2 (part 1 is pre-push): a broad change, a push by sha, a branch deletion, two refs with one tree, `--no-verify`,
// a missing node_modules, and a suite that prints a lot.

describe('the pre-push hook', () => {
  it('is where a broad change meets the whole suite: the commit does not run it, the push runs it once', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    write(dir, { 'examples/x/blazon.json': '// broad\n' });
    git(dir, ['add', '-A']);
    const made = git(dir, ['commit', '-q', '-m', 'broad']);
    expect(made.status, made.stdout + made.stderr).toBe(0);
    expect(count(counter)).toBe(0);
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(count(counter)).toBe(1);
  }, 120_000);

  it('takes `git push origin <sha>:refs/heads/main` and tests that sha', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 6;\n' });
    commit(dir, { 'src/a.ts': 'export const a: number = 7;\n' });
    const result = push(dir, ['origin', `${sha}:refs/heads/main`]);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('runs nothing for the deletion of a remote branch', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    expect(push(dir, ['origin', 'main:topic']).status).toBe(0);
    const before = count(counter);
    const result = push(dir, ['origin', ':topic']);
    expect(result.status, result.out).toBe(0);
    expect(count(counter)).toBe(before);
    expect(remoteHead(remote, 'topic')).toBe('');
  }, 120_000);

  it('runs the suite once when two refs carry the same tree', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 8;\n' });
    expect(push(dir, ['origin', 'main:one', 'main:two']).status).toBe(0);
    expect(count(counter)).toBe(1);
  }, 120_000);

  it('is skipped by `git push --no-verify`', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter, 1);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 9;\n' });
    const result = push(dir, ['origin', 'main'], ['--no-verify']);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('says how to run it by hand when node_modules is missing, and sends nothing', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 10;\n' });
    fs.unlinkSync(path.join(dir, 'node_modules'));
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('npm install');
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('shows the failing lines of a suite that prints a lot first', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    // The suite is a file, so the quoting of a shell command cannot spoil it; the failing line is built at run time, because npm echoes a script's own text
    const suite = "for (let i = 0; i < 100; i++) console.log('noise ' + i); console.log(String.fromCharCode(32, 215) + ' the failing test'); process.exit(1);\n";
    const noisy = JSON.stringify({
      name: 'throwaway',
      private: true,
      scripts: { typecheck: 'tsc --noEmit -p .', lint: 'echo lint', 'format:check': 'echo format', 'format:files': 'echo format', test: 'node suite.js --' },
    });
    commit(dir, { 'package.json': noisy, 'suite.js': suite });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('× the failing test');
    expect(result.out).toContain('full output:');
  }, 120_000);
});
