import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// scripts/linux-check.sh runs a few tests in a Linux container before a release tag is pushed. Docker is stubbed here: a `docker` on PATH
// that records its arguments, so the test proves the refusal and the container command line without starting a container.

const SCRIPT = path.join(REPO, 'scripts/linux-check.sh');

/**
 * A folder holding a `docker` stub. `info` exits with `infoStatus`; `run` appends a line `=run=` and then one argument per line to `calls`, and
 * exits with `runStatus` for the run that starts vitest and with `installStatus` for any other (the install and build run).
 */
function stub(infoStatus: number, runStatus = 0, installStatus = 0): { bin: string; calls: string } {
  const bin = tempDir('blazon-linux-stub-');
  const calls = path.join(bin, 'calls');
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/sh
case "$1" in
  info) exit ${infoStatus} ;;
  run) shift; printf '=run=\\n' >> '${calls}'; for a in "$@"; do printf '%s\\n' "$a" >> '${calls}'; done
    case "$*" in *vitest*) exit ${runStatus} ;; esac; exit ${installStatus} ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return { bin, calls };
}

/** The arguments of each `docker run` the stub saw, in order. */
const runs = (calls: string): string[][] =>
  fs
    .readFileSync(calls, 'utf-8')
    .split('=run=\n')
    .slice(1)
    .map((block) => block.trim().split('\n'));

const run = (bin: string, args: string[] = []) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });

describe('scripts/linux-check.sh', () => {
  it('refuses in one line, and starts nothing, when Docker is not running', () => {
    const { bin, calls } = stub(1);
    const result = run(bin);
    expect(result.status).not.toBe(0);
    const lines = `${result.stdout}${result.stderr}`.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/docker is not running/i);
    expect(fs.existsSync(calls)).toBe(false);
  });

  it('installs and builds at full speed, runs the given test files in node:24 at 0.4 CPUs with ipv4first, and removes its export folder', () => {
    const { bin, calls } = stub(0);
    const result = run(bin, ['test/a.test.ts', 'test/b.test.ts']);
    expect(result.status).toBe(0);
    const [install, tests, ...more] = runs(calls);
    expect(more).toEqual([]);
    // the install and build run: the export, no CPU limit, and no test file
    expect(install).toContain('node:24');
    expect(install).not.toContain('--cpus=0.4');
    expect(install!.join(' ')).toMatch(/npm ci && npm run build/);
    expect(install!.join(' ')).not.toMatch(/vitest/);
    // the test run: starved, on the volume the install filled
    const args = tests!;
    expect(args).toContain('--cpus=0.4');
    expect(args).toContain('NODE_OPTIONS=--dns-result-order=ipv4first');
    expect(args).toContain('node:24');
    expect(args.slice(-2)).toEqual(['test/a.test.ts', 'test/b.test.ts']);
    const volume = install!.find((a) => a.endsWith(':/app'));
    expect(volume).toBeDefined();
    expect(args).toContain(volume);
    const mount = install!.find((a) => a.endsWith(':/src:ro'));
    expect(mount).toBeDefined();
    const exported = mount!.slice(0, -':/src:ro'.length);
    expect(exported.startsWith(process.env.HOME!)).toBe(true);
    expect(fs.existsSync(exported)).toBe(false);
    expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^linux-check: PASS/);
  }, 60_000);

  it('defaults to the dev-plugin and test-lock tests, and says FAIL when the container fails', () => {
    const { bin, calls } = stub(0, 3);
    const result = run(bin);
    expect(result.status).not.toBe(0);
    const args = runs(calls).at(-1)!;
    expect(args.slice(-2)).toEqual(['test/build/dev-plugin.test.ts', 'test/hooks/test-lock.test.ts']);
    expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^linux-check: FAIL/);
  }, 60_000);

  it('says FAIL and starts no test run when the install or the build fails', () => {
    const { bin, calls } = stub(0, 0, 5);
    const result = run(bin);
    expect(result.status).not.toBe(0);
    expect(runs(calls)).toHaveLength(1);
    expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^linux-check: FAIL, exit 5/);
  }, 60_000);
});
