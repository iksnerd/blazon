import { describe, it, expect } from 'vitest';
import { generate, TARGETS, withTable } from '../../scripts/gen-checks-docs.js';
import { CHECKS } from '../../src/core/checker/catalogue.js';
import { read } from '../support/spec-helpers.js';

// The code, severity and summary of every finding code are written into the manual and RFC 0001 from the catalogue
// (src/core/checker/catalogue.ts) by scripts/gen-checks-docs.ts. This runs the generator in memory and compares: a change to
// the catalogue, the generator or either table without `npm run checks-docs` fails here.

describe('the finding tables are generated from the catalogue', () => {
  const made = generate(read);

  it.each(TARGETS.map((target) => target.file))('%s holds the table the catalogue makes (run npm run checks-docs)', (file) => {
    expect(read(file) === made.get(file), `${file} is out of date: run npm run checks-docs`).toBe(true);
  });

  it.each(TARGETS.map((target) => target.file))('%s lists every code once, in byte order', (file) => {
    const text = read(file);
    const body = text.slice(text.indexOf('<!-- checks:begin -->'), text.indexOf('<!-- checks:end -->'));
    const listed = [...body.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]!);
    expect(listed).toEqual(Object.keys(CHECKS).sort());
  });

  it('refuses a document without its markers, so it never rewrites the wrong text', () => {
    expect(() => withTable('no markers here', TARGETS[0]!)).toThrow(/checks:begin/);
  });
});
