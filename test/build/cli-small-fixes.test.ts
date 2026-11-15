import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// Edges an outside review of the installed command line found: a pass with nothing checked, a wrong default in the help, raw system
// errors, and an empty value taken for something else.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('a brand with no tokens in it', () => {
  const empty = () => {
    const root = tempDir('blazon-no-tokens-');
    fs.mkdirSync(path.join(root, 'tokens'));
    fs.writeFileSync(path.join(root, 'tokens/x.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
    fs.writeFileSync(path.join(root, 'blazon.config.ts'), "export default { logo: './logo.svg' };\n");
    return root;
  };

  it('is a warning, with a fix, and not a silent pass', () => {
    const ran = blazon('check', empty(), '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    const report = JSON.parse(ran.stdout);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'tokens-empty', severity: 'warning', fix: expect.stringContaining('token') }));
  });

  it('fails with --strict', () => {
    expect(blazon('check', empty(), '--strict').status).toBe(1);
  });
});

describe('the help', () => {
  it.each(['check', 'build', 'tokens'])('does not say --no-plugins is on by default, in %s', (command) => {
    const line = blazon(command, '--help')
      .stdout.split('\n')
      .find((l) => l.includes('--no-plugins'));
    if (line) expect(line).not.toContain('default: true');
  });
});

describe('blazon pin and blazon plugin pin on something that is not there', () => {
  it('say so, with the fix on the next line, and exit 2', () => {
    const missing = path.join(tempDir('blazon-pin-'), 'nodir');
    const ran = blazon('pin', missing);
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n').slice(0, 2)).toEqual([`blazon pin: no folder "${missing}"`, `  Run blazon init ${missing} to start a brand book there.`]);
    const plugin = blazon('plugin', 'pin', '/nonexistent/plugin');
    expect(plugin.status).toBe(2);
    expect(plugin.stderr.split('\n')[0]).toBe('blazon plugin pin: there is nothing at /nonexistent/plugin.');
  });
});

describe('an empty value', () => {
  it.each(['dev', 'preview'])('for the port of %s is called empty, not 0', (command) => {
    const ran = blazon(command, '-p', '');
    expect(ran.status).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe(`blazon ${command}: -p needs a value, not an empty one.`);
  });

  it('for the folder is refused, and does not mean the current folder', () => {
    const ran = blazon('check', '');
    expect(ran.status, ran.stdout + ran.stderr).toBe(2);
    expect(ran.stderr.split('\n')[0]).toBe('blazon check: the folder is an empty name; leave it out to use the current folder.');
  });
});
