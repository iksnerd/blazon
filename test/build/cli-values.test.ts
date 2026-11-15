import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject, tempDir } from '../support/project';

// The value of an option is the text typed. An empty one is a mistake (an unset variable in a script), and a number-looking one
// is still text: the parser turned both into numbers, so `--name ""` became the title "0".

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
    timeout: 60_000,
  });

describe('an option with an empty value', () => {
  it.each([
    ['init', ['--name', ''], '--name'],
    ['init', ['--description', ''], '--description'],
    ['init', ['--font', ''], '--font'],
    ['init', ['--color', ''], '--color'],
    ['init', ['--logo', ''], '--logo'],
    ['init', ['--name='], '--name'],
    ['build', ['-o', ''], '-o'],
    ['build', ['--outDir='], '--outDir'],
  ])('%s %j is refused with exit 2 and the option named', (command, args, flag) => {
    const dir = path.join(tempDir('blazon-empty-value-'), 'x');
    const ran = blazon(command, dir, ...args, ...(command === 'init' ? ['--yes'] : []));
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe(`blazon ${command}: ${flag} needs a value, not an empty one.`);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('an option value that looks like a number', () => {
  it('is kept as the text it was typed', () => {
    const dir = path.join(tempDir('blazon-number-value-'), 'x');
    const ran = blazon('init', dir, '--name', '007', '--yes');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf-8')).toContain('title: "007"');
  });
});

describe('blazon preview with nothing built', () => {
  it('exits 2 and says to build first, instead of serving an empty folder', async () => {
    const root = await starterProject();
    const ran = blazon('preview', root, '--port=3978');
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n').slice(0, 2)).toEqual([`blazon preview: no built site at "${path.join(root, 'dist', 'site')}"`, `  Run blazon build ${root} first.`]);
  });
});

describe('a negative port', () => {
  it.each(['dev', 'preview'])('is called a port by %s, not an unknown option', (command) => {
    const ran = blazon(command, '-p', '-1');
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe(`blazon ${command}: the port must be a whole number from 1 to 65535, not "-1".`);
  });
});
