import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from '../support/spawn';
import { tempDir, tempProject } from '../support/project';
import { BLAZON_LOCK, blazonIdentity, blazonPinFindings, gitState, readBlazonPin, writeBlazonPin, type BlazonIdentity } from '../../src/core/blazon-pin';

// A book names the blazon commit it builds with in blazon.lock; check, tokens and build refuse any other blazon. No file, no check.

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const built = (commit: string, dirty = false): BlazonIdentity => ({ commit, dirty, from: 'build' });
const lock = (content: unknown): string => tempProject({ [BLAZON_LOCK]: typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n' });

/** A checkout with one commit, in a temporary folder. */
function checkout(): string {
  const dir = tempDir();
  const run = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf-8' });
  run('init', '-q');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  run('add', 'a.txt');
  run('commit', '-q', '-m', 'one');
  return dir;
}

describe('blazon.lock', () => {
  it('matches: the blazon running is the pinned commit', () => {
    expect(blazonPinFindings(lock({ v: 1, commit: A }), built(A))).toEqual([]);
  });

  it('mismatches: names both commits, the file and the line of the commit', () => {
    const [finding, ...rest] = blazonPinFindings(lock({ v: 1, commit: A }), built(B));
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'pin-mismatch', severity: 'error', path: BLAZON_LOCK, file: BLAZON_LOCK, line: 3 });
    expect(finding!.message).toContain('pinned to blazon aaaaaaaaaaaa');
    expect(finding!.message).toContain('was built from bbbbbbbbbbbb');
  });

  it('mismatches when the tree had uncommitted changes, even at the pinned commit', () => {
    const [finding] = blazonPinFindings(lock({ v: 1, commit: A }), built(A, true));
    expect(finding).toMatchObject({ code: 'pin-mismatch' });
    expect(finding!.message).toContain('uncommitted changes');
  });

  it('mismatches when blazon cannot say which commit it is: a pin it cannot check is not met', () => {
    const [finding] = blazonPinFindings(lock({ v: 1, commit: A }), null);
    expect(finding).toMatchObject({ code: 'pin-mismatch' });
    expect(finding!.message).toContain('cannot say which commit it is');
  });

  it('says to rebuild when the clone is at the pin but the dist that runs was built from another commit', () => {
    const clone = checkout();
    const head = gitState(clone)!.commit;
    const [finding] = blazonPinFindings(lock({ v: 1, commit: head }), built(B), clone);
    expect(finding!.message).toContain('run npm run build');
  });

  it('has no pin without the file, and checks nothing', () => {
    expect(blazonPinFindings(tempDir(), built(B))).toEqual([]);
    expect(blazonPinFindings(tempDir(), null)).toEqual([]);
  });

  it.each([
    ['not JSON', '{ nope', 'not valid JSON'],
    ['an array', '[]', 'must be an object'],
    ['a short hash', { v: 1, commit: 'abc123' }, 'commit must be a full git commit hash'],
    ['an upper-case hash', { v: 1, commit: A.toUpperCase() }, 'commit must be a full git commit hash'],
    ['no commit', { v: 1 }, 'commit must be a full git commit hash'],
    ['a wrong version', { v: 2, commit: A }, 'v must be 1'],
    ['an unknown key', { v: 1, commit: A, branch: 'main' }, 'unknown key "branch"'],
  ])('is an error, never a pin, when malformed: %s', (_, content, message) => {
    const found = blazonPinFindings(lock(content), built(A));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.code === 'pin-invalid' && f.severity === 'error' && f.file === BLAZON_LOCK)).toBe(true);
    expect(found.map((f) => f.message).join('\n')).toContain(message);
  });

  it('gives the line of a mistake it can place', () => {
    const [finding] = readBlazonPin(lock({ v: 1, commit: 'short' })).problems;
    expect(finding!.line).toBe(3);
  });
});

describe('blazon pin', () => {
  it('writes the commit of the blazon that runs, and a check against that blazon passes', () => {
    const cwd = tempDir();
    expect(writeBlazonPin(cwd, built(A))).toBe(A);
    expect(JSON.parse(fs.readFileSync(path.join(cwd, BLAZON_LOCK), 'utf-8'))).toEqual({ v: 1, commit: A });
    expect(fs.readdirSync(cwd)).toEqual([BLAZON_LOCK]);
    expect(blazonPinFindings(cwd, built(A))).toEqual([]);
  });

  it('moves the pin, and mends a lock that could not be read', () => {
    const cwd = lock('{ nope');
    writeBlazonPin(cwd, built(B));
    expect(readBlazonPin(cwd).pin).toEqual({ commit: B });
  });

  it('refuses a blazon with uncommitted changes, and one that does not know its commit, and writes nothing', () => {
    const cwd = tempDir();
    expect(() => writeBlazonPin(cwd, built(A, true))).toThrow('uncommitted changes');
    expect(() => writeBlazonPin(cwd, null)).toThrow('cannot say which commit it is');
    expect(fs.readdirSync(cwd)).toEqual([]);
  });
});

describe('what blazon knows about itself', () => {
  it('uses the build stamp when there is one', () => {
    expect(blazonIdentity({ commit: A, dirty: false })).toEqual({ commit: A, dirty: false, from: 'build' });
  });

  it('is unknown when it was built outside a checkout (a null stamp), and does not guess from one around it', () => {
    expect(blazonIdentity(null, checkout())).toBeNull();
  });

  it('reads HEAD of its checkout when it runs from source, and sees uncommitted and untracked changes', () => {
    const dir = checkout();
    const head = gitState(dir)!.commit;
    expect(blazonIdentity(undefined, dir)).toEqual({ commit: head, dirty: false, from: 'git' });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'changed');
    expect(blazonIdentity(undefined, dir)?.dirty).toBe(true);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'new.txt'), 'x');
    expect(blazonIdentity(undefined, dir)?.dirty).toBe(true);
  });

  it('is unknown outside a checkout', () => {
    expect(blazonIdentity(undefined, tempDir())).toBeNull();
  });
});

describe('runPin --json', () => {
  it('prints the commit and the file as one document', async () => {
    const { runPin } = await import('../../src/cli/commands/pin.js');
    const root = tempDir('blazon-pin-run-');
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => (lines.push(String(chunk)), true));
    try {
      expect(runPin(root, { json: true, identity: { commit: 'a'.repeat(40), dirty: false, from: 'build' } })).toBe(0);
    } finally {
      write.mockRestore();
    }
    expect(JSON.parse(lines.join(''))).toEqual({ command: 'pin', passed: true, commit: 'a'.repeat(40), file: 'blazon.lock' });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'blazon.lock'), 'utf-8'))).toEqual({ v: 1, commit: 'a'.repeat(40) });
  });

  it('throws what the text form prints to standard error, so the error is JSON too', async () => {
    const { runPin } = await import('../../src/cli/commands/pin.js');
    expect(() => runPin(tempDir('blazon-pin-run-'), { json: true, identity: null })).toThrow('cannot say which commit it is');
  });
});
