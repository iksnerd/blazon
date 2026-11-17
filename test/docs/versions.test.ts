import { describe, it, expect } from 'vitest';
import { read, walk } from '../support/spec-helpers.js';

// A hand-written "blazon is at version X" goes stale at the next release and nothing else would notice. Where the docs state
// blazon's own version, it must be the one in package.json, or a placeholder (<version>, X.Y.Z). Only these shapes count, so a
// version that is history (a CHANGELOG entry, "since 0.2.0", a protocol "version 2", a pinned dependency) is never matched.
// Scanned: README.md, CONTRIBUTING.md, the manual, and the starter in examples/blazon (it ships in the package).
// RFCs are left out: they keep dated version history.
const PATTERNS: [string, RegExp][] = [
  ['an output sample "blazon/<semver>"', /(?<![\w./@-])blazon\/(\d+\.\d+\.\d+)/g],
  ['"version <semver>"', /\bversion (\d+\.\d+\.\d+)/gi],
  ['a status line "Status: ... (<semver>)"', /Status:[^(\n]*\((\d+\.\d+\.\d+)\)/g],
  ['an install "@iksnerd/blazon@<semver>"', /@iksnerd\/blazon@(\d+\.\d+\.\d+)/g],
  ['a package.json pin "@iksnerd/blazon": "<semver>"', /@iksnerd\/blazon": "(\d+\.\d+\.\d+)"/g],
  ['a caret range "^<semver>"', /\^(\d+\.\d+\.\d+)/g],
  ['a release example "release -- <semver>"', /release -- (\d+\.\d+\.\d+)/g],
];

const current = (JSON.parse(read('package.json')) as { version: string }).version;
const files = ['README.md', 'CONTRIBUTING.md', ...walk('docs/manual').filter((f) => f.endsWith('.md')), ...walk('examples/blazon').filter((f) => f.endsWith('.md'))];

describe("blazon's own version in the docs", () => {
  it.each(files)('%s states no version but the current one or a placeholder', (file) => {
    const text = read(file);
    const stale = PATTERNS.flatMap(([what, re]) => [...text.matchAll(re)].filter((m) => m[1] !== current).map((m) => `${what}: ${m[0]}`));
    expect(stale, `${file} names an old version; write a placeholder such as <version> or reword`).toEqual([]);
  });
});
