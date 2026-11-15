import { describe, it, expect } from 'vitest';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { BLAZON_PROFILE } from '../../../src/plugins/wire/profile.js';
import { caseFiles, loadCase, materialize, ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// `blazon plugin check <program>` is the host's check command (RFC 0005 section 9) and `blazon plugin pin
// <path>` prints the digest of a file or a tree (section 3.4). Both are run as the real command.

// NO_COLOR wins over FORCE_COLOR in picocolors, and CI sets FORCE_COLOR: without it the output carries ANSI codes the assertions do not expect.
const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd: ROOT_DIR, env: { ...process.env, NO_COLOR: '1' } });

function program(script: string): string {
  const file = path.join(tempDir(), 'blazon-acme.conforming');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return file;
}

const CONFORMING = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":["check","build"]}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *1[,}]'; then
  echo '{"findings":[]}'
  exit 0
fi
echo 'unsupported record version'; exit 2
`;

describe('blazon plugin check --json', () => {
  it('prints the host, what it adopts and each case as one document, and exits 0 for a plugin that conforms', () => {
    const result = blazon('plugin', 'check', program(CONFORMING), '--json');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ command: 'plugin check', passed: true, host: 'blazon', adopts: [] });
    expect(out.cases.length).toBeGreaterThan(0);
    expect(out.cases[0]).toEqual({ case: expect.any(Number), name: expect.any(String), role: expect.any(String), status: expect.stringMatching(/^(ok|skip|fail)$/), detail: expect.any(String) });
    expect(out.cases.filter((c: { status: string }) => c.status === 'fail')).toEqual([]);
  }, 60_000);

  it('names the failed case and exits 1', () => {
    const result = blazon('plugin', 'check', program(CONFORMING.replace("*) echo 'the request is not JSON'; exit 2;;", '*) exit 0;;')), '--json');
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.passed).toBe(false);
    expect(out.cases.some((c: { status: string }) => c.status === 'fail')).toBe(true);
  }, 60_000);

  it('runs the cases of each role the manifest declares after the core cases, as cases 6 to 9', () => {
    const out = JSON.parse(blazon('plugin', 'check', program(CONFORMING), '--json').stdout);
    const added = out.cases.filter((c: { case: number }) => c.case >= 6).map((c: { case: number; role: string; status: string }) => `${c.role} ${c.case} ${c.status}`);
    expect(added).toEqual(['check 6 ok', 'check 7 ok', 'check 8 ok', 'build 6 ok', 'build 7 ok', 'build 8 ok', 'build 9 ok']);
  }, 60_000);

  it('reports a build plugin that writes beside out_dir as a warning, and still exits 0', () => {
    const beside = CONFORMING.replace(
      "  echo '{\"findings\":[]}'",
      `  out=$(printf '%s' "$in" | sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p'); [ -n "$out" ] && echo x > "$out.cache"\n  echo '{"findings":[]}'`,
    );
    const json = blazon('plugin', 'check', program(beside), '--json');
    expect(json.status, json.stdout + json.stderr).toBe(0);
    const out = JSON.parse(json.stdout);
    expect(out.passed).toBe(true);
    expect(out.cases.find((c: { case: number }) => c.case === 9)).toMatchObject({ role: 'build', status: 'warn' });
    const text = blazon('plugin', 'check', program(beside));
    expect(text.status).toBe(0);
    expect(text.stdout).toMatch(/warn\s+9\s+build:/);
    expect(text.stdout).toMatch(/Passed, with 1 warning/);
  }, 60_000);

  it('says a missing program as JSON, with the exit status of the text form', () => {
    const text = blazon('plugin', 'check', path.join(tempDir(), 'missing'));
    const result = blazon('plugin', 'check', path.join(tempDir(), 'missing'), '--json');
    expect(result.status).toBe(text.status);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'plugin check', passed: false });
  }, 60_000);

  it('is refused for pin and profile, which print a digest and JSON already', () => {
    const result = blazon('plugin', 'profile', '--json');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--json is for `blazon plugin check`');
  }, 60_000);
});

