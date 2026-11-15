import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { summarizeFindings } from '../../../src/core/checker/index.js';
import { starterFiles as allStarterFiles } from '../../../src/core/starter.js';
import { starterProject } from '../../support/project';
import { REPO } from '../../support/paths';
import { hasReference, referencePath } from '../../support/reference';

// `starter-file` (RFC 0001 §4): a note for each file still byte for byte what `blazon init` wrote.

async function notes(root: string): Promise<string[]> {
  const data = await compileBlazonData(await loadConfig(root), root);
  return data.findings
    .filter((f) => f.code === 'starter-file')
    .map((f) => f.path)
    .sort();
}

// The config, the resolver document and the agent notes are not scanned: docs/, tokens/, assets/ and fonts/ are
const NOT_SCANNED = new Set(['blazon.config.ts', 'blazon.resolver.json', 'AGENTS.md', 'CLAUDE.md']);
const starterFiles = (): string[] => allStarterFiles().filter((f) => !NOT_SCANNED.has(f));

describe('starter-logo', () => {
  it("warns for each configured logo that is blazon's own mark, and not once the file is replaced", async () => {
    const root = await starterProject();
    const logos = async () => (await compileBlazonData(await loadConfig(root), root)).findings.filter((f) => f.code === 'starter-logo');
    const before = await logos();
    expect(before.map((f) => f.severity)).toEqual(['warning', 'warning']);
    expect(before.map((f) => f.path).sort()).toEqual(['./assets/logos/blazon-bone.svg', './assets/logos/blazon-graphite.svg']);
    fs.writeFileSync(path.join(root, 'assets/logos/blazon-graphite.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
    expect((await logos()).map((f) => f.path)).toEqual(['./assets/logos/blazon-bone.svg']);
  });
});

describe('starter-file', () => {
  it('notes each file of a fresh project once, the config left out', async () => {
    const root = await starterProject();
    const found = await notes(root);
    expect(found).toEqual(starterFiles());
    expect(found).toContain('docs/01-principles.md');
    expect(found).not.toContain('blazon.config.ts');
  });

  it("flags everything of blazon's identity until it is edited: the logos, the type scale and fonts, the pages about blazon", async () => {
    const found = await notes(await starterProject());
    for (const identity of [
      'assets/logos/blazon-graphite.svg',
      'assets/logos/blazon-bone.svg',
      'assets/construction/blazon-mark.svg',
      'tokens/typography.json',
      'tokens/colors.json',
      'docs/01-principles.md',
      'docs/02-logo.md',
      'docs/04-type.md',
    ])
      expect(found, identity).toContain(identity);
    // and the type scale stays flagged while only the colors are the brand's: init's colour answer edits colors.json alone
    const root = await starterProject();
    fs.appendFileSync(path.join(root, 'tokens/colors.json'), '\n');
    const after = await notes(root);
    expect(after).not.toContain('tokens/colors.json');
    expect(after).toContain('tokens/typography.json');
    expect(after).toContain('assets/logos/blazon-graphite.svg');
  });

  it('drops the note for a file the project edited, and only that one', async () => {
    const root = await starterProject();
    const before = await notes(root);
    fs.appendFileSync(path.join(root, 'docs/01-principles.md'), '\nOur own words.\n');
    const after = await notes(root);
    expect(after).toEqual(before.filter((f) => f !== 'docs/01-principles.md'));
  });

  it('notes the starter font files, and drops the notes when fonts/ is gone or the font is the brand own', async () => {
    const root = await starterProject();
    expect(await notes(root)).toEqual(expect.arrayContaining(['fonts/IBMPlexMono-Regular-latin.woff2', 'fonts/OFL.txt']));
    fs.appendFileSync(path.join(root, 'fonts/OFL.txt'), '\nOurs.\n');
    expect(await notes(root)).not.toContain('fonts/OFL.txt');
    expect(await notes(root)).toContain('fonts/IBMPlexMono-Regular-latin.woff2');
    fs.rmSync(path.join(root, 'fonts'), { recursive: true });
    expect((await notes(root)).filter((f) => f.startsWith('fonts/'))).toEqual([]);
  });

  it('says what to do, as a note', async () => {
    const root = await starterProject();
    const data = await compileBlazonData(await loadConfig(root), root);
    const note = data.findings.find((f) => f.code === 'starter-file' && f.path === 'docs/01-principles.md');
    expect(note).toMatchObject({ severity: 'info', message: "docs/01-principles.md is still the starter's text: replace it with the brand's own." });
  });

  it("reports none for blazon's own brand book, the starter's source", async () => {
    expect(await notes(path.join(REPO, 'examples', 'blazon'))).toEqual([]);
  });

  it('never fails a check, strict or not', async () => {
    const root = await starterProject();
    const data = await compileBlazonData(await loadConfig(root), root);
    expect(data.findings.some((f) => f.code === 'starter-file')).toBe(true);
    expect(summarizeFindings(data.findings, { strict: true }).errors.filter((f) => f.code === 'starter-file')).toEqual([]);
    expect(
      summarizeFindings(
        data.findings.filter((f) => f.code === 'starter-file'),
        { strict: true },
      ).passed,
    ).toBe(true);
  });
});

describe('starter-file in the repo examples', () => {
  it.skipIf(!hasReference('examples/auth0'))('reports none for the reference brand', async () => {
    expect(await notes(referencePath('examples/auth0'))).toEqual([]);
  });
});
