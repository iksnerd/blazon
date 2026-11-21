import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { starterProject } from '../support/init-project';

// A person types the brand folder first (`blazon list acme`). The read commands take it last, so the folder is read as a group, path or token.
// The parse stays as it is; the failure says what happened, in one extra line on standard error.

// `--import tsx` is resolved from the folder the child runs in, so name the loader by its path
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

const blazonIn = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

let outside: string; // a folder that is not a project, with the brand folder `acme` and a stray folder `stuff` inside it
let inside: string; // a project, with another brand folder `acme` inside it
beforeAll(async () => {
  const starter = await starterProject();
  outside = tempDir('blazon-first-out-');
  fs.cpSync(starter, path.join(outside, 'acme'), { recursive: true });
  fs.mkdirSync(path.join(outside, 'stuff'));
  fs.writeFileSync(path.join(outside, 'stuff/notes.txt'), 'not a brand\n');
  inside = tempDir('blazon-first-in-');
  fs.cpSync(starter, inside, { recursive: true });
  fs.cpSync(starter, path.join(inside, 'acme'), { recursive: true });
}, 120_000);

const hintLines = (stderr: string) => stderr.split('\n').filter((line) => line.includes('was read as'));

describe('a brand folder typed first', () => {
  it.each([
    ['list', ['list', 'acme'], 'the group (a token path)', 'blazon list <group> acme, or blazon list --cwd acme'],
    ['get', ['get', 'acme'], 'the path', 'blazon get <path> acme, or blazon get <path> --cwd acme'],
    ['rules', ['rules', 'acme'], 'the path', 'blazon rules <path> acme, or blazon rules --cwd acme'],
    [
      'can',
      ['can', 'acme', 'text.primary', 'surface.canvas'],
      'the fg (a token path)',
      'blazon can text.primary surface.canvas acme, or blazon can text.primary surface.canvas --cwd acme',
    ],
  ])(
    '%s from outside a project says how the folder was read, and how to write it',
    (_command, args, read, example) => {
      const ran = blazonIn(outside, ...args);
      expect(ran.status, ran.stderr).toBe(2);
      expect(ran.stdout).toBe('');
      expect(hintLines(ran.stderr)).toEqual([`  "acme" was read as ${read}, not a folder; the folder goes last: ${example}`]);
      expect(ran.stderr).toMatch(/^blazon [a-z]+: (no tokens folder|no folder)/);
    },
    120_000,
  );

  it('keeps the exit status and the first two lines of the error as they were', () => {
    const ran = blazonIn(outside, 'list', 'acme');
    const lines = ran.stderr.split('\n');
    expect(lines[0]).toBe(`blazon list: no tokens folder (tokens) in "${outside}"`);
    expect(lines[1]).toBe('  Run blazon init to start a brand book there, or set tokensDir in blazon.json.');
    expect(lines[2]).toMatch(/was read as the group/);
  }, 120_000);

  it('hints when the current folder is a project and the folder matches no token', () => {
    for (const [args, name] of [
      [['list', 'acme'], 'group'],
      [['get', 'acme'], 'path'],
      [['rules', 'acme'], 'path'],
    ] as const) {
      const ran = blazonIn(inside, ...args);
      expect(ran.status, ran.stderr).toBe(2);
      expect(hintLines(ran.stderr), args.join(' ')).toHaveLength(1);
      expect(hintLines(ran.stderr)[0]).toContain(`"acme" was read as the ${name}`);
    }
  }, 120_000);

  it('stays quiet for a group name that is not a folder', () => {
    const ran = blazonIn(outside, 'list', 'color');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toMatch(/no tokens folder/);
    expect(ran.stderr).not.toContain('was read as');
    const typo = blazonIn(inside, 'list', 'colr');
    expect(typo.status).toBe(2);
    expect(typo.stderr).not.toContain('was read as');
  }, 120_000);

  it('stays quiet when the argument is a folder but not a brand project', () => {
    for (const args of [
      ['list', 'stuff'],
      ['get', 'stuff'],
      ['rules', 'stuff'],
    ]) {
      const ran = blazonIn(outside, ...args);
      expect(ran.status, args.join(' ')).toBe(2);
      expect(ran.stderr, args.join(' ')).not.toContain('was read as');
    }
    const inProject = blazonIn(inside, 'list', 'tokens');
    expect(inProject.stderr).not.toContain('was read as');
  }, 120_000);

  it('leaves the correct form alone: the group, then the folder', () => {
    const ran = blazonIn(outside, 'list', 'color', 'acme');
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stderr).not.toContain('was read as');
    expect(ran.stdout).toContain('color.base.bone');
    const viaCwd = blazonIn(outside, 'list', 'color', '--cwd', 'acme');
    expect(viaCwd.status, viaCwd.stderr).toBe(0);
    expect(viaCwd.stdout).toBe(ran.stdout);
  }, 120_000);

  it('puts the hint on standard error once, and keeps the JSON on standard output valid and free of it', () => {
    const ran = blazonIn(outside, 'list', 'acme', '--json');
    expect(ran.status).toBe(2);
    expect(hintLines(ran.stderr)).toHaveLength(1);
    const json = JSON.parse(ran.stdout);
    expect(json).toMatchObject({ command: 'list', passed: false, error: { code: 'no-tokens-folder' } });
    expect(ran.stdout).not.toContain('was read as');
  }, 120_000);
});
