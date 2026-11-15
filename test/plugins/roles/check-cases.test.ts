import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { check, type CheckResult } from '../../../src/plugins/host/check.js';
import { blazonRoleCases } from '../../../src/plugins/roles/check-cases.js';
import { BLAZON_CORE_PROFILE, BLAZON_PROFILE, blazonRequests } from '../../../src/plugins/wire/profile.js';
import { tempDir } from '../../support/project';

// The cases blazon adds to the core ones for its own roles (RFC 0002 section 2): a valid request of each role the manifest
// declares, answered with an exit code the role defines, within the role's stdout limit and in the role's shape, and for
// build, nothing written beside out_dir. Each stub breaks one rule, so exactly one case fails (or warns).

function program(roles: string[], valid: string): string {
  const file = path.join(tempDir(), 'blazon-acme.stub');
  fs.writeFileSync(
    file,
    `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":${JSON.stringify(roles)}}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *1[,}]'; then
  out=$(printf '%s' "$in" | sed -n 's/.*"out_dir":"\\([^"]*\\)".*/\\1/p')
${valid}
fi
echo 'unsupported record version'; exit 2
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}

const run = (file: string) => check({ host: 'blazon', profile: BLAZON_CORE_PROFILE, program: file, requests: blazonRequests(), roleCases: blazonRoleCases(file) });
const failed = (results: CheckResult[]) => results.filter((r) => !r.passed && !r.skipped).map((r) => `${r.role} ${r.case}`);
const warned = (results: CheckResult[]) => results.filter((r) => r.warning).map((r) => `${r.role} ${r.case}`);
const found = (results: CheckResult[], role: string, n: number) => results.find((r) => r.role === role && r.case === n)!;

const EMPTY = `  echo '{"findings":[]}'; exit 0`;
const over = (bytes: number) => `  printf '{"findings":[],"pad":"'; head -c ${bytes} /dev/zero | tr '\\0' a; echo '"}'; exit 0`;

describe('blazon plugin check, the cases of the roles', () => {
  it('passes every case for a plugin that answers both roles, and numbers them after the core cases', async () => {
    const results = await run(program(['check', 'build'], EMPTY));
    expect(failed(results), JSON.stringify(results)).toEqual([]);
    expect(warned(results)).toEqual([]);
    expect(results.map((r) => `${r.role} ${r.case}`).slice(-7)).toEqual(['check 6', 'check 7', 'check 8', 'build 6', 'build 7', 'build 8', 'build 9']);
  });

  it('runs only the cases of the roles the manifest declares: no build case for a check plugin', async () => {
    const results = await run(program(['check'], EMPTY));
    expect(failed(results), JSON.stringify(results)).toEqual([]);
    expect(results.filter((r) => r.case >= 6).map((r) => `${r.role} ${r.case}`)).toEqual(['check 6', 'check 7', 'check 8']);
  });

  it('names the exit codes the profile defines in case 6', async () => {
    const results = await run(program(['build'], EMPTY));
    const codes = Object.keys(BLAZON_PROFILE.roles.find((r) => r.name === 'build')!.exit_codes).join(' or ');
    expect(found(results, 'build', 6).name).toContain(`exit ${codes}`);
  });

  it('fails case 6 for a valid request answered with exit 1, and says blazon treats it as a break', async () => {
    const results = await run(program(['check', 'build'], '  exit 1'));
    expect(failed(results)).toEqual(['check 6', 'build 6']);
    expect(found(results, 'check', 6).detail).toMatch(/exit 1 is a break in blazon/);
  });

  it("fails case 7 for an answer over the check role's raised limit, and passes it just under", async () => {
    const limit = BLAZON_PROFILE.roles.find((r) => r.name === 'check')!.stdout_limit_bytes!;
    const results = await run(program(['check'], over(limit)));
    expect(failed(results)).toEqual(['check 7']);
    expect(found(results, 'check', 7).detail).toContain(String(limit));
    expect(failed(await run(program(['check'], over(limit - 100))))).toEqual([]);
  });

  it("fails case 7 for a build answer over the core's 64 KB, the role raising no limit", async () => {
    const results = await run(program(['build'], over(65536)));
    expect(failed(results)).toEqual(['build 7']);
    expect(found(results, 'build', 7).detail).toContain('65536');
  });

  it.each([
    ['findings that are not a list', `  echo '{"findings":"none"}'; exit 0`, "findings must be a list"],
    ['a finding whose code is not the plugin\'s', `  echo '{"findings":[{"code":"other/x","severity":"error","path":"p","message":"m"}]}'; exit 0`, 'code must start with "acme.stub/"'],
    ['an answer that is not JSON', `  echo 'done'; exit 0`, 'not JSON'],
  ])('fails case 8 for %s, with the reason blazon gives', async (_name, valid, reason) => {
    const results = await run(program(['check'], valid));
    expect(failed(results)).toEqual(['check 8']);
    expect(found(results, 'check', 8).detail).toContain(reason);
  });

  it('skips case 8 when the plugin cannot answer (exit 2), which is an answer', async () => {
    const results = await run(program(['check', 'build'], `  echo 'no site to read'; exit 2`));
    expect(failed(results)).toEqual([]);
    expect(found(results, 'build', 8)).toMatchObject({ skipped: true });
  });

  it('warns on case 9, and does not fail, for a build plugin that writes beside out_dir', async () => {
    const results = await run(program(['build'], `  mkdir -p "$out.cache" && echo x > "$out.cache/state"; echo '{"findings":[]}'; exit 0`));
    expect(failed(results), JSON.stringify(results)).toEqual([]);
    expect(warned(results)).toEqual(['build 9']);
    const nine = found(results, 'build', 9);
    expect(nine).toMatchObject({ passed: true, warning: true });
    expect(nine.detail).toContain('acme.stub.cache/state');
    expect(nine.detail).toContain('docs/manual/12-plugins.md');
  });

  it('passes case 9 for a build plugin that writes only into out_dir', async () => {
    const results = await run(program(['build'], `  echo x > "$out/file"; echo '{"findings":[]}'; exit 0`));
    expect(found(results, 'build', 9)).toMatchObject({ passed: true });
    expect(warned(results)).toEqual([]);
  });
});
