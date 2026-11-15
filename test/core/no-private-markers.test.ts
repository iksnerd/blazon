import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';

// A published repository must not carry the maintainer's machine, a client's name or the names of private tools. Every tracked text file is
// checked, not one folder: an earlier guard that covered one folder let the same markers sit elsewhere for weeks.
// The patterns that are not private (a home folder, an agent session folder) are written here. The ones that name a private person, company,
// tool or folder are not: a public source file would hand them to a reader. They are read from a JSON file outside the repository, so the
// guard still runs in the pre-commit hook, which tests an export of the staged files:
//   $BLAZON_PRIVATE_MARKERS, or ~/.config/blazon/private-markers.json   [{ "what": "...", "pattern": "regex source", "flags": "i" }]
// Without that file (a fork, CI) the named markers are not checked and the test says so.
const join = (...parts: string[]): string => parts.join('');

const PUBLIC_MARKERS: Array<{ what: string; pattern: RegExp }> = [
  { what: 'a macOS home folder', pattern: /\/Users\/(?!Shared\b)[A-Za-z0-9_.-]+\// },
  { what: 'an agent session folder', pattern: new RegExp(`\\${join('.claude', '/projects')}`) },
];

const PRIVATE_MARKERS_FILE = process.env.BLAZON_PRIVATE_MARKERS ?? path.join(os.homedir(), '.config/blazon/private-markers.json');

/** The named markers from the maintainer's file, or null when there is none. A file that is there but wrong is an error, not a skip. */
const loadPrivateMarkers = (): Array<{ what: string; pattern: RegExp }> | null => {
  if (!fs.existsSync(PRIVATE_MARKERS_FILE)) return null;
  const parsed: unknown = JSON.parse(fs.readFileSync(PRIVATE_MARKERS_FILE, 'utf-8'));
  if (!Array.isArray(parsed)) throw new Error(`${PRIVATE_MARKERS_FILE} must be a JSON array`);
  return parsed.map((entry: { what?: unknown; pattern?: unknown; flags?: unknown }) => {
    if (typeof entry?.what !== 'string' || typeof entry?.pattern !== 'string') throw new Error(`${PRIVATE_MARKERS_FILE}: each entry needs a "what" and a "pattern" string`);
    return { what: entry.what, pattern: new RegExp(entry.pattern, typeof entry.flags === 'string' ? entry.flags : '') };
  });
};

const PRIVATE_MARKERS = loadPrivateMarkers();
const MARKERS = [...PUBLIC_MARKERS, ...(PRIVATE_MARKERS ?? [])];

const SKIPPED = new Set(['package-lock.json']);

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'template']);

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT_DIR, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return IGNORED_DIRS.has(entry.name) ? [] : walk(rel);
    return entry.isFile() ? [rel] : [];
  });

/** The tracked files. The pre-commit hook tests an export of the staged files, which has no .git: there the folder itself is the list. */
const tracked = (): string[] => {
  let files: string[];
  try {
    files = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: ROOT_DIR, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' }).split('\0');
  } catch {
    files = walk('');
  }
  return files.filter((file) => file && !SKIPPED.has(file) && fs.existsSync(path.join(ROOT_DIR, file)));
};

describe('tracked files', () => {
  it.skipIf(PRIVATE_MARKERS !== null)('say so when the named-marker file is absent', () => {
    process.stderr.write(`no-private-markers: ${PRIVATE_MARKERS_FILE} is absent, so private names are not checked here\n`);
  });

  it('carry no home folder, private name or private tool name', () => {
    const found: string[] = [];
    for (const file of tracked()) {
      const bytes = fs.readFileSync(path.join(ROOT_DIR, file));
      if (bytes.includes(0)) continue;
      const lines = bytes.toString('utf-8').split('\n');
      lines.forEach((line, index) => {
        for (const { what, pattern } of MARKERS) if (pattern.test(line)) found.push(`${file}:${index + 1} ${what}`);
      });
    }
    expect(found).toEqual([]);
  });
});
