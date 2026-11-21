import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/init-project';

// --cwd through the real command: the same as running from that folder, resolved once, and a missing folder is exit 2.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('blazon --cwd', () => {
  it('works from that folder: check with no positional reads the brand there', async () => {
    const root = await starterProject();
    const ran = blazon('--cwd', root, 'check', '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(JSON.parse(ran.stdout).command).toBe('check');
  });

  it('is accepted after the command, and as --cwd=dir', async () => {
    const root = await starterProject();
    expect(blazon('check', '--cwd', root).status).toBe(0);
    expect(blazon(`--cwd=${root}`, 'check').status).toBe(0);
  });

  it('a positional dir is relative to --cwd', async () => {
    const root = await starterProject();
    const ran = blazon('--cwd', path.dirname(root), 'check', path.basename(root), '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    // without --cwd the same relative name is not a folder of the folder blazon runs from
    expect(blazon('check', path.basename(root)).status).not.toBe(0);
  });

  it('works for the read commands, which take their folder from the same place', async () => {
    const root = await starterProject();
    const ran = blazon('--cwd', root, 'list', '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
  });

  it('a missing folder is the usual error: exit 2, nothing run', () => {
    const ran = blazon('--cwd', path.join(REPO, 'no-such-folder'), 'check');
    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('no folder');
  });

  it('a missing folder under --json is also JSON on standard output', () => {
    const ran = blazon('--cwd', path.join(REPO, 'no-such-folder'), 'check', '--json');
    expect(ran.status).toBe(2);
    expect(JSON.parse(ran.stdout)).toMatchObject({ command: 'check', passed: false });
  });

  it('a file is not a folder', async () => {
    const root = await starterProject();
    const ran = blazon('--cwd', path.join(root, 'blazon.json'), 'check');
    expect(ran.status).toBe(2);
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  });

  it('--cwd without a value is a usage error', () => {
    expect(blazon('check', '--cwd').status).toBe(2);
  });

  it('is listed in the help', () => {
    expect(blazon('--help').stdout).toContain('--cwd <dir>');
  });
});
