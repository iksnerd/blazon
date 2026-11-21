import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOCK_FILE, readLock } from '../../../src/plugins/pins/lock.js';
import { fileDigest } from '../../../src/plugins/pins/pin.js';
import { blazon, output, plugin, answer, project } from '../../support/plugin-roles';

// The roles through the real commands (RFC 0002 of blazon, section 2), the part on blazon plugin pin --name and the --no-plugins flag: plugins pinned in the lock and allowed by the
// config, run as processes so the exit status is the real one. The other parts are in commands-*.test.ts.

describe('blazon plugin pin --name', () => {
  const tree = (root: string, name = 'acme.house-style') => {
    const dir = path.join(root, 'plugins', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `blazon-${name}`), plugin(['check'], answer([])), { mode: 0o755 });
    fs.chmodSync(path.join(dir, `blazon-${name}`), 0o755);
    return dir;
  };

  it('records the pin as computed, says so, and `blazon check` then runs the plugin', async () => {
    const root = await project({});
    const dir = tree(root);
    const result = blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style');
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain('acme.house-style');
    expect(result.stdout).toMatch(/t1:[0-9a-f]{64}/);
    expect(result.stdout).toContain('computed');
    expect(readLock(root).lock.plugins['acme.house-style']).toMatchObject({ kind: 'tree', source: 'computed', entry: 'blazon-acme.house-style' });
  }, 120_000);

  it('records a digest the operator vouched for when the bytes match, and refuses it when they do not', async () => {
    const root = await project({});
    const file = path.join(tree(root), 'blazon-acme.house-style');
    const good = blazon(root, 'plugin', 'pin', file, '--name', 'acme.house-style', '--digest', fileDigest(file));
    expect(good.status, output(good)).toBe(0);
    expect(good.stdout).toContain('vouched');
    const before = fs.readFileSync(path.join(root, LOCK_FILE), 'utf-8');
    const bad = blazon(root, 'plugin', 'pin', file, '--name', 'acme.house-style', '--digest', `sha256:${'0'.repeat(64)}`);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('you vouched for');
    expect(fs.readFileSync(path.join(root, LOCK_FILE), 'utf-8')).toBe(before);
  }, 120_000);

  it('takes the entry from --entry, and refuses a name that is not a plugin name', async () => {
    const root = await project({});
    const dir = tree(root);
    fs.renameSync(path.join(dir, 'blazon-acme.house-style'), path.join(dir, 'run'));
    expect(blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style').stderr).toContain('needs --entry');
    expect(blazon(root, 'plugin', 'pin', dir, '--name', 'acme.house-style', '--entry', 'run').status).toBe(0);
    const bad = blazon(root, 'plugin', 'pin', dir, '--name', 'House Style');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('not a plugin name');
  }, 120_000);

  it('still only prints the digest without --name, and writes no lock', async () => {
    const root = await project({});
    const result = blazon(root, 'plugin', 'pin', tree(root));
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^t1:[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(root, LOCK_FILE))).toBe(false);
  }, 120_000);
});

describe('--no-plugins', () => {
  // A check plugin the config allows but nothing pins is an error on its own, so the run fails unless no plugin is run at all.
  const failing = () => project({ 'acme.house-style': { script: plugin(['check'], answer([])), pinned: false } });

  it('runs no plugin in blazon check, though the config allows one that would fail it', async () => {
    const root = await failing();
    expect(blazon(root, 'check').status).toBe(1);
    const result = blazon(root, 'check', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).not.toContain('is not pinned');
  }, 120_000);

  it('runs no plugin in blazon tokens, and still writes the tokens', async () => {
    const root = await failing();
    expect(blazon(root, 'tokens').status).toBe(1);
    const result = blazon(root, 'tokens', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/tokens/tokens.json'))).toBe(true);
  }, 120_000);

  it('runs no plugin in blazon build, and still builds the book', async () => {
    const root = await failing();
    expect(blazon(root, 'build').status).toBe(1);
    const result = blazon(root, 'build', '--no-plugins');
    expect(result.status, output(result)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('cannot be combined with --plugin: exit 2 and nothing runs', async () => {
    const root = await failing();
    const result = blazon(root, 'check', '--no-plugins', '--plugin', '/bin/true');
    expect(result.status).toBe(2);
    expect(output(result)).toContain('--no-plugins runs no plugin, so it cannot be used with --plugin');
  }, 120_000);
});
