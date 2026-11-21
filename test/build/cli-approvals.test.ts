import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempProject } from '../support/project';

// `blazon approvals` prints the fingerprint of every token and asset marked review ok, and writes nothing.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

const token = (value: string, review?: unknown) => ({ $value: value, ...(review !== undefined && { $extensions: { 'dev.blazon': { review } } }) });

describe('blazon approvals', () => {
  it('lists each approved token with its fingerprint and whether review.value holds it', () => {
    const root = tempProject({
      'tokens/a.json': {
        color: {
          $type: 'color',
          fresh: token('#111111', { status: 'ok' }),
          old: token('#222222', { status: 'ok', value: '000000000000' }),
          open: token('#333333', { status: 'needs-review' }),
        },
      },
    });
    const first = blazon('approvals', root);
    const rows = first.stdout.split('\n').filter((line) => line.includes('color.'));

    expect(first.status, first.stdout + first.stderr).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^\s+color\.fresh\s+[0-9a-f]{12}\s+not recorded$/);
    expect(rows[1]).toMatch(/^\s+color\.old\s+[0-9a-f]{12}\s+stale$/);

    const fingerprint = /color\.fresh\s+([0-9a-f]{12})/.exec(first.stdout)![1]!;
    const recorded = tempProject({ 'tokens/a.json': { color: { $type: 'color', fresh: token('#111111', { status: 'ok', value: fingerprint }) } } });
    expect(blazon('approvals', recorded).stdout).toMatch(new RegExp(`color\\.fresh\\s+${fingerprint}\\s+recorded`));
  }, 120_000);

  it('prints the same rows as JSON with --json, and nothing else on standard output', () => {
    const root = tempProject({
      'tokens/a.json': {
        color: {
          $type: 'color',
          fresh: token('#111111', { status: 'ok' }),
          old: token('#222222', { status: 'ok', value: '000000000000' }),
          open: token('#333333', { status: 'needs-review' }),
        },
      },
    });
    const ran = blazon('approvals', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    const out = JSON.parse(ran.stdout);
    expect(out).toMatchObject({ command: 'approvals', passed: true });
    expect(out.approvals).toEqual([
      { path: 'color.fresh', fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/), state: 'not recorded' },
      { path: 'color.old', fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/), state: 'stale' },
    ]);
  }, 120_000);

  it('prints an empty list as JSON when nothing is approved, and says a missing folder as JSON', () => {
    const none = JSON.parse(blazon('approvals', tempProject({ 'tokens/a.json': { color: { $type: 'color', ink: token('#111111') } } }), '--json').stdout);
    expect(none).toEqual({ command: 'approvals', passed: true, approvals: [] });
    const missing = blazon('approvals', '/nonexistent-blazon-folder', '--json');
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stdout)).toMatchObject({ command: 'approvals', passed: false, error: { message: expect.stringContaining('no folder') } });
  }, 120_000);

  it('says so when nothing is approved', () => {
    const ran = blazon('approvals', tempProject({ 'tokens/a.json': { color: { $type: 'color', ink: token('#111111') } } }));
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('No token or asset is marked review.status: ok.');
  }, 120_000);

  it('prints one row for an asset in two formats, with its files, and the same as JSON', () => {
    const root = tempProject({
      'tokens/a.json': { color: { $type: 'color', ink: token('#111111') } },
      'assets/logos/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
      'assets/logos/mark.json': { review: { status: 'ok', by: 'Acme design lead', at: '2026-11-21' } },
    });
    fs.writeFileSync(path.join(root, 'assets/logos/mark.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const ran = blazon('approvals', root);
    const rows = ran.stdout.split('\n').filter((line) => line.includes('logos/mark'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^\s+logos\/mark\s+[0-9a-f]{12}\s+not recorded\s+mark\.png, mark\.svg$/);
    const out = JSON.parse(blazon('approvals', root, '--json').stdout);
    expect(out.approvals).toEqual([{ path: 'logos/mark', fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/), state: 'not recorded', files: ['mark.png', 'mark.svg'] }]);
  }, 120_000);
});
