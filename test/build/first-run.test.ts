import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject, tempDir } from '../support/project';
import { literal, starterFacts } from '../support/starter-facts';
import { runInit } from '../../src/cli/commands/init.js';

// What a new user sees: `blazon init`, then `blazon check` on the starter. The findings stay one for each file in the
// data; only the text the command prints is grouped.

// NO_COLOR wins over FORCE_COLOR in picocolors, and CI sets FORCE_COLOR: without it the output carries ANSI codes.
const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd: REPO, env: { ...process.env, NO_COLOR: '1' } });

describe('blazon check on the starter', () => {
  it('prints the starter-file-unchanged notes once for each folder, and warns only about the starter logos', async () => {
    const root = await starterProject({ plugins: 'starter' });
    const result = blazon('check', root);
    const out = result.stdout;
    expect(result.status, out + result.stderr).toBe(0);

    // The counts and the first five names come from the folders the starter is copied from, not from the command
    const starter = starterFacts();
    const shown = starter.docsByName.slice(0, 5).join(', ');
    const more = starter.docs.length > 5 ? ` and ${starter.docs.length - 5} more` : '';
    expect(out).toMatch(new RegExp(`NOTE\\s+docs\\/: ${starter.docs.length} files are still the starter's text \\(${literal(shown)}${more}\\)`));
    expect(out).toMatch(new RegExp(`NOTE\\s+tokens\\/: ${starter.tokens.length} files are still the starter's text`));
    expect(out).toMatch(new RegExp(`NOTE\\s+assets\\/: ${starter.assets.length} files are still the starter's text`));
    expect(out).toMatch(new RegExp(`NOTE\\s+fonts\\/: ${starter.fonts.length} files are still the starter's text \\(${literal(starter.fonts.join(', '))}\\)`));
    expect(out).not.toContain('docs/01-principles.md is still the starter');

    // The starter is blazon's own brand book: nothing in it is marked for review, and the only warnings are its two logos
    const warned = out.split('\n').filter((line) => /WARN/.test(line));
    expect(warned).toHaveLength(2);
    expect(warned.every((line) => line.includes('[starter-logo-unchanged]'))).toBe(true);

    // The summary counts findings, not the lines
    expect(out).toContain(`2 warning(s) and ${starterFacts().notes} note(s)`);
  }, 60_000);

  it('adds a Next block while the project is mostly the starter', async () => {
    const root = await starterProject({ plugins: 'starter' });
    const out = blazon('check', root).stdout;
    expect(out).toContain('Next:');
    // Run from the repository, the project is a folder elsewhere: every step names it, so it works as typed
    expect(out).toContain(`1. Edit ${root}/tokens/colors.json with your colors`);
    expect(out).toContain(`2. Run blazon dev ${root} to see the book`);
    expect(out).toContain(`3. Replace blazon's artwork in ${root}/assets/ and the text in ${root}/docs/`);
    expect(out.indexOf('Next:')).toBeGreaterThan(out.indexOf('NOTE'));
  }, 60_000);

  it('adds nothing once fewer than five starter files are left', async () => {
    const root = await starterProject({ plugins: 'starter' });
    // Change every starter file but three: a nearly finished brand
    const keep = new Set(['docs/01-principles.md', 'docs/02-logo.md', 'docs/03-color.md']);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const folder of ['docs', 'tokens', 'assets', 'fonts']) {
      for (const file of walk(path.join(root, folder))) {
        if (!keep.has(path.relative(root, file).split(path.sep).join('/'))) fs.appendFileSync(file, file.endsWith('.json') ? '\n' : '\n<!-- edited -->\n');
      }
    }
    const out = blazon('check', root).stdout;
    expect(out).not.toContain('Next:');
    // Fewer than two in a folder: still one line each, as before
    expect(out).toContain('docs/: 3 files are still the starter');
  }, 60_000);
});

describe('blazon init output', () => {
  afterEach(() => vi.restoreAllMocks());

  async function initOutput(): Promise<{ out: string; dir: string }> {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = tempDir('blazon-init-');
    await runInit(dir);
    return { out: log.mock.calls.map((c) => c.join(' ')).join('\n'), dir };
  }

  it('lists what it created, the numbered next steps, and where the manual is', async () => {
    const { out, dir } = await initOutput();
    const starter = starterFacts();
    expect(out).toContain(`Created tokens/ (${starter.tokens.length} files: ${starter.tokens.join(', ')})`);
    expect(out).toContain(`Created assets/ (${starter.assets.length} files in ${starter.assetFolders.length} folders: ${starter.assetFolders.join(', ')})`);
    expect(out).toContain(`Created docs/ (${starter.docs.length} pages, ${starter.docsByName[0]} to ${starter.docsByName.at(-1)})`);
    expect(out).toContain('Created blazon.json');
    expect(out).toContain('Created blazon.resolver.json');
    // The folder is not under the folder the test runs in, so each step names it in full
    expect(out).toContain(`1. Edit ${dir}/tokens/colors.json with your colors`);
    expect(out).toMatch(new RegExp(`2\\. Run\\s+blazon dev ${literal(dir)}`));
    expect(out).toContain(`3. Replace blazon's artwork in ${dir}/assets/ and the text in ${dir}/docs/`);
    expect(out).toMatch(new RegExp(`4\\. Run\\s+blazon check ${literal(dir)}`));
    expect(out).not.toMatch(/The manual:|vercel\.app/);
  });
});
