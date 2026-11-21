import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// scripts/linux-check.sh runs a few tests in a Linux container before a release tag is pushed. Docker is stubbed here: a `docker` on PATH
// that records its arguments, so the test proves the refusal and the container command line without starting a container.

const SCRIPT = path.join(REPO, 'scripts/linux-check.sh');

/** A folder holding a `docker` stub. `info` exits with `infoStatus`; `run` appends one argument per line to `calls` and exits with `runStatus`. */
function stub(infoStatus: number, runStatus = 0): { bin: string; calls: string } {
  const bin = tempDir('blazon-linux-stub-');
  const calls = path.join(bin, 'calls');
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/sh
case "$1" in
  info) exit ${infoStatus} ;;
  run) shift; for a in "$@"; do printf '%s\\n' "$a" >> '${calls}'; done; exit ${runStatus} ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return { bin, calls };
}

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

  it('runs node:24 with the two flags, the given test files, and removes its export folder', () => {
    const { bin, calls } = stub(0);
    const result = run(bin, ['test/a.test.ts', 'test/b.test.ts']);
    expect(result.status).toBe(0);
    const args = fs.readFileSync(calls, 'utf-8').trim().split('\n');
    expect(args).toContain('--cpus=0.4');
    expect(args).toContain('NODE_OPTIONS=--dns-result-order=ipv4first');
    expect(args).toContain('node:24');
    expect(args.slice(-2)).toEqual(['test/a.test.ts', 'test/b.test.ts']);
    const mount = args.find((a) => a.endsWith(':/src:ro'));
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
    const args = fs.readFileSync(calls, 'utf-8').trim().split('\n');
    expect(args.slice(-2)).toEqual(['test/build/dev-plugin.test.ts', 'test/hooks/test-lock.test.ts']);
    expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^linux-check: FAIL/);
  }, 60_000);
});
