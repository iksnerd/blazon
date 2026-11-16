import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { git, counterFile, count, write, clone, commit, push, remoteHead } from '../support/hook-push';

describe('the pre-push hook', () => {
  it('runs the typecheck and the full suite on the commit being pushed, and lets a good push go', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('✓ typecheck');
    expect(result.out).toContain('✓ tests: full suite');
    expect(count(counter)).toBe(1);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('refuses a push whose suite fails, says which test, and sends nothing', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter, 1);
    commit(dir, { 'src/a.ts': 'export const a: number = 3;\n' });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ tests: full suite');
    expect(result.out).toContain('--no-verify');
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('refuses a commit made with --no-verify that does not typecheck: it is the backstop', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
    const result = push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ typecheck');
    expect(count(counter)).toBe(0);
    expect(remoteHead(remote)).toBe('');
  }, 120_000);

  it('tests the pushed commit and not the working tree', () => {
    const counter = counterFile();
    const { dir, remote } = clone(counter);
    const sha = commit(dir, { 'src/a.ts': 'export const a: number = 4;\n' });
    write(dir, { 'src/a.ts': 'export const a: number = "an unsaved mistake";\n' });
    const result = push(dir);
    expect(result.status, result.out).toBe(0);
    expect(remoteHead(remote)).toBe(sha);
  }, 120_000);

  it('does not run the suite again for a tree that passed it', () => {
    const counter = counterFile();
    const { dir } = clone(counter);
    commit(dir, { 'src/a.ts': 'export const a: number = 5;\n' });
    expect(push(dir, ['origin', 'main:one']).status).toBe(0);
    expect(count(counter)).toBe(1);
    const again = push(dir, ['origin', 'main:two']);
    expect(again.status, again.out).toBe(0);
    expect(count(counter)).toBe(1);
    expect(again.out).toContain('passed before');
  }, 120_000);

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
