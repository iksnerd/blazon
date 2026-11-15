import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO } from '../support/paths';
import { starterProject, tempDir } from '../support/project';

// The text a person reads, run from the folder above the brand as a newcomer does after `blazon init a`: every path is one
// they can click (file:line, as tsc and eslint print it) and every command is one that works from where they are.

// tsx by its address, because a test that runs blazon from another folder cannot find it by name
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

const blazonIn = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

/** The starter with color.base.bone set to something that is not a color, written over several lines so the line number means something. */
async function brokenProject(): Promise<string> {
  const root = await starterProject();
  const file = path.join(root, 'tokens/colors.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('"#F2F0EB"', '"notacolor"'));
  return root;
}

describe('findings in text', () => {
  it('start with file:line from where blazon runs, then the token path, and --json keeps the project-relative file', async () => {
    const root = await brokenProject();
    const [parent, name] = [path.dirname(root), path.basename(root)];
    const json = JSON.parse(blazonIn(parent, 'check', name, '--json', '--no-plugins').stdout);
    const bone = json.findings.find((f: { path: string }) => f.path === 'color.base.bone');
    expect(bone).toMatchObject({ file: 'tokens/colors.json', line: expect.any(Number) });

    const out = blazonIn(parent, 'check', name, '--no-plugins').stdout;
    expect(out).toContain(`ERROR  ${name}/tokens/colors.json:${bone.line}  color.base.bone: "notacolor" is not a color`);
  }, 60_000);

  it('build prints the same lines through the same formatter', async () => {
    const root = await brokenProject();
    const out = blazonIn(path.dirname(root), 'build', path.basename(root), '--no-plugins').stdout;
    expect(out).toMatch(new RegExp(`ERROR  ${path.basename(root)}/tokens/colors\\.json:\\d+  color\\.base\\.bone: `));
  }, 60_000);
});

describe('next steps name the folder', () => {
  it('after blazon init a, every step works from the parent folder', () => {
    const parent = tempDir('blazon-next-');
    const out = blazonIn(parent, 'init', 'a').stdout;
    expect(out).toContain('1. Edit a/tokens/colors.json with your colors');
    expect(out).toContain('2. Run blazon dev a to see the book');
    expect(out).toContain("3. Replace blazon's artwork in a/assets/ and the text in a/docs/");
    expect(out).toContain('4. Run blazon check a to see what is left');
    expect(out).toContain('5. Point a coding agent at a/AGENTS.md');
    expect(out).not.toMatch(/blazon dev to see/);
  }, 60_000);

  it('after --color, says the primary color is set instead of asking for it', () => {
    const parent = tempDir('blazon-next-');
    const out = blazonIn(parent, 'init', 'b', '--color', '2563eb').stdout;
    expect(out).not.toContain('with your colors');
    expect(out).toContain('1. Finish the palette in b/tokens/colors.json: the primary color is set');
  }, 60_000);

  it('in the folder itself, names no folder', () => {
    const here = tempDir('blazon-next-');
    const out = blazonIn(here, 'init').stdout;
    expect(out).toContain('2. Run blazon dev to see the book');
    expect(out).toContain('1. Edit tokens/colors.json with your colors');
  }, 60_000);

  it('blazon check <dir> on the starter names the folder in its Next block', async () => {
    const root = await starterProject();
    const name = path.basename(root);
    const out = blazonIn(path.dirname(root), 'check', name, '--no-plugins').stdout;
    expect(out).toContain(`1. Edit ${name}/tokens/colors.json with your colors`);
    expect(out).toContain(`2. Run blazon dev ${name} to see the book`);
  }, 60_000);

  it('a failed check says to run blazon check <dir> again', async () => {
    const root = await brokenProject();
    const out = blazonIn(path.dirname(root), 'check', path.basename(root), '--no-plugins').stdout;
    expect(out).toMatch(new RegExp(`\\d\\. Run blazon check ${path.basename(root)} again`));
  }, 60_000);
});

describe('errors in text: what happened on the first line, the fix on its own line', () => {
  it('a build stopped by the check', async () => {
    const root = await brokenProject();
    const ran = blazonIn(path.dirname(root), 'build', path.basename(root), '--no-plugins');
    expect(ran.status).toBe(1);
    expect(ran.stderr).not.toContain('[blazon build error]');
    expect(ran.stderr).toMatch(/^blazon build: blazon check found \d+ error\(s\)\n {2}Fix them, or run blazon check \S+ for details\.$/m);
  }, 60_000);

  it('an invalid config, with the --debug hint after the fix', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'blazon.json'), '{"tokenDir": 1}\n');
    const ran = blazonIn(root, 'check');
    expect(ran.status).toBe(1);
    expect(ran.stderr).not.toContain('[blazon check error]');
    expect(ran.stderr).toMatch(/^blazon check: blazon\.config\.ts is invalid:/m);
    expect(ran.stderr).toMatch(/\n {2}Run again with --debug for the stack\.\n$/);
  }, 60_000);

  it('drift with a CSS file that is not there names the file as typed, with no ENOENT', async () => {
    const root = await starterProject();
    const ran = blazonIn(root, 'drift', 'nope.css');
    expect(ran.status).toBe(2);
    expect(ran.stderr).not.toContain('ENOENT');
    expect(ran.stderr).toBe('blazon drift: there is no file "nope.css"\n  Give the path of a CSS file, or the http(s) address of a page.\n');
    const json = JSON.parse(blazonIn(root, 'drift', 'nope.css', '--json').stdout);
    expect(json.error.message).not.toContain('ENOENT');
    expect(Object.keys(json.error).sort()).toEqual(['code', 'fix', 'message']);
  }, 60_000);
});