describe('blazon plugin: a missing or ignored argument', () => {
  it.each([
    [['check', '--json'], 'plugin check'],
    [['pin', '--json'], 'plugin'],
  ])('says %j as JSON on standard output when --json is allowed, with exit 2 and code missing-argument', (args, command) => {
    const result = blazon('plugin', ...args);
    expect(result.status).toBe(2);
    if (command === 'plugin check') expect(JSON.parse(result.stdout)).toMatchObject({ command: 'plugin check', passed: false, error: { code: 'missing-argument' } });
    else expect(result.stderr).toContain('--json is for `blazon plugin check`');
  }, 60_000);

  it.each([['check'], ['pin']])('exits 2 for `plugin %s` with no target, and says the usage on standard error', (action) => {
    const result = blazon('plugin', action);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`usage: blazon plugin ${action}`);
  }, 60_000);

  it.each([
    [['check', '--name', 'x', '--digest', 'y', '--entry', 'z'], '--name'],
    [['check', '--entry', 'z'], '--entry'],
    [['profile', '--digest', 'y'], '--digest'],
  ])('refuses %j: an option of `pin` is not silently ignored', (args, flag) => {
    const result = blazon('plugin', args[0]!, ...(args[0] === 'check' ? [program(CONFORMING)] : []), ...args.slice(1));
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stderr).toContain(`${flag} is for \`blazon plugin pin\``);
  }, 60_000);

  it('refuses a target for profile', () => {
    const result = blazon('plugin', 'profile', 'foo');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('`profile` takes no target');
  }, 60_000);
});

describe('blazon plugin check', () => {
  it('names the host and what it adopts before its first case, and exits 0 for a plugin that conforms', () => {
    const result = blazon('plugin', 'check', program(CONFORMING));
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
    expect(lines[0]).toBe('blazon plugin check: host blazon, adopts: none');
    expect(result.stdout).toContain('the manifest call prints a manifest the host loads');
    expect(result.stdout).toMatch(/Passed/);
  }, 60_000);

  it('exits 1 and names the case that failed, for a plugin that breaks a rule', () => {
    // Accepts a request that is not JSON: case 2.
    const result = blazon('plugin', 'check', program(CONFORMING.replace("*) echo 'the request is not JSON'; exit 2;;", '*) exit 0;;')));
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+2\b/);
    expect(result.stdout).toMatch(/1 case failed|failed/);
  }, 60_000);

  it('exits 1 for a plugin that cannot start, naming the manifest call', () => {
    const result = blazon('plugin', 'check', path.join(tempDir(), 'missing'));
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+1\b/);
  }, 60_000);

  it('exits 2 when it is not given a program', () => {
    const result = blazon('plugin', 'check');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage');
  }, 60_000);
});

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

describe('blazon plugin', () => {
  it.each([[[]], [['frobnicate']], [['frobnicate', 'x']]])('exits 2 and lists the two actions for %j', (args) => {
    const result = blazon('plugin', ...args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('blazon plugin check <program>');
    expect(result.stderr).toContain('blazon plugin pin <path>');
  }, 60_000);
});

describe('blazon plugin pin', () => {
  it('prints the digest the corpus gives for the same tree, and for the same file', () => {
    for (const [file, kind] of [['nested', 'tree'], ['single-exec-file', 'tree'], ['file-pin', 'file']] as const) {
      const found = loadCase(caseFiles('valid', 'tree-digest').find((candidate) => candidate.endsWith(`${file}.json`))!, ['about', 'kind', 'root', 'entries', 'digest', 'refuse']);
      expect(found.kind).toBe(kind);
      const result = blazon('plugin', 'pin', materialize(found, tempDir()));
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(found.digest);
    }
  }, 60_000);

  it('exits 1 and says why for a tree a host must refuse', () => {
    const found = loadCase(caseFiles('invalid', 'tree-digest').find((candidate) => candidate.endsWith('symlink-to-file.json'))!, ['about', 'kind', 'root', 'entries', 'digest', 'refuse']);
    const result = blazon('plugin', 'pin', materialize(found, tempDir()));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refused: symlink');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('exits 2 when it is not given a path', () => {
    const result = blazon('plugin', 'pin');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage');
  }, 60_000);
});

describe("blazon's profile", () => {
  it('is a document with the fields the profile defines: a host, its check command, its roles and their exit codes', () => {
    expect(BLAZON_PROFILE).toMatchObject({ v: 1, host: 'blazon', check_command: 'blazon plugin check' });
    expect(BLAZON_PROFILE.roles.map((role) => role.name)).toEqual(['check', 'build']);
    for (const role of BLAZON_PROFILE.roles) expect(Object.keys(role.exit_codes)).toEqual(['0', '2']);
  });

  it('says exit 1 is not an answer for either role, so a plugin that dies on an uncaught exception is a break', () => {
    for (const role of BLAZON_PROFILE.roles) expect(role.exit_codes).not.toHaveProperty('1');
  });

  it('holds no secret and no path of the operator: it is the same for every install', () => {
    expect(JSON.stringify(BLAZON_PROFILE)).not.toMatch(/\/Users\/|\/home\//);
  });
});
