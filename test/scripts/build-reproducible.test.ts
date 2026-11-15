import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';

// The shipped lock is only worth shipping if the same sources give the same bytes on any machine. This builds the plugins a second time
// from a copy of the sources at another path under the home folder and compares every program and the lock with the ones the suite
// built in the checkout. A path, a date or a hash of either that got into a bundle makes them differ, and the search for the two paths
// and the home folder names it. The checkout's own build is made by test/support/global-setup.ts.

const TSX = path.join(ROOT_DIR, 'node_modules/.bin/tsx');
const copy = fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()), '.blazon-repro-'));

afterAll(() => fs.rmSync(copy, { recursive: true, force: true }));

/** Every file under a folder, relative to it, skipping the compiled `bin` folders and the lock, which the second build makes itself. */
function sources(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((item) => {
    const next = path.join(rel, item.name);
    if (item.isDirectory()) return item.name === 'bin' && rel !== '' ? [] : sources(dir, next);
    return item.name === 'shipped.lock' ? [] : [next];
  });
}

describe('building the shipped plugins twice', () => {
  it('gives the same programs and lock from a copy at another path', () => {
    for (const file of [...sources(ROOT_DIR, 'src'), ...sources(ROOT_DIR, 'scripts'), ...sources(ROOT_DIR, 'plugins'), 'package.json', 'tsconfig.json']) {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT_DIR, file), path.join(copy, file));
    }
    fs.symlinkSync(path.join(ROOT_DIR, 'node_modules'), path.join(copy, 'node_modules'));
    for (const script of ['build-plugins.mjs', 'shipped-lock.mjs']) {
      const run = spawnSync(TSX, [path.join('scripts', script)], { cwd: copy, encoding: 'utf-8' });
      expect(run.status, run.stderr).toBe(0);
    }
    const programs = fs
      .readdirSync(path.join(ROOT_DIR, 'plugins'), { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => path.join('plugins', item.name, 'bin', `blazon-${item.name}.🔌`));
    expect(programs.length).toBeGreaterThan(0);
    for (const file of [...programs, 'plugins/shipped.lock']) {
      const here = fs.readFileSync(path.join(ROOT_DIR, file));
      expect(fs.readFileSync(path.join(copy, file)).equals(here), `${file} differs between two paths`).toBe(true);
      const text = here.toString('utf-8');
      for (const leak of [ROOT_DIR, copy, fs.realpathSync(os.homedir())]) expect(text.includes(leak), `${file} holds ${leak}`).toBe(false);
    }
  }, 120_000);
});
