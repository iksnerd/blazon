import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../../support/project';
import { blazon, program, CONFORMING } from '../../support/plugin-cli';

// `blazon plugin check <program>` is the host's check command (RFC 0005 section 9) and `blazon plugin pin <path>` prints the digest of a
// file or a tree (section 3.4), run as the real command. This file: the layout of a shipped plugin and the --core flag. The rest is in cli-*.test.ts.

describe('blazon plugin check, the layout of a shipped plugin (RFC 0005 section 3.6)', () => {
  // A copy of the conforming script at <folder>/bin/<file>, the folder named as the plugin.
  function shipped(file: string, folder = 'acme.conforming'): string {
    const bin = path.join(tempDir(), folder, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const target = path.join(bin, file);
    fs.writeFileSync(target, CONFORMING);
    fs.chmodSync(target, 0o755);
    return target;
  }

  it('passes a program named blazon-<folder>.🔌', () => {
    const result = blazon('plugin', 'check', shipped('blazon-acme.conforming.🔌'));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain('layout');
  }, 60_000);

  it.each([
    ['.js', 'blazon-acme.conforming.js'],
    ['no extension', 'blazon-acme.conforming'],
    ['.🔌.bak', 'blazon-acme.conforming.🔌.bak'],
    ['another name', 'blazon-acme.other.🔌'],
  ])('exits 1 for a program with %s, and says what the file name should be', (_, file) => {
    const result = blazon('plugin', 'check', shipped(file));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`FAIL  layout: the program of the plugin acme.conforming is in acme.conforming/bin, so its file name should be blazon-acme.conforming.🔌, not ${file}`);
    expect(result.stdout).toContain('Failed: the file name does not follow the layout of a shipped plugin');
    expect(result.stdout).not.toMatch(/FAIL\s+\d/);
  }, 60_000);

  it('reports it in --json too', () => {
    const out = JSON.parse(blazon('plugin', 'check', shipped('blazon-acme.conforming.js'), '--json').stdout);
    expect(out.passed).toBe(false);
    expect(out.layout).toContain('should be blazon-acme.conforming.🔌');
  }, 60_000);

  it('stays silent for a program outside the layout', () => {
    const result = blazon('plugin', 'check', program(CONFORMING));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain('layout');
  }, 60_000);
});

describe('blazon plugin check --core', () => {
  // A plugin whose findings carry a code outside its own prefix: case 8 of blazon's role cases fails, the core cases pass.
  const WRONG_PREFIX = CONFORMING.replace(
    "  echo '{\"findings\":[]}'",
    `  echo '{"findings":[{"code":"other/thing","severity":"error","path":"a","message":"m"}]}'`,
  );
  const shipped = (file: string): string => {
    const bin = path.join(tempDir(), 'acme.conforming', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const target = path.join(bin, file);
    fs.writeFileSync(target, CONFORMING);
    fs.chmodSync(target, 0o755);
    return target;
  };

  it('passes a plugin whose codes break the prefix rule, which fails without it', () => {
    const without = blazon('plugin', 'check', program(WRONG_PREFIX));
    expect(without.status).toBe(1);
    expect(without.stdout).toMatch(/FAIL\s+8\b/);
    const core = blazon('plugin', 'check', program(WRONG_PREFIX), '--core');
    expect(core.status, core.stdout + core.stderr).toBe(0);
    expect(core.stdout).not.toMatch(/\s[6-9]\s/);
  }, 60_000);

  it('passes a misnamed shipped layout, which fails without it', () => {
    const file = shipped('blazon-acme.conforming.js');
    expect(blazon('plugin', 'check', file).status).toBe(1);
    const core = blazon('plugin', 'check', file, '--core');
    expect(core.status, core.stdout + core.stderr).toBe(0);
    expect(core.stdout).not.toContain('layout:');
  }, 60_000);

  it('says in the text output that only the core cases ran, after the host line', () => {
    const lines = blazon('plugin', 'check', program(CONFORMING), '--core').stdout.split('\n').filter((line) => line.trim() !== '');
    expect(lines[0]).toBe('blazon plugin check: host blazon, adopts: none');
    expect(lines[1]).toBe('core cases only (1 to 5): no role cases, no layout line');
  }, 60_000);

  it('prints core: true with cases 1 to 5 and no layout key in --json', () => {
    const out = JSON.parse(blazon('plugin', 'check', shipped('blazon-acme.conforming.js'), '--core', '--json').stdout);
    expect(out).toMatchObject({ command: 'plugin check', passed: true, core: true });
    expect(Object.keys(out)).toEqual(['command', 'passed', 'host', 'adopts', 'core', 'cases']);
    expect(Math.max(...out.cases.map((c: { case: number }) => c.case))).toBeLessThanOrEqual(5);
    expect(out).not.toHaveProperty('layout');
  }, 60_000);

  it('leaves --json without the flag as it was', () => {
    expect(JSON.parse(blazon('plugin', 'check', program(CONFORMING), '--json').stdout)).not.toHaveProperty('core');
  }, 60_000);

  it('still exits 1 for a plugin that fails a core case', () => {
    const result = blazon('plugin', 'check', program(CONFORMING.replace("*) echo 'the request is not JSON'; exit 2;;", '*) exit 0;;')), '--core');
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+2\b/);
  }, 60_000);

  it('exits 2 without a program, and is refused for pin and profile', () => {
    expect(blazon('plugin', 'check', '--core').status).toBe(2);
    const result = blazon('plugin', 'profile', '--core');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--core is for `blazon plugin check`');
  }, 60_000);
});
