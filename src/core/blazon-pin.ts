import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types/index.js';
import { packageRoot } from './package-root.js';
import { finding } from './checker/catalogue.js';

// A brand book names the blazon commit it builds with in blazon.lock. Blazon is on npm, but a release number does not say which
// commit built a book: package.json carries the same version for every commit between two releases, so the commit is the pin.
//
// What blazon can know about itself:
//  - dist (what `blazon` runs): `npm run build` compiles the commit the checkout was at, and whether it had uncommitted
//    changes, into the bundle (`__BLAZON_BUILD__`, vite.config.ts). That is the commit the running code was built from.
//  - source (`npm run blazon:src`, tsx): there is no build, so the checkout's HEAD is read with git when it runs.
//  - neither (a copy with no .git, or a build made outside git): blazon does not know, and says so.
// A stamp does not prove that dist was left alone after the build or that node_modules matches the lockfile, and a person
// who edits the bundle can edit the stamp. It catches the mistake that happens: building a book with another checkout.

export const BLAZON_LOCK = 'blazon.lock';

declare const __BLAZON_BUILD__: { commit: string; dirty: boolean } | null;

export interface BlazonIdentity {
  commit: string;
  /** True when the tree had changes git reported at the time (tracked, or untracked and not ignored) */
  dirty: boolean;
  from: 'build' | 'git';
}

const COMMIT = /^[0-9a-f]{40}$/;

function git(root: string, ...args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 });
  } catch {
    return undefined;
  }
}

/** The commit and cleanliness of the checkout at `root`, or undefined when it is not a git checkout. */
export function gitState(root: string): { commit: string; dirty: boolean } | undefined {
  const commit = git(root, 'rev-parse', 'HEAD')?.trim();
  const status = git(root, 'status', '--porcelain');
  return commit !== undefined && COMMIT.test(commit) && status !== undefined ? { commit, dirty: status.trim() !== '' } : undefined;
}

/** What this blazon is, as far as it can know. `stamp` and `root` are for tests. */
export function blazonIdentity(
  stamp: { commit: string; dirty: boolean } | null | undefined = typeof __BLAZON_BUILD__ === 'undefined' ? undefined : __BLAZON_BUILD__,
  root?: string,
): BlazonIdentity | null {
  if (stamp) return { ...stamp, from: 'build' };
  // Compiled with no stamp (built outside git): do not guess from whatever checkout sits around it
  if (stamp === null) return null;
  const state = gitState(root ?? packageRoot());
  return state ? { ...state, from: 'git' } : null;
}

export interface BlazonPin {
  commit: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const lineOf = (text: string, key: string): number | undefined => {
  const index = text.split('\n').findIndex((line) => line.includes(`"${key}"`));
  return index < 0 ? undefined : index + 1;
};

const problem = (message: string, line?: number): Finding => finding('pin-invalid', { path: BLAZON_LOCK, file: BLAZON_LOCK, ...(line !== undefined && { line }), message });

/** Read blazon.lock strictly. No file is no pin; a file with any mistake is an error, never a pin. */
export function readBlazonPin(cwd: string): { pin?: BlazonPin; line?: number; problems: Finding[] } {
  const file = path.join(cwd, BLAZON_LOCK);
  if (!fs.existsSync(file)) return { problems: [] };
  const text = fs.readFileSync(file, 'utf-8');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { problems: [problem(`${BLAZON_LOCK} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)] };
  }
  if (!isObject(raw)) return { problems: [problem(`${BLAZON_LOCK} must be an object: { "v": 1, "commit": "<40 hex digits>" }`)] };
  const problems: Finding[] = [];
  for (const key of Object.keys(raw)) if (key !== 'v' && key !== 'commit') problems.push(problem(`unknown key "${key}"; known: v, commit`, lineOf(text, key)));
  if (raw.v !== 1) problems.push(problem('v must be 1', lineOf(text, 'v')));
  if (typeof raw.commit !== 'string' || !COMMIT.test(raw.commit)) problems.push(problem('commit must be a full git commit hash: 40 lowercase hex digits', lineOf(text, 'commit')));
  return problems.length > 0 ? { problems } : { pin: { commit: raw.commit as string }, line: lineOf(text, 'commit'), problems: [] };
}

const short = (commit: string): string => commit.slice(0, 12);

/**
 * The findings for blazon.lock in `cwd`: none without a pin, `pin-invalid` for a file that cannot be read, and
 * `pin-mismatch` when this blazon is not the pinned commit, was built from a tree with changes, or cannot say what it is.
 * A pin that cannot be checked is not met.
 */
export function blazonPinFindings(cwd: string, identity: BlazonIdentity | null = blazonIdentity(), root?: string): Finding[] {
  const { pin, line, problems } = readBlazonPin(cwd);
  if (problems.length > 0 || !pin) return problems;
  const mismatch = (message: string): Finding[] => [finding('pin-mismatch', { path: BLAZON_LOCK, file: BLAZON_LOCK, ...(line !== undefined && { line }), message })];
  if (!identity) {
    return mismatch(
      `this book is pinned to blazon ${short(pin.commit)}, but this blazon cannot say which commit it is (it is not a git checkout and carries no build stamp); build blazon from a git checkout of that commit`,
    );
  }
  if (identity.commit !== pin.commit) {
    const where = identity.from === 'build' ? 'was built from' : 'is at';
    // The usual slip: the clone is at the pin, but the dist the `blazon` command runs was built before the checkout
    const clone = identity.from === 'build' ? gitState(root ?? packageRoot()) : undefined;
    const stale = clone && clone.commit === pin.commit ? `; the blazon clone is at the pinned commit, so run npm run build in it` : '';
    return mismatch(`this book is pinned to blazon ${short(pin.commit)}, but the blazon running ${where} ${short(identity.commit)}${stale}`);
  }
  if (identity.dirty) {
    return mismatch(
      `this book is pinned to blazon ${short(pin.commit)}, and the blazon running ${identity.from === 'build' ? 'was built from' : 'is at'} that commit with uncommitted changes, so it is not that commit; commit or discard them and ${identity.from === 'build' ? 'run npm run build' : 'run again'}`,
    );
  }
  return [];
}

/** Write blazon.lock for this blazon, replacing one that cannot be read, which is how a broken pin is mended. Throws an Error saying why not: an unknown or uncommitted blazon is not a version to pin. */
export function writeBlazonPin(cwd: string, identity: BlazonIdentity | null = blazonIdentity()): string {
  if (!identity)
    throw new Error(
      'this blazon cannot say which commit it is (it is not a git checkout and carries no build stamp), so there is nothing to pin; build blazon from a git checkout',
    );
  if (identity.dirty)
    throw new Error(`the blazon running has uncommitted changes (it is ${short(identity.commit)} plus edits), so pinning it would name a commit it is not; commit them first`);
  const file = path.join(cwd, BLAZON_LOCK);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ v: 1, commit: identity.commit }, null, 2)}\n`);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return identity.commit;
}
