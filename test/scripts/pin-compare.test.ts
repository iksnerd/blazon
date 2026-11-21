import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from '../support/spawn';
import {
  build,
  compare,
  diffBrandKeys,
  diffDigests,
  diffFindings,
  globToRegExp,
  normalizeBrandJson,
  report,
  type BuildResult,
  type FindingKey,
} from '../../scripts/pin-compare.js';
import { REPO } from '../support/paths.js';
import { starterProject } from '../support/init-project';

// scripts/pin-compare.ts builds a brand with two builds of blazon and reports what differs. The pure parts are tested on made-up builds; the
// real comparison builds a new starter twice with this checkout (it needs dist/, so it is skipped where there is none, as in the commit hook).

const finding = (code: string, path = 'a', message = 'm', severity = 'warning'): FindingKey => ({ severity, code, path, message });
const result = (over: Partial<BuildResult> = {}): BuildResult => ({
  blazon: '/blazon',
  checkStatus: 0,
  buildStatus: 0,
  findings: [],
  tokens: {},
  site: {},
  brand: { format: 'blazon-brand' },
  ...over,
});

describe('diffFindings', () => {
  it('lists what only the second build reports as added and what only the first reports as removed', () => {
    const d = diffFindings([finding('x'), finding('y')], [finding('y'), finding('z')]);
    expect(d.added).toEqual(['warning z a: m']);
    expect(d.removed).toEqual(['warning x a: m']);
  });

  it('counts a finding that is reported twice, and tells a severity, a path and a message apart', () => {
    expect(diffFindings([finding('x')], [finding('x'), finding('x')]).added).toEqual(['warning x a: m']);
    expect(diffFindings([finding('x')], [finding('x', 'a', 'm', 'error')])).toEqual({ added: ['error x a: m'], removed: ['warning x a: m'] });
    expect(diffFindings([finding('x', 'a')], [finding('x', 'b')])).toEqual({ added: ['warning x b: m'], removed: ['warning x a: m'] });
    expect(diffFindings([finding('x')], [finding('x')])).toEqual({ added: [], removed: [] });
  });
});

describe('globToRegExp', () => {
  it('lets * stand for any run of characters and nothing else', () => {
    expect(globToRegExp('*.pdf').test('blazon.brand-deck/brand-deck.pdf')).toBe(true);
    expect(globToRegExp('*.pdf').test('brand-deck.pdf.txt')).toBe(false);
    expect(globToRegExp('blazon.press-kit/*.zip').test('blazon.press-kit/kit.zip')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
    expect(globToRegExp('a+(b)').test('a+(b)')).toBe(true);
  });
});

describe('diffDigests', () => {
  it('lists the files only one build wrote and the files in both whose bytes differ', () => {
    const d = diffDigests({ 'a.css': '1', 'b.css': '2', 'c.css': '3' }, { 'a.css': '1', 'b.css': '9', 'd.css': '4' });
    expect(d).toEqual({ added: ['d.css'], removed: ['c.css'], changed: ['b.css'] });
  });

  it('leaves out the paths that --ignore names, from all three lists', () => {
    const d = diffDigests({ 'x/a.pdf': '1', 'x/b.pdf': '1', 'k.css': '1' }, { 'x/a.pdf': '2', 'x/c.pdf': '1', 'k.css': '2' }, ['*.pdf']);
    expect(d).toEqual({ added: [], removed: [], changed: ['k.css'] });
  });
});

describe('brand.json', () => {
  it('is compared without the commit that built it', () => {
    const a = normalizeBrandJson(JSON.stringify({ format: 'blazon-brand', generator: { name: 'blazon', commit: 'a'.repeat(40), dirty: true }, tokens: [] }));
    const b = normalizeBrandJson(JSON.stringify({ format: 'blazon-brand', generator: { name: 'blazon', commit: 'b'.repeat(40) }, tokens: [] }));
    expect(a).toEqual(b);
  });

  it('names the top-level keys that differ', () => {
    expect(diffBrandKeys({ tokens: [1], pages: [], assets: [] }, { tokens: [2], pages: [], findings: [] })).toEqual(['assets', 'findings', 'tokens']);
    expect(diffBrandKeys(undefined, undefined)).toEqual([]);
  });
});

describe('compare and report', () => {
  it('is identical for two equal builds, and says so', () => {
    const c = compare('/brands/acme', result(), result({ blazon: '/other' }));
    expect(c.identical).toBe(true);
    expect(report(c)).toContain('No difference in the findings, the token files, the site files or brand.json.');
    expect(report(c)).not.toContain('**Findings');
  });

  it('keeps a blank line between the table and the sentence after it, so the sentence is not read as a table row', () => {
    expect(report(compare('/b', result(), result()))).toMatch(/\| B \|[^\n]*\n\nNo difference/);
    expect(report(compare('/b', result(), result({ findings: [finding('x')] })))).toMatch(
      /\| B \|[^\n]*\n\nThe two builds differ\.\n\n\*\*Findings only B reports\*\* \(1\)\n\n- warning x a: m/,
    );
  });

  it.each([
    ['a finding', { findings: [finding('x')] }, 'Findings only B reports'],
    ['a token file', { tokens: { 'theme.css': 'z' } }, 'Token and plugin files only B writes'],
    ['a site file', { site: { 'index.html': 'z' } }, 'Site files only B writes'],
    ['a brand.json key', { brand: { format: 'blazon-brand', pages: [1] } }, 'brand.json keys that differ'],
    ['an exit status', { buildStatus: 1 }, 'exit 1'],
  ])('is not identical when the second build has another %s, and the report names it', (_, over, text) => {
    const c = compare('/brands/acme', result(), result(over));
    expect(c.identical).toBe(false);
    expect(report(c)).toContain('The two builds differ.');
    expect(report(c)).toContain(text);
  });

  it('does not compare brand.json as a site file, because it has its own comparison', () => {
    const c = compare('/b', result({ site: { 'brand.json': '1' } }), result({ site: { 'brand.json': '2' } }));
    expect(c.site.changed).toEqual([]);
  });
});

describe('the command', () => {
  const TSX = pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href;
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', TSX, path.join(REPO, 'scripts/pin-compare.ts'), ...args], { encoding: 'utf-8' });

  it('exits 2 with the usage for the wrong number of arguments, and for an option it does not know', () => {
    expect(run('only-one').status).toBe(2);
    expect(run('only-one').stderr).toContain('usage: tsx scripts/pin-compare.ts');
    expect(run('a', 'b', 'c', '--nope').stderr).toContain('unknown option --nope');
  });

  it('exits 2 when the folder is not a brand, and when a blazon is not built', () => {
    expect(run(REPO, REPO, REPO).status).toBe(2);
    expect(run(REPO, REPO, REPO).stderr).toMatch(/is not a brand/);
    expect(() => build(REPO, '/nonexistent', true)).toThrow(/is not a built blazon/);
  });
});

describe.skipIf(!fs.existsSync(path.join(REPO, 'dist/cli')))('a real comparison', () => {
  it('finds no difference between two builds of a new starter with the same blazon', async () => {
    const brand = await starterProject();
    const c = compare(brand, build(brand, REPO, true), build(brand, REPO, true));
    expect(c.a.buildStatus, 'the starter builds').toBe(0);
    expect(c.identical, report(c)).toBe(true);
    expect(Object.keys(build(brand, REPO, true).tokens)).toContain('theme.css');
  }, 180_000);
});
