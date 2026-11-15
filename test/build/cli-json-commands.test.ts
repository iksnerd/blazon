import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { starterProject, tempDir } from '../support/project';

// `--severity` cuts the list that `--json` prints, so without `--json` it has nothing to cut: that is a mistake to say, not to ignore.
// `tokens` and `init` print JSON like `check` and `build` do: one document on standard output, the human text on standard error.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('--severity without --json', () => {
  it.each(['check', 'build', 'tokens'])(
    'is refused by %s: exit 2, one line, nothing run',
    async (command) => {
      const root = await starterProject();
      const result = blazon(command, root, '--severity', 'error');
      expect(result.status).toBe(2);
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain(`blazon ${command}: --severity cuts the list that --json prints; add --json, or leave --severity out.`);
      expect(result.stdout).toBe('');
    },
    60_000,
  );

  it('still works with --json', async () => {
    const root = await starterProject();
    const result = blazon('check', root, '--json', '--severity', 'error');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([]);
  }, 60_000);
});

describe('blazon tokens --json', () => {
  it('prints the findings like build does, and the files still get written', async () => {
    const root = await starterProject();
    const result = blazon('tokens', root, '--json', '--no-plugins');
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ command: 'tokens', passed: true });
    expect(out.counts).toEqual(expect.objectContaining({ errors: 0 }));
    expect(fs.existsSync(path.join(root, 'dist/tokens/tokens.json'))).toBe(true);
  }, 60_000);

  it('exits 1 with the errors in the document when a token is wrong', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{ bad json');
    const result = blazon('tokens', root, '--json', '--no-plugins');
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.passed).toBe(false);
    expect(out.findings.some((f: { code: string }) => f.code === 'invalid-json')).toBe(true);
  }, 60_000);

  it('says a failure that is not a finding as JSON too', () => {
    const result = blazon('tokens', path.join(tempDir('blazon-none-'), 'missing'), '--json');
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'tokens', passed: false });
  }, 60_000);
});

describe('blazon init --json', () => {
  it('prints what it made on standard output and the usual text on standard error', () => {
    const dir = path.join(tempDir('blazon-init-json-'), 'book');
    const result = blazon('init', dir, '--json');
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ command: 'init', passed: true, dir });
    expect(out.created).toEqual(expect.arrayContaining(['blazon.config.ts', 'tokens/colors.json']));
    expect(out.kept).toEqual([]);
    expect(result.stderr).toContain('Initializing Blazon Brand Book');
  }, 60_000);

  it('lists the starter files that were already there as kept', () => {
    const dir = path.join(tempDir('blazon-init-json-'), 'book');
    blazon('init', dir, '--yes');
    const again = JSON.parse(blazon('init', dir, '--json').stdout);
    expect(again.created).toEqual([]);
    expect(again.kept).toContain('blazon.config.ts');
  }, 90_000);

  it('does not start the dev server: --dev with --json is refused', () => {
    const result = blazon('init', path.join(tempDir('blazon-init-json-'), 'book'), '--json', '--dev');
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'init', passed: false });
  }, 60_000);
});

describe('blazon init --json errors', () => {
  it.each([
    [['--from', 'ftp://x'], 'invalid-option-value'],
    [['--color', 'not-a-color'], 'invalid-option-value'],
    [['--from', 'http://127.0.0.1:1/'], 'site-unreadable'],
  ])(
    '%j carries the code %s',
    (args, code) => {
      const result = blazon('init', path.join(tempDir('blazon-init-json-'), 'book'), '--json', ...args);
      expect(result.status, result.stdout + result.stderr).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({ command: 'init', passed: false, error: { code, message: expect.any(String) } });
    },
    60_000,
  );
});

describe('blazon pin --json', () => {
  it('says a folder that is not there as JSON, exit 2', () => {
    const result = blazon('pin', path.join(tempDir('blazon-pin-json-'), 'missing'), '--json');
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'pin', passed: false, error: { message: expect.stringContaining('no folder') } });
  }, 60_000);
});
