import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { setPlugins, starterProject, tempDir } from '../support/project';
import { doctorChecks, CHROME_PLUGINS, type DoctorCheck, type DoctorEnv } from '../../src/cli/commands/doctor';
import { BLAZON_LOCK } from '../../src/core/blazon-pin';

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

/** A world where every check passes; a test breaks one thing. */
const calm = (over: Partial<DoctorEnv> = {}): DoctorEnv => ({
  nodeVersion: 'v24.1.0',
  engine: '>=24',
  hostProblem: () => undefined,
  chrome: () => true,
  identity: { commit: 'a'.repeat(40), dirty: false, from: 'git' },
  ...over,
});

const byId = (checks: DoctorCheck[], id: string): DoctorCheck => checks.find((c) => c.id === id)!;
const IDS = ['node', 'brand', 'plugin-host', 'chrome', 'lock'];
const pinFile = (commit: string): string => `{\n  "v": 1,\n  "commit": "${commit}"\n}\n`;

describe('doctorChecks', () => {
  it('reports every check, ok in a healthy brand, and writes nothing', async () => {
    const root = await starterProject();
    const before = fs.readdirSync(root).sort();
    const checks = await doctorChecks(root, calm());
    expect(checks.map((c) => c.id)).toEqual(IDS);
    expect(
      checks.map((c) => c.status),
      JSON.stringify(checks),
    ).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(fs.readdirSync(root).sort()).toEqual(before);
  });

  it('node: fails below engines with a fix, ok at it', async () => {
    const root = await starterProject();
    const old = byId(await doctorChecks(root, calm({ nodeVersion: 'v22.3.0' })), 'node');
    expect(old.status).toBe('fail');
    expect(old.fix).toMatch(/24/);
    expect(byId(await doctorChecks(root, calm({ nodeVersion: 'v24.0.0' })), 'node').status).toBe('ok');
  });

  it('brand: fails with no tokens folder, and when the config does not load', async () => {
    const none = byId(await doctorChecks(tempDir(), calm()), 'brand');
    expect(none.status).toBe('fail');
    expect(none.fix).toContain('blazon init');
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'blazon.json'), '{ broken config\n');
    const broken = byId(await doctorChecks(root, calm()), 'brand');
    expect(broken.status).toBe('fail');
    expect(broken.message).toContain('Could not load blazon.json');
  });

  it('plugin-host: the repo helper decides; a problem warns with no plugin configured and fails with one', async () => {
    const root = await starterProject();
    const hostProblem = () => `${root} can be written by group or others`;
    const idle = byId(await doctorChecks(root, calm({ hostProblem })), 'plugin-host');
    expect(idle.status).toBe('warn');
    expect(idle.message).toContain('written by group or others');
    expect(idle.fix).toContain('chmod go-w');
    setPlugins(root, ['blazon.copy']);
    expect(byId(await doctorChecks(root, calm({ hostProblem })), 'plugin-host').status).toBe('fail');
  });

  it('chrome: needed only by a configured plugin that draws', async () => {
    const root = await starterProject();
    expect(byId(await doctorChecks(root, calm({ chrome: () => false })), 'chrome').status).toBe('ok');
    setPlugins(root, ['blazon.favicons']);
    const missing = byId(await doctorChecks(root, calm({ chrome: () => false })), 'chrome');
    expect(missing.status, JSON.stringify(missing)).toBe('fail');
    expect(missing.message).toContain('blazon.favicons');
    expect(missing.fix).toContain('BLAZON_CHROME');
    expect(byId(await doctorChecks(root, calm({ chrome: () => true })), 'chrome').status).toBe('ok');
  });

  it('chrome: the list of drawing plugins is the shipped plugins whose source launches a browser', () => {
    const shipped = path.join(REPO, 'src/shipped');
    const drawing = fs
      .readdirSync(shipped)
      .filter((name) => name !== 'shared' && fs.statSync(path.join(shipped, name)).isDirectory())
      .filter((name) => fs.readdirSync(path.join(shipped, name)).some((f) => f.endsWith('.ts') && fs.readFileSync(path.join(shipped, name, f), 'utf-8').includes('launchChrome')))
      .map((name) => `blazon.${name}`)
      .sort();
    expect([...CHROME_PLUGINS].sort()).toEqual(drawing);
  });

  it('lock: ok with none, ok when it matches, fail with a fix when it does not', async () => {
    const root = await starterProject();
    expect(byId(await doctorChecks(root, calm()), 'lock').message).toContain('no blazon.lock');
    fs.writeFileSync(path.join(root, BLAZON_LOCK), pinFile('a'.repeat(40)));
    expect(byId(await doctorChecks(root, calm()), 'lock').status).toBe('ok');
    const other = byId(await doctorChecks(root, calm({ identity: { commit: 'b'.repeat(40), dirty: false, from: 'git' } })), 'lock');
    expect(other.status).toBe('fail');
    expect(other.message).toContain('pinned to blazon');
    expect(other.fix).toBeTruthy();
  });
});

describe('blazon doctor through the CLI', () => {
  it('--json is the checks as data; exit 1 when one fails, and nothing is written', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, BLAZON_LOCK), pinFile('0'.repeat(40)));
    const before = fs.readdirSync(root).sort();
    const ran = blazon('--cwd', root, 'doctor', '--json');
    const body = JSON.parse(ran.stdout);
    expect(body.command).toBe('doctor');
    expect(body.checks.map((c: DoctorCheck) => c.id)).toEqual(IDS);
    expect(body.checks.find((c: DoctorCheck) => c.id === 'lock').status).toBe('fail');
    expect(body.passed).toBe(false);
    expect(ran.status).toBe(1);
    expect(fs.readdirSync(root).sort()).toEqual(before);
  });

  it('text: one line per check with its status, and a fix line under each that is not ok', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, BLAZON_LOCK), pinFile('0'.repeat(40)));
    const ran = blazon('--cwd', root, 'doctor');
    expect(ran.stdout).toMatch(/^\s*ok\s+node/m);
    expect(ran.stdout).toMatch(/^\s*fail\s+lock/m);
    expect(ran.stdout).toMatch(/fix:/);
    expect(ran.status).toBe(1);
  });

  it('the exit status is 1 exactly when a check fails', async () => {
    const root = await starterProject();
    const ran = blazon('--cwd', root, 'doctor', '--json');
    const body = JSON.parse(ran.stdout);
    expect(ran.status).toBe(body.checks.some((c: DoctorCheck) => c.status === 'fail') ? 1 : 0);
    expect(body.passed).toBe(ran.status === 0);
  });
});
