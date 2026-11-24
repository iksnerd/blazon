import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/init-project';

// `blazon outputs`: what the last `blazon tokens` wrote, fresh or stale, and one file's text. It reads only.

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

describe('blazon outputs', () => {
  it('lists nothing and names the fix before any run, then the files after blazon tokens', () => {
    const before = JSON.parse(blazon('outputs', root, '--json').stdout);
    expect(before).toMatchObject({ command: 'outputs', outputsDir: 'dist/tokens', files: [], missing: [], fix: 'blazon tokens' });
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);

    expect(blazon('tokens', root).status).toBe(0);
    const outDir = path.join(root, 'dist', 'tokens');
    const later = Date.now() / 1000 + 3600;
    for (const name of fs.readdirSync(outDir)) fs.utimesSync(path.join(outDir, name), later, later);
    const fresh = JSON.parse(blazon('outputs', root, '--json').stdout);
    expect(fresh.files.map((f: { file: string }) => f.file)).toContain('theme.css');
    expect(fresh.files.every((f: { state: string }) => f.state === 'fresh')).toBe(true);
    expect(fresh).not.toHaveProperty('passed');
    expect(blazon('outputs', root).stdout).toContain('theme.css');

    const tokenFile = path.join(
      root,
      'tokens',
      fs.readdirSync(path.join(root, 'tokens')).find((f) => f.endsWith('.json'))!,
    );
    fs.utimesSync(tokenFile, later + 3600, later + 3600);
    const stale = JSON.parse(blazon('outputs', root, '--json').stdout);
    expect(stale.files.every((f: { state: string }) => f.state === 'stale')).toBe(true);
    expect(stale.fix).toBe('blazon tokens');
  }, 120_000);

  it('prints one file with --file, and refuses a path that leaves the outputs folder with exit 2', () => {
    const ran = blazon('outputs', root, '--file', 'theme.css');
    expect(ran.status).toBe(0);
    expect(ran.stdout).toBe(fs.readFileSync(path.join(root, 'dist', 'tokens', 'theme.css'), 'utf-8'));
    const asJson = JSON.parse(blazon('outputs', root, '--file', 'theme.css', '--json').stdout);
    expect(asJson).toMatchObject({ truncated: false });
    expect(asJson.text).toBe(ran.stdout);
    const refused = blazon('outputs', root, '--file', '../../blazon.json', '--json');
    expect(refused.status).toBe(2);
    expect(JSON.parse(refused.stdout).error.code).toBe('invalid-option-value');
    expect(blazon('outputs', root, '--file', 'missing.css').status).toBe(2);
  }, 120_000);
});
