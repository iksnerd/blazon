import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';

// scripts/build-plugins.mjs is all or nothing: when a plugin fails to build, every failure is reported and the programs and the lock
// that were there before are left as they were. This runs it in a copy of the sources, with the first and the last plugin broken.

const TSX = path.join(ROOT_DIR, 'node_modules/.bin/tsx');
const copy = fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()), '.blazon-build-failure-'));

afterAll(() => fs.rmSync(copy, { recursive: true, force: true }));

function files(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((item) => {
    const next = path.join(rel, item.name);
    if (item.isDirectory()) return item.name === 'bin' ? [] : files(dir, next);
    return item.name === 'shipped.lock' ? [] : [next];
  });
}

describe('a failed build of the shipped plugins', () => {
  it('reports every failing plugin and leaves the previous programs and lock untouched', () => {
    for (const file of [...files(ROOT_DIR, 'src'), ...files(ROOT_DIR, 'scripts'), ...files(ROOT_DIR, 'plugins'), 'package.json', 'tsconfig.json']) {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT_DIR, file), path.join(copy, file));
    }
    fs.symlinkSync(path.join(ROOT_DIR, 'node_modules'), path.join(copy, 'node_modules'));
    const names = fs
      .readdirSync(path.join(copy, 'plugins'), { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    expect(names.length).toBeGreaterThan(2);
    const programs = names.map((name) => path.join(copy, 'plugins', name, 'bin', `blazon-${name}.🔌`));
    for (const program of programs) {
      fs.mkdirSync(path.dirname(program), { recursive: true });
      fs.writeFileSync(program, 'previous\n', { mode: 0o755 });
    }
    fs.writeFileSync(path.join(copy, 'plugins/shipped.lock'), 'previous lock\n');
    const broken = [names[0]!, names[names.length - 1]!];
    for (const name of broken) fs.writeFileSync(path.join(copy, 'src/shipped', name.replace(/^blazon\./, ''), 'main.ts'), 'export const = ;\n');

    const run = spawnSync(TSX, [path.join('scripts', 'build-plugins.mjs')], { cwd: copy, encoding: 'utf-8' });
    expect(run.status).toBe(1);
    for (const name of broken) expect(run.stderr).toContain(`build-plugins: ${name}:`);
    expect(run.stderr).toContain(`${broken.length} of ${names.length} plugins failed`);
    for (const program of programs) expect(fs.readFileSync(program, 'utf-8'), program).toBe('previous\n');
    expect(fs.readFileSync(path.join(copy, 'plugins/shipped.lock'), 'utf-8')).toBe('previous lock\n');
    expect(fs.readdirSync(path.join(copy, 'dist')).filter((item) => item.startsWith('.plugins-staging-'))).toEqual([]);
    for (const name of names) expect(fs.readdirSync(path.join(copy, 'plugins', name, 'bin'))).toEqual([`blazon-${name}.🔌`]);
  }, 120_000);
});
