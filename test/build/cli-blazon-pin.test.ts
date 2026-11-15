import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// blazon.lock through the real command: another blazon is refused by check and build, and no lock means no check.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

async function lockedProject(commit: string): Promise<string> {
  const root = await starterProject();
  fs.writeFileSync(path.join(root, 'blazon.lock'), `{\n  "v": 1,\n  "commit": "${commit}"\n}\n`);
  return root;
}

describe('blazon.lock through the CLI', () => {
  it('check refuses another blazon: exit 1, the finding with its file and line in --json, and a Next: step', async () => {
    const root = await lockedProject('0'.repeat(40));
    const json = blazon('check', root, '--json');
    expect(json.status, json.stdout + json.stderr).toBe(1);
    const finding = JSON.parse(json.stdout).findings.find((f: { code: string }) => f.code === 'blazon-pin-mismatch');
    expect(finding).toMatchObject({ severity: 'error', file: 'blazon.lock', line: 3 });
    const text = blazon('check', root);
    expect(text.stdout).toContain('Next:');
    expect(text.stdout).toContain('blazon-pin-mismatch');
  });

  it('build stops before it writes anything', async () => {
    const root = await lockedProject('0'.repeat(40));
    const ran = blazon('build', root);
    expect(ran.status).toBe(1);
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  });

  it('a malformed lock is blazon-pin-invalid', async () => {
    const root = await lockedProject('short');
    const ran = blazon('check', root, '--json');
    expect(ran.status).toBe(1);
    expect(JSON.parse(ran.stdout).findings.some((f: { code: string }) => f.code === 'blazon-pin-invalid')).toBe(true);
  });

  it('no lock, no check', async () => {
    const ran = blazon('check', await starterProject(), '--json');
    expect(ran.status).toBe(0);
    expect(ran.stdout).not.toContain('blazon-pin');
  });

  it('blazon pin refuses to write when this blazon is not a clean commit, and otherwise writes a lock that check accepts', async () => {
    const root = await starterProject();
    const pinned = blazon('pin', root);
    if (pinned.status === 0) {
      expect(blazon('check', root, '--json').stdout).not.toContain('blazon-pin');
    } else {
      expect(pinned.stderr).toMatch(/uncommitted changes|cannot say which commit/);
      expect(fs.existsSync(path.join(root, 'blazon.lock'))).toBe(false);
    }
  });
});
