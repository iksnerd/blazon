import { describe, it, expect, afterEach } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { decodeManifest, ManifestError, profileTimeoutCap } from '../../../src/plugins/wire/manifest.js';
import { BLAZON_CORE_PROFILE, BLAZON_PROFILE } from '../../../src/plugins/wire/profile.js';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { BRAND, answer, cleanup, install, script, type Installed } from '../support/fixtures.js';
import { SPEC } from '../support/spec.js';
import { tempDir } from '../../support/project';

// Blazon's profile is a document (RFC 0005 section 2), and a document that is not tested drifts (section 5):
// each field is shown to be what the host does, and the document is vetted against the schema of a profile
// and its stricter CUE check. The host's runtime is built from the document, and each test below is shown to fail
// when the behaviour changes and the document does not.

afterEach(cleanup);
const DOC = BLAZON_PROFILE;
const make = (installed: Installed) => new PluginRun(installed.config, installed.cwd);
const roleDoc = (name: string) => DOC.roles.find((role) => role.name === name)!;

describe('the document, against the profile schema', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SPEC, 'schemas/draft/host-profile.schema.json'), 'utf-8'));

  it('is valid under the draft schema for a host profile', () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
    expect(validate(JSON.parse(JSON.stringify(DOC))), JSON.stringify(validate.errors)).toBe(true);
  });

  it('is valid under the stricter CUE check, with the version it was written for', () => {
    const cue = spawnSync('cue', ['version'], { encoding: 'utf-8' });
    const have = /cue version v?([\d.]+)/.exec(cue.stdout ?? '')?.[1];
    if (have !== '0.17.1') {
      // A missing or different cue is a skipped check, said out loud: the JSON Schema check above always runs, and this is a
      // second opinion. A machine that installs cue 0.17.1 (CI, say) sets BLAZON_REQUIRE_CUE=1, and then a missing cue fails.
      if (process.env.BLAZON_REQUIRE_CUE) throw new Error(`cue 0.17.1 is pinned for this check; found ${have ?? 'none'}`);
      console.warn(`profile.test: skipped the CUE check: cue 0.17.1 is pinned, found ${have ?? 'none'}`);
      return;
    }
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(DOC));
    const vet = spawnSync('cue', ['vet', '-c', '-d', '#Profile', path.join(SPEC, 'experiments/cue-host-profile/profile.cue'), path.join(dir, 'profile.json')], { encoding: 'utf-8' });
    expect(vet.status, vet.stdout + vet.stderr).toBe(0);
  });

  it('holds no secret and no path of the operator, even when a secret is set in the environment', () => {
    process.env.BLAZON_SECRET_PROFILE_TEST = 'a-secret-value-123';
    try {
      expect(JSON.stringify(DOC)).not.toContain('a-secret-value-123');
    } finally {
      delete process.env.BLAZON_SECRET_PROFILE_TEST;
    }
    expect(JSON.stringify(DOC)).not.toMatch(/\/Users\/|\/home\/|\/tmp\//);
  });
});

describe('roles', () => {
  it('a role in the document is one a manifest may name, and a role that is not in it is refused', () => {
    for (const role of DOC.roles) expect(() => decodeManifest(JSON.stringify({ v: 2, roles: [role.name] }), BLAZON_CORE_PROFILE)).not.toThrow();
    expect(() => decodeManifest('{"v":2,"roles":["frobnicate"]}', BLAZON_CORE_PROFILE)).toThrow(ManifestError);
  });
});

describe('exit_codes', () => {
  for (const role of DOC.roles) {
    it.each([0, 1, 2, 3])(`the ${role.name} role: exit %i is an answer only if the document defines it`, async (code) => {
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: [role.name] }, `exit ${code}`) } });
      const found = await (role.name === 'check' ? make(installed).check(BRAND) : make(installed).build(BRAND, '/site'));
      const broke = found.some((f) => f.message.includes(`exited with ${code}`));
      expect(broke).toBe(!(String(code) in role.exit_codes));
    });
  }
});

