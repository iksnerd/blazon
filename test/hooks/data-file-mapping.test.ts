import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';

// A data file under test/ is read by path, and imports never reach it, so an unknown one asks for the whole suite. A few are read by a
// small, known set of tests; classify_paths in .githooks/lib.sh maps those to their tests. This file holds the table twice over: what
// classify_paths answers, and (the guard) that nothing outside the mapped tests reads the file. A new reader added later breaks the
// guard instead of escaping the gate.

const classify = (paths: string[]) => {
  const run = spawnSync('bash', ['-c', '. .githooks/lib.sh; classify_paths "$PWD" <<< "$PATHS"; echo "full=$full"; echo "extra=$extra_tests"'], {
    cwd: REPO,
    encoding: 'utf-8',
    env: { ...process.env, PATHS: paths.join('\n') },
  });
  expect(run.status, run.stderr).toBe(0);
  const lines = run.stdout.trim().split('\n');
  const field = (name: string) => lines.find((l) => l.startsWith(`${name}=`))!.slice(name.length + 1);
  return { full: field('full'), extra: field('extra').trim().split(/\s+/).filter(Boolean) };
};

interface Mapping {
  /** What changed: a file, or a folder (a path ending in /). */
  data: string;
  /** Text a reader holds: its path, or the name a loader builds it from. */
  patterns: string[];
  /** The tests the hook runs for a change to it. Each one is a reader. */
  tests: string[];
  /** Readers the hooks do not run (they run at release), and why that is fine. */
  releaseOnly?: string[];
}

const MAPPINGS: Mapping[] = [
  { data: 'test/surface/public-surface.json', patterns: ['public-surface', 'test/surface'], tests: ['test/surface'] },
  {
    data: 'test/first-run/expected.json',
    patterns: ['first-run/expected', "'first-run'", 'expected.json'],
    tests: ['test/build/first-run.test.ts'],
    // The tarball smoke test judges a packed starter by the same file; it runs in the release job, never in a hook.
    releaseOnly: ['scripts/smoke-tarball.mjs', 'scripts/first-run-expectation.mjs'],
  },
  { data: 'test/examples/golden/conformance/', patterns: ['examples/golden', 'golden/conformance'], tests: ['test/core/tokens/conformance.test.ts'] },
  {
    data: 'test/plugins/shipped/fixtures/tokens-plugins/',
    patterns: ['tokens-plugins', 'shipped/fixtures'],
    tests: ['test/plugins/shipped/shadcn.test.ts', 'test/plugins/shipped/tailwind.test.ts'],
  },
  { data: 'test/plugins/shipped/logo-geometry/oracle/', patterns: ['logo-geometry/oracle', "'oracle'", '"oracle"'], tests: ['test/plugins/shipped/logo-geometry/oracle.test.ts'] },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.claude', 'coverage', 'template']);
/** Every file of the tree that can read another by path: code and data, not prose. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && rel !== 'docs/personal') sources(rel, out);
    } else if (/\.(ts|tsx|js|mjs|cjs|py|sh|json|yml|yaml)$/.test(entry.name) || rel.startsWith('.githooks/')) out.push(rel);
  }
  return out;
}
const abs = (rel: string) => path.join(REPO, rel);

describe('data files under test/ that map to their own tests', () => {
  it.each(MAPPINGS)('classify_paths maps $data to its tests and not to the whole suite', ({ data, tests }) => {
    const changed = data.endsWith('/') ? `${data}x.bin` : data;
    const result = classify([changed]);
    expect(result.full).toBe('0');
    expect(result.extra).toEqual([...tests].sort());
    for (const test of tests) expect(fs.existsSync(abs(test)), `${test} is gone`).toBe(true);
  });

  it.each(MAPPINGS)('nothing but the mapped tests reads $data', ({ data, patterns, tests, releaseOnly = [] }) => {
    const allowed = (file: string) =>
      file.startsWith(data) || // the data itself
      file.startsWith('test/hooks/') || // these tests and the hook tests name paths on purpose
      file.startsWith('.githooks/') ||
      tests.some((t) => file === t || file.startsWith(`${t}/`)) ||
      releaseOnly.includes(file);
    const stray = sources('.')
      .filter((file) => !allowed(file))
      .filter((file) => {
        const text = fs.readFileSync(abs(file), 'utf-8');
        return patterns.some((p) => text.includes(p));
      });
    expect(stray, `${stray.join(', ')} read(s) ${data}: map it in classify_paths and here, or add it to the mapped tests`).toEqual([]);
  });

  it('an unmapped file under test/ still asks for the whole suite', () => {
    for (const unmapped of ['test/spec/core/call/exit-0.json', 'test/support/pixel-180.png', 'test/surface/other.json', 'test/first-run/other.json']) {
      expect(classify([unmapped]).full, unmapped).toBe('1');
    }
  });

  it('keeps what was already mapped', () => {
    const starter = classify(['examples/blazon/blazon.json']);
    expect(starter.full).toBe('1');
    expect(starter.extra).toEqual(expect.arrayContaining(['test/core/starter.test.ts', 'test/build']));
    for (const mcp of ['mcp/test/__snapshots__/tools-list.json', 'mcp/src/server.ts']) {
      const result = classify([mcp]);
      expect(result.full, mcp).toBe('0');
      expect(result.extra, mcp).toEqual(['mcp/test']);
    }
  });
});
