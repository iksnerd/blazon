import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { readLockFile } from '../../src/plugins/pins/lock.js';
import { treeDigest } from '../../src/plugins/pins/pin.js';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from '../support/project';

// scripts/shipped-lock.mjs writes plugins/shipped.lock, the lock that ships beside the plugins in blazon's package
// (RFC 0005 section 3.6), and with --check says whether the one on disk is the one the folders make. The lock and the
// plugins' programs are build output (`npm run build:plugins`), so neither is committed: the suite builds them first.

const SCRIPT = path.join(ROOT_DIR, 'scripts/shipped-lock.mjs');
const TSX = path.join(ROOT_DIR, 'node_modules/.bin/tsx');

/** A plugins folder with the named plugins in it, each with its program at bin/blazon-<name>.🔌 */
function pluginsDir(names: string[]): string {
  const dir = tempDir('blazon-shipped-lock-');
  for (const name of names) {
    const bin = path.join(dir, name, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, `blazon-${name}.🔌`), `#!/bin/sh\necho ${name}\n`, { mode: 0o755 });
  }
  return dir;
}

const lock = (dir: string) => path.join(dir, 'shipped.lock');
const script = (dir: string, ...flags: string[]) => spawnSync(TSX, [SCRIPT, '--dir', dir, ...flags], { encoding: 'utf-8' });

describe('writing the lock', () => {
  it('records each folder as a tree pin with its tree digest, sorted by name', () => {
    const dir = pluginsDir(['zed.last', 'acme.first']);
    expect(script(dir).status).toBe(0);
    const text = fs.readFileSync(lock(dir), 'utf-8');
    expect(JSON.parse(text)).toEqual({
      v: 1,
      plugins: {
        'acme.first': { kind: 'tree', path: 'acme.first', entry: 'bin/blazon-acme.first.🔌', digest: treeDigest(path.join(dir, 'acme.first')), source: 'computed' },
        'zed.last': { kind: 'tree', path: 'zed.last', entry: 'bin/blazon-zed.last.🔌', digest: treeDigest(path.join(dir, 'zed.last')), source: 'computed' },
      },
    });
    expect(Object.keys(JSON.parse(text).plugins)).toEqual(['acme.first', 'zed.last']);
    expect(text.endsWith('}\n')).toBe(true);
    expect(readLockFile(lock(dir), 'shipped.lock').problems).toEqual([]);
  }, 60_000);

  it('writes the same bytes the second time, and an empty lock for no plugins', () => {
    const dir = pluginsDir(['acme.first']);
    script(dir);
    const first = fs.readFileSync(lock(dir));
    script(dir);
    expect(fs.readFileSync(lock(dir)).equals(first)).toBe(true);
    const none = pluginsDir([]);
    script(none);
    expect(JSON.parse(fs.readFileSync(lock(none), 'utf-8'))).toEqual({ v: 1, plugins: {} });
  }, 60_000);

  it('refuses a folder that is not a plugin name or has no program, and writes nothing', () => {
    const wrongName = pluginsDir(['Not_A_Name']);
    const wrong = script(wrongName);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('Not_A_Name');
    expect(fs.existsSync(lock(wrongName))).toBe(false);

    const noProgram = pluginsDir(['acme.first']);
    fs.rmSync(path.join(noProgram, 'acme.first/bin/blazon-acme.first.🔌'));
    const missing = script(noProgram);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('bin/blazon-acme.first.🔌');
  }, 60_000);

  it('refuses a program that is not executable, which the host could not start, and writes nothing', () => {
    const dir = pluginsDir(['acme.first']);
    fs.chmodSync(path.join(dir, 'acme.first/bin/blazon-acme.first.🔌'), 0o644);
    const ran = script(dir);
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('shipped-lock: acme.first');
    expect(ran.stderr).toContain('not executable');
    expect(fs.existsSync(lock(dir))).toBe(false);
  }, 60_000);

  it('says so in a line, not a stack, when --dir has no folder or names one that is not there', () => {
    for (const args of [['--dir'], ['--dir', path.join(tempDir('blazon-shipped-lock-'), 'nonexistent')]]) {
      const ran = spawnSync(TSX, [SCRIPT, ...args], { encoding: 'utf-8' });
      expect(ran.status).toBe(1);
      expect(ran.stderr.split('\n')[0]).toMatch(/^shipped-lock: --dir /);
      expect(ran.stderr).not.toContain(' at ');
    }
  }, 60_000);
});

describe('--check', () => {
  it('passes when the lock is what the folders make, and fails when one byte of a plugin changed', () => {
    const dir = pluginsDir(['acme.first']);
    script(dir);
    expect(script(dir, '--check').status).toBe(0);
    fs.appendFileSync(path.join(dir, 'acme.first/bin/blazon-acme.first.🔌'), '#');
    const changed = script(dir, '--check');
    expect(changed.status).toBe(1);
    expect(changed.stdout + changed.stderr).toMatch(/acme\.first.*changed/);
  }, 60_000);

  it('fails for a plugin added or removed, and for a missing lock', () => {
    const dir = pluginsDir(['acme.first']);
    expect(script(dir, '--check').status).toBe(1);
    script(dir);
    fs.cpSync(path.join(dir, 'acme.first'), path.join(dir, 'acme.second'), { recursive: true });
    fs.renameSync(path.join(dir, 'acme.second/bin/blazon-acme.first.🔌'), path.join(dir, 'acme.second/bin/blazon-acme.second.🔌'));
    const added = script(dir, '--check');
    expect(added.status).toBe(1);
    expect(added.stdout + added.stderr).toMatch(/acme\.second.*not in the lock/);
    script(dir);
    fs.rmSync(path.join(dir, 'acme.first'), { recursive: true });
    const removed = script(dir, '--check');
    expect(removed.status).toBe(1);
    expect(removed.stdout + removed.stderr).toMatch(/acme\.first.*no folder/);
  }, 60_000);
});

describe("blazon's own package", () => {
  it('has the lock its plugins folder makes, built by `npm run build:plugins`', () => {
    const run = script(path.join(ROOT_DIR, 'plugins'), '--check');
    expect(run.status, run.stdout + run.stderr).toBe(0);
  }, 60_000);

  it('is packed with plugins/shipped.lock and every plugin file', () => {
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT_DIR, encoding: 'utf-8' })) as { files: { path: string }[] }[];
    const packed = pack!.files.map((file) => file.path);
    expect(packed).toContain('plugins/shipped.lock');
    const files = (fs.readdirSync(path.join(ROOT_DIR, 'plugins'), { recursive: true, withFileTypes: true }) as fs.Dirent[]).filter((item) => item.isFile());
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) expect(packed).toContain(path.relative(ROOT_DIR, path.join(file.parentPath, file.name)));
  }, 60_000);

  it('builds the programs and then the lock before every pack and every build, so a package carries programs and a lock that agree', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')).scripts;
    expect(scripts['shipped-lock']).toMatch(/shipped-lock\.mjs/);
    expect(scripts['build:plugins']).toMatch(/build-plugins\.mjs.*&&.*shipped-lock\.mjs/);
    expect(scripts.prepack).toMatch(/build:plugins/);
    expect(scripts.build).toMatch(/build:plugins/);
  });

  it('does not commit the programs or the lock: .gitignore lists them, since the build writes them (the hook tests a snapshot with no .git, so the file is read)', () => {
    const lines = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8').split('\n');
    expect(lines).toContain('plugins/shipped.lock');
    expect(lines).toContain('plugins/*/bin/*.🔌');
  });
});
