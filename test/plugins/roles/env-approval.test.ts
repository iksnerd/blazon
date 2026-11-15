import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { check } from '../../../src/plugins/host/check.js';
import { BLAZON_CORE_PROFILE, blazonRequests } from '../../../src/plugins/wire/profile.js';
import { BRAND, answer, cleanup, dirs, install, script } from '../support/fixtures.js';
import { tempDir } from '../../support/project';

// A plugin starts with an empty environment and is given a variable only when its manifest lists the name and the project's config
// approves it (RFC 0002 section 2, Environment). A refusal names the variable and the config key.

afterEach(cleanup);

const HOST = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/home/someone', TMPDIR: '/tmp', ACME_FONT_DIR: '/fonts', BLAZON_SECRET_ACME_TOKEN: 'sk_live_abc', UNLISTED: 'no' };

/** A check plugin that lists `env` and reports which of the host's variables it was given. */
const reporting = (env: string[], marker: string) =>
  script({ v: 2, roles: ['check'], env }, `touch ${marker}\nn=$(env | grep -E '^(HOME|TMPDIR|ACME_FONT_DIR|UNLISTED|BLAZON_SECRET_ACME_TOKEN)=' | sort | cut -d= -f1 | tr '\\n' ',')\nprintf '{"findings":[{"code":"acme.a/env","severity":"info","path":"p","message":"seen:%s"}]}' "$n"`);

const run = (installed: ReturnType<typeof install>) => new PluginRun(installed.config, installed.cwd, { env: HOST }).check(BRAND);
const marker = () => {
  const file = path.join(os.tmpdir(), `blazon-env-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  dirs.push(file);
  return file;
};

describe('the environment of a plugin', () => {
  it('is empty but for what the manifest lists and the config approves: HOME and the others are not the host\'s to give', async () => {
    const ran = marker();
    const installed = install({ 'acme.a': { script: reporting(['ACME_FONT_DIR', 'HOME'], ran), approve: ['ACME_FONT_DIR', 'HOME', 'UNLISTED'] } });
    const [found] = await run(installed);
    // UNLISTED is approved and not listed, TMPDIR is neither: both stay out
    expect(found!.message).toBe('seen:ACME_FONT_DIR,HOME,');
  });

  it('refuses a listed variable that is set and not approved, names the variable and the config key, and does not start the plugin', async () => {
    const ran = marker();
    const installed = install({ 'acme.a': { script: reporting(['ACME_FONT_DIR', 'HOME'], ran), approve: ['HOME'] } });
    const found = await run(installed);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'plugin-failed', path: 'acme.a' });
    expect(found[0]!.message).toContain('its manifest lists ACME_FONT_DIR, which is set here and not approved, so it is not started');
    expect(found[0]!.fix).toBe('Add "ACME_FONT_DIR" to plugins[0].env in the config, or unset it.');
    expect(fs.existsSync(ran)).toBe(false);
  });

  it('names every unapproved variable, and the key of the entry that lists the plugin', async () => {
    const installed = install({ 'acme.b': { script: script({ v: 2, roles: ['check'] }, answer([])), approve: [] }, 'acme.a': { script: reporting(['ACME_FONT_DIR', 'HOME'], marker()), approve: [] } });
    const found = await run(installed);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('lists ACME_FONT_DIR, HOME, which are set here and not approved');
    expect(found[0]!.fix).toContain('plugins[1].env');
  });

  it('holds a secret to the same rule: BLAZON_SECRET_ names need an approval too, and the refusal does not print the value', async () => {
    const ran = marker();
    const installed = install({ 'acme.a': { script: script({ v: 2, roles: ['check'], env: ['BLAZON_SECRET_ACME_TOKEN'], secret_env: ['BLAZON_SECRET_ACME_TOKEN'] }, `touch ${ran}\n${answer([])}`), approve: [] } });
    const found = await run(installed);
    expect(found[0]!.message).toContain('BLAZON_SECRET_ACME_TOKEN');
    expect(JSON.stringify(found)).not.toContain(HOST.BLAZON_SECRET_ACME_TOKEN);
    expect(fs.existsSync(ran)).toBe(false);
  });

  it('does not refuse a listed variable that is not set: there is nothing to hold back', async () => {
    const installed = install({ 'acme.a': { script: reporting(['ACME_FONT_DIR'], marker()), approve: [] } });
    const [found] = await new PluginRun(installed.config, installed.cwd, { env: { PATH: HOST.PATH } }).check(BRAND);
    expect(found).toMatchObject({ code: 'acme.a/env', message: 'seen:' });
  });

  it('refuses a plugin named on the command line with no entry to approve it, and says where the approval goes', async () => {
    const cwd = tempDir();
    const file = path.join(cwd, 'blazon-acme.a');
    fs.writeFileSync(file, reporting(['ACME_FONT_DIR'], marker()));
    fs.chmodSync(file, 0o755);
    const installed = install({});
    const found = await new PluginRun({ ...installed.config, plugins: [] }, cwd, { env: HOST, named: [file], log: () => {} }).check(BRAND);
    expect(found[0]!.code).toBe('plugin-failed');
    expect(found[0]!.fix).toContain('an entry for acme.a in plugins, with its "env"');
  });
});

describe('blazon plugin check, case 10', () => {
  const PLUGIN = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":["check"],"env":["ACME_FONT_DIR"]}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *1[,}]'; then echo '{"findings":[]}'; exit 0; fi
echo 'unsupported record version'; exit 2
`;
  const program = () => {
    const file = path.join(tempDir(), 'blazon-acme.a');
    fs.writeFileSync(file, PLUGIN);
    fs.chmodSync(file, 0o755);
    return file;
  };
  const caseTen = async (approvals?: { key: string; approved: string[] }[]) =>
    (await check({ host: 'blazon', profile: BLAZON_CORE_PROFILE, program: program(), requests: blazonRequests(), ...(approvals && { approvals }) })).find((r) => r.case === 10);

  it('fails for a listed name the config entry does not approve, and says which entry and which name', async () => {
    const result = await caseTen([{ key: 'plugins[2].env', approved: ['HOME'] }]);
    expect(result).toMatchObject({ passed: false, skipped: false });
    expect(result!.detail).toContain('plugins[2].env does not approve ACME_FONT_DIR');
  });

  it('fails when one of two instances leaves a name out', async () => {
    const result = await caseTen([{ key: 'plugins[0].env', approved: ['ACME_FONT_DIR'] }, { key: 'plugins[1].env', approved: [] }]);
    expect(result).toMatchObject({ passed: false });
    expect(result!.detail).toContain('plugins[1].env');
    expect(result!.detail).not.toContain('plugins[0].env');
  });

  it('passes when every entry approves the name', async () => {
    expect(await caseTen([{ key: 'plugins[0].env', approved: ['ACME_FONT_DIR'] }])).toMatchObject({ passed: true });
  });

  it('is skipped when the plugin is not in the config, and is not run with no project to ask', async () => {
    expect(await caseTen([])).toMatchObject({ skipped: true });
    expect(await caseTen()).toBeUndefined();
  });

});
