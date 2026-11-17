import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from '../support/project';
import { missingFiles, missingListed, requiredFiles } from '../../scripts/check-pack.mjs';

// scripts/check-pack.mjs is what stops a tarball without dist/ from being released: a stale `npm pack` once shipped a package that
// lacked dist/ui/assets/geist-OFL.txt. The release job runs it on the tarball; here it runs on small trees.

const SCRIPT = path.join(ROOT_DIR, 'scripts/check-pack.mjs');

/** A package folder with one plugin, holding the files `present` names (relative paths) and nothing else. */
function pkg(present: (name: string) => string[], listed: string[] = ['dist', 'bin', 'plugins', 'template', 'THIRD-PARTY-NOTICES.md']): string {
  const dir = tempDir('blazon-check-pack-');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', files: listed }));
  fs.mkdirSync(path.join(dir, 'plugins/acme.one'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins/acme.one/README.md'), '# one\n');
  for (const file of present('acme.one')) {
    if (file === 'package.json') continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), 'x');
  }
  return dir;
}

const check = (dir: string) => spawnSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf-8' });

describe('which files the package must hold', () => {
  it('names the viewer, the license, the starter, the lock and one program per plugin', () => {
    const required = requiredFiles(['acme.one', 'acme.two']);
    for (const file of ['dist/index.js', 'dist/ui/assets/geist-OFL.txt', 'template/blazon.json', 'plugins/shipped.lock', 'plugins/acme.two/bin/blazon-acme.two.🔌']) {
      expect(required).toContain(file);
    }
  });

  it('lists only what is absent', () => {
    expect(missingFiles(requiredFiles(['a.b']), ['a.b'])).toEqual([]);
    expect(missingFiles(['package.json'], ['a.b'])).toContain('dist/index.js');
  });
});

describe('checking a tree', () => {
  it('fails, naming each file, for a tree with no dist/', () => {
    const dir = pkg((name) => requiredFiles([name]).filter((file) => !file.startsWith('dist/')));
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dist/index.js');
    expect(result.stderr).toContain('dist/ui/assets/geist-OFL.txt');
    expect(result.stderr).not.toContain('plugins/shipped.lock');
  });

  it('fails for a plugin whose program is not built', () => {
    const dir = pkg(() => requiredFiles([]));
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('plugins/acme.one/bin/blazon-acme.one.🔌');
  });

  it('passes for a tree that holds everything', () => {
    const dir = pkg((name) => requiredFiles([name]));
    const result = check(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('check-pack: ok');
  });

  it('fails for a tarball that lacks dist/, and passes for one that has it', () => {
    const tarOf = (present: (name: string) => string[]) => {
      const dir = pkg(present);
      const out = tempDir('blazon-check-pack-tgz-');
      fs.renameSync(dir, path.join(out, 'package'));
      const tarball = path.join(out, 'x.tgz');
      const packed = spawnSync('tar', ['-czf', tarball, '-C', out, 'package'], { encoding: 'utf-8' });
      expect(packed.status, packed.stderr).toBe(0);
      return { tarball, dir: path.join(out, 'package') };
    };
    const run = (t: { tarball: string; dir: string }) => spawnSync(process.execPath, [SCRIPT, '--dir', t.dir, '--tarball', t.tarball], { encoding: 'utf-8' });
    const without = run(tarOf((name) => requiredFiles([name]).filter((file) => !file.startsWith('dist/'))));
    expect(without.status).toBe(1);
    expect(without.stderr).toContain('dist/index.js');
    const full = run(tarOf((name) => requiredFiles([name])));
    expect(full.status, full.stderr).toBe(0);
  });
});

describe('a path the manifest lists and the package does not hold', () => {
  it('is named by missingListed, and a folder counts when anything is packed under it', () => {
    expect(missingListed(['dist', 'mcp', './bin/', 'NOTICE.md'], ['package.json', 'dist/index.js', 'bin/blazon.js'])).toEqual(['mcp', 'NOTICE.md']);
  });

  it('fails the check of a tree whose `files` lists mcp and ships no mcp/', () => {
    const dir = pkg((name) => requiredFiles(name === undefined ? [] : [name]), ['dist', 'bin', 'plugins', 'template', 'THIRD-PARTY-NOTICES.md', 'mcp']);
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('names 1 path');
    expect(result.stderr).toContain('mcp');
  });
});