describe('stdout_limit_bytes', () => {
  for (const role of DOC.roles) {
    const limit = (roleDoc(role.name) as { stdout_limit_bytes?: number }).stdout_limit_bytes ?? 65536;
    const json = role.name === 'check' ? '{"findings":[]}' : '{}';
    const padded = (extra: number) => `printf '%s' '${json}'\nhead -c ${limit - json.length + extra} /dev/zero | tr '\\0' ' '`;
    const run = (installed: Installed) => (role.name === 'check' ? make(installed).check(BRAND) : make(installed).build(BRAND, '/site'));

    it(`the ${role.name} role may print exactly ${limit} bytes and no more`, async () => {
      expect(await run(install({ 'acme.a': { script: script({ v: 2, roles: [role.name] }, padded(0)) } }))).toEqual([]);
      const over = await run(install({ 'acme.a': { script: script({ v: 2, roles: [role.name] }, padded(1)) } }));
      expect(over).toHaveLength(1);
      expect(over[0]!.message).toContain(`output over the limit of ${limit} bytes`);
    });
  }
});

describe('breaker', () => {
  for (const role of DOC.roles) {
    it(`the ${role.name} role is ${(role as { breaker?: boolean }).breaker ? '' : 'not '}behind the breaker, as the document says`, async () => {
      const installed = install({ 'acme.a': { script: script({ v: 2, roles: [role.name] }, 'exit 3') } });
      const run = make(installed);
      let last = '';
      for (let i = 0; i < 4; i++) last = (await (role.name === 'check' ? run.check(BRAND) : run.build(BRAND, '/site')))[0]!.message;
      expect(last.includes('stopped for the rest of this run')).toBe((role as { breaker?: boolean }).breaker === true);
    });
  }
});

describe('secret_env_prefixes', () => {
  it.each(DOC.secret_env_prefixes)('a variable that starts %s is labelled secret with no help from the operator, and one that does not is not', async (prefix) => {
    const labelled = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: [`${prefix}TOKEN`] }, answer([])) } });
    expect((await make(labelled).check(BRAND))[0]!.message).toContain(`takes ${prefix}TOKEN, which is labelled secret`);
    const plain = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['NOT_A_SECRET_TOKEN'] }, answer([])) } });
    expect(await make(plain).check(BRAND)).toEqual([]);
  });
});

describe('secret_fields', () => {
  it('has none in the document, so a manifest that lists one is refused', async () => {
    expect((DOC as { secret_fields?: string[] }).secret_fields ?? []).toEqual([]);
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], secret_fields: ['/auth/token'] }, answer([])) } });
    const found = await make(installed).check(BRAND);
    expect(found[0]!.message).toContain('secret_fields lists "/auth/token"');
  });
});

describe('request_cap_bytes', () => {
  it('a request of exactly the cap is sent, and one byte more is not', async () => {
    const cap = DOC.request_cap_bytes;
    const base = JSON.stringify({ v: 1, type: 'check', options: { pad: '' }, brand: BRAND }).length;
    const run = (extra: number) => make(install({ 'acme.a': { script: script({ v: 2, roles: ['check'] }, answer([])), options: { pad: 'x'.repeat(cap - base + extra) } } })).check(BRAND);
    expect(await run(0)).toEqual([]);
    const over = await run(1);
    expect(over[0]!.message).toContain(`over the cap of ${cap}`);
  });
});

describe('timeout_cap_ms', () => {
  it('is in no role of the document, so the core\'s cap of 60 seconds holds for both', () => {
    for (const role of DOC.roles) expect(role).not.toHaveProperty('timeout_cap_ms');
    expect(profileTimeoutCap(BLAZON_CORE_PROFILE, DOC.roles.map((role) => role.name))).toBe(60);
  });
});

describe('host, adopts and check_command', () => {
  it('names the program prefix the manifest flag uses, and adopts nothing yet', () => {
    expect(DOC.host).toBe('blazon');
    expect(DOC.adopts).toEqual([]);
    expect(DOC.check_command).toBe('blazon plugin check');
  });
});
