import { describe, it, expect } from 'vitest';
import { counterFile, count, write, clone, commit, push, remoteHead } from '../support/hook-push';

// The pre-push hook on a clone whose remote has nothing yet, part 1 of 2: the typecheck and full suite on the pushed commit, a failing suite, a commit made with --no-verify,
// the pushed tree rather than the working tree, and the memory of a tree that passed.

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
});
