import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { decodeManifest, ManifestError } from '../../src/plugins/wire/manifest.js';
import { BLAZON_CORE_PROFILE, BLAZON_PROFILE } from '../../src/plugins/wire/profile.js';
import { tempDir } from '../support/project';
import { acmeSavedSite } from './fixtures/acme-saved-site.js';

// extract.json, the record of what `init --from` / `--from-dir` read, and the lines the design draws: new files only, nothing approved, no
// role chosen by a count, no font file and no license, and no extractor plugin.

afterEach(() => vi.restoreAllMocks());

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const json = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

async function fromAcme(): Promise<string> {
  quiet();
  const dir = path.join(tempDir(), 'acme');
  expect(await runInit(dir, { fromDir: acmeSavedSite() })).toBe(0);
  return dir;
}

/** Every `review` object in every JSON file of a project. */
function reviewsIn(dir: string): unknown[] {
  const found: unknown[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'review' && typeof child === 'object') found.push(child);
        walk(child);
      }
    }
  };
  const files = (folder: string): string[] =>
    fs
      .readdirSync(folder, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(path.join(folder, e.name)) : e.name.endsWith('.json') ? [path.join(folder, e.name)] : []));
  for (const file of files(dir)) walk(JSON.parse(fs.readFileSync(file, 'utf8')));
  return found;
}

describe('extract.json', () => {
  it('lists every value read with its source, selector, property and count', async () => {
    const dir = await fromAcme();
    const proof = json(dir, 'extract.json');
    expect(proof).toMatchObject({ format: 'blazon-extract', version: 1, offline: true, status: 'needs-review', readFrom: 'acme-site/index.html (a saved copy)' });
    expect(proof.sources.stylesheets).toEqual(['acme_files/theme.css', 'acme_files/site.css', 'acme_files/tokens.css']);
    expect(proof.sources.notRead.join('\n')).toMatch(/remote\.css/);

    const value = (kind: string, property: string) => proof.values.find((v: { kind: string; property: string }) => v.kind === kind && v.property === property);
    expect(value('color', '--color-primary')).toEqual({
      kind: 'color',
      value: 'oklch(0.55 0.2 264)',
      hex: '#3266e4',
      source: 'acme_files/theme.css',
      selector: '@theme',
      property: '--color-primary',
      count: 1, // .button reads it with var()
    });
    expect(value('color', '--brand-ink')).toMatchObject({ source: 'acme_files/tokens.css', selector: ':root' });
    expect(value('radius', '--radius-md')).toMatchObject({ token: 'radius.md', value: '0.5rem', source: 'acme_files/theme.css', selector: '@theme' });
    expect(value('font-family', 'font-family')).toMatchObject({
      role: 'body',
      value: 'Inter',
      source: 'acme_files/site.css',
      selector: 'body',
      license: expect.stringMatching(/not set/),
    });
    expect(proof.values.find((v: { kind: string; role?: string }) => v.kind === 'font-weight' && v.role === 'headings')).toMatchObject({ value: 700, selector: 'h1' });
    expect(value('theme-color', 'content')).toMatchObject({ value: '#4338ca', source: 'acme-site/index.html', selector: 'meta[name="theme-color"]' });
    expect(value('logo', 'svg')).toMatchObject({ value: 'an inline SVG', selector: 'header a[href="/"] svg' });
  });

  it('ranks colors by frequency under candidates, and says a count is not a decision', async () => {
    const dir = await fromAcme();
    const { candidates } = json(dir, 'extract.json');
    expect(candidates.note).toMatch(/Counts are evidence, not a decision/);
    expect(candidates.note).toMatch(/usually a gray or the link color, not the primary/);
    const top = candidates.colorsByFrequency.slice(0, 3).map((c: { value: string }) => c.value);
    expect(top).toEqual(['#333333', '#1d4ed8', '#ffffff']); // a tie keeps the order the colors were first seen in
    expect(candidates.colorsByFrequency[0]).toMatchObject({
      count: 2,
      uses: [{ source: 'acme_files/site.css', selector: 'body', property: 'color', value: '#333333' }, { selector: '.chip' }],
    });
    expect(candidates.radiiByFrequency[0]).toMatchObject({ value: '8px', count: 2 });
    // and the most used color is not what interactive.primary became
    expect(json(dir, 'tokens/colors.json').interactive.primary.$value).toBe('{color.primary}');
  });

  it('is not read by blazon check, and the starter-file notes are the same as without it', async () => {
    const dir = await fromAcme();
    const findings = async () => (await compileBlazonData(await loadConfig(dir), dir)).findings;
    const withProof = await findings();
    expect(withProof.filter((f) => JSON.stringify(f).includes('extract'))).toEqual([]);
    fs.rmSync(path.join(dir, 'extract.json'));
    const without = await findings();
    expect(withProof.map((f) => `${f.code} ${f.path}`)).toEqual(without.map((f) => `${f.code} ${f.path}`));
  });
});

describe('what init --from-dir refuses to do', () => {
  it('approves nothing: every review it wrote is needs-review, and the note says who confirms it and how', async () => {
    const dir = await fromAcme();
    const reviews = reviewsIn(dir) as { status: string; note?: string }[];
    expect(reviews.length).toBeGreaterThan(10);
    expect(reviews.filter((r) => r.status !== 'needs-review')).toEqual([]);
    const note = json(dir, 'tokens/colors.json').color.primary.$extensions['dev.blazon'].review.note as string;
    expect(note).toMatch(/A person confirms it with the brand owner/);
    expect(note).toMatch(/status ok, by \(who\) and at \(the date\)/);
    expect(note).toMatch(/blazon approvals/);
  });

  it('changes no file of an existing brand: a second run keeps every file it finds, extract.json too', async () => {
    const dir = await fromAcme();
    const snapshot = (folder: string): Record<string, string> =>
      Object.fromEntries(
        fs
          .readdirSync(folder, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => {
            const file = path.join(e.parentPath, e.name);
            return [path.relative(folder, file), fs.readFileSync(file, 'utf8')];
          }),
      );
    const before = snapshot(dir);
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
    expect(await runInit(dir, { fromDir: acmeSavedSite() })).toBe(0);
    // init copies back the starter files that are missing (as a plain `blazon init` does), and changes none that is there
    const after = snapshot(dir);
    for (const [file, text] of Object.entries(before)) expect(after[file], file).toBe(text);
    expect(lines.join('\n')).toMatch(/extract\.json already existed, so it was kept/);
    expect(lines.join('\n')).toMatch(/tokens\/colors\.json already existed/);
  });

  it('downloads no font and sets no font license', async () => {
    const dir = await fromAcme();
    // the site's two families carry no license; the starter's mono family keeps its own
    const families = json(dir, 'tokens/typography.json').font.family;
    for (const role of ['body', 'display']) expect(JSON.stringify(families[role])).not.toContain('license');
    const fontFiles = fs.readdirSync(path.join(dir, 'fonts'));
    expect(fontFiles.some((f) => /inter|grotesk/i.test(f))).toBe(false);
  });

  it('has no extractor plugin: the profile defines check and build only, and a manifest that claims an extract role is refused', () => {
    expect(BLAZON_PROFILE.roles.map((r) => r.name)).toEqual(['check', 'build']);
    expect(() => decodeManifest('{"v":2,"roles":["extract"]}', BLAZON_CORE_PROFILE)).toThrow(ManifestError);
    expect(() => decodeManifest('{"v":2,"roles":["extract"]}', BLAZON_CORE_PROFILE)).toThrow(/not one this host defines/);
  });
});
