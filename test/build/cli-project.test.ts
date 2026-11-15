import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// A command that is pointed at a folder with no brand book in it must say so and stop (exit 2), and must not make one: a
// build of nothing that exits 0 is a success that lied.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

const COMMANDS = ['check', 'tokens', 'build', 'dev'];

describe('a blazon.json with a syntax error', () => {
  it('says so in plain text: the parser colors its message, and blazon does not pass that on', () => {
    const dir = tempDir('blazon-badconfig-');
    fs.mkdirSync(path.join(dir, 'tokens'));
    fs.writeFileSync(path.join(dir, 'blazon.json'), '{\n  "title": "x",\n');
    const ran = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), 'check', dir], {
      encoding: 'utf-8',
      cwd: REPO,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '1' },
      input: '',
    });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('Could not load blazon.json');
    expect(ran.stderr).not.toContain('\x1b');
  });
});

describe('a command pointed at a folder with no brand book', () => {
  it.each(COMMANDS)('%s says there is no folder, exits 2, and creates nothing', (command) => {
    const missing = path.join(tempDir('blazon-none-'), 'nodir');
    const ran = blazon(command, missing);
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n').slice(0, 2)).toEqual([`blazon ${command}: no folder "${missing}"`, `  Run blazon init ${missing} to start a brand book there.`]);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it.each(COMMANDS)('%s says there is no tokens folder in an empty folder, exits 2, and creates nothing', (command) => {
    const empty = tempDir('blazon-empty-');
    const ran = blazon(command, empty);
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n').slice(0, 2)).toEqual([
      `blazon ${command}: no tokens folder (tokens) in "${empty}"`,
      `  Run blazon init ${empty} to start a brand book there, or set tokensDir in blazon.json.`,
    ]);
    expect(fs.readdirSync(empty)).toEqual([]);
  });

  it('names the tokens folder the config sets, when that is the one missing', () => {
    const dir = tempDir('blazon-config-');
    fs.writeFileSync(path.join(dir, 'blazon.json'), '{"tokensDir": "./design/tokens"}\n');
    const ran = blazon('check', dir);
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toContain('no tokens folder (design/tokens) in');
  });

  it('drift says so, and exits 2, when --tokens names a folder that is not there', () => {
    const css = path.join(tempDir('blazon-drift-'), 'site.css');
    fs.writeFileSync(css, ':root { --a: #fff; }\n');
    const missing = path.join(tempDir('blazon-drift-t-'), 'nope');
    const ran = blazon('drift', css, '--tokens', missing);
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n')[0]).toContain('no tokens folder');
  });
});

describe('blazon drift with nothing to compare', () => {
  it('exits 2 and says why, because a gate that compares nothing passes for the wrong reason', () => {
    const root = tempDir('blazon-drift-none-');
    fs.mkdirSync(path.join(root, 'tokens'));
    fs.writeFileSync(path.join(root, 'tokens/c.json'), JSON.stringify({ color: { a: { $type: 'color', $value: '#ffffff' } } }));
    const css = path.join(root, 'site.css');
    fs.writeFileSync(css, ':root { --a: #fff; }\n');
    const ran = blazon('drift', css, '--tokens', path.join(root, 'tokens'));
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr).toContain('blazon drift: no token declares a source.cssVar, so there is nothing to compare');
  });
});
