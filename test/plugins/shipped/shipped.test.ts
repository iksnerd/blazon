import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { chainProblem } from '../../../src/plugins/pins/interpreter.js';
import { LOCK_FILE, writeLockFile, type Lock } from '../../../src/plugins/pins/lock.js';
import { treeDigest } from '../../../src/plugins/pins/pin.js';
import { PluginRun, type PluginRunOptions } from '../../../src/plugins/roles/roles.js';
import { findShipped, shippedDirectory, shippedProblem } from '../../../src/plugins/pins/shipped.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { BRAND, answer, script as shell } from '../support/fixtures.js';
import { ROOT_DIR } from '../support/spec.js';
import { starterProject, tempDir } from '../../support/project';

// Plugins that ship inside blazon's package (RFC 0005 section 3.6). Each test builds a fake install, a plugins
// folder with a lock beside it, and runs a real fixture plugin through PluginRun. The install is made where every
// directory above it is clean, because the host refuses a plugin whose folder or any directory above it can be written
// by group or others; /tmp is not clean.

const NAME = 'blazon.fixture';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const cache = path.join(ROOT_DIR, 'node_modules/.cache');
function scratch(): string {
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(cache, 'blazon-shipped-')));
  dirs.push(dir);
  return dir;
}
const probe = scratch();
const notClean = chainProblem(probe, { final: 'dir' });
fs.rmSync(probe, { recursive: true, force: true });
if (notClean) console.warn(`shipped.test: skipped the tests that need a clean install folder: ${notClean}`);
const here = notClean === undefined ? it : it.skip;
const SHARED_FIX =
  'Install blazon under your own home folder, as the user who runs it, and run the command again: a folder that other users can write, such as /tmp, lets them replace the plugin. Do not change the permissions of a shared folder. Until then, --no-plugins skips the plugins.';

/** A plugin that reports what it sees. The manifest call may change the plugin's own file first, to show the next call is checked again. */
const FIXTURE = `#!/usr/bin/env node
const fs = require('fs');
const FLAG = '/nonexistent';
if (process.argv[2] === '--blazon-manifest') {
  if (fs.existsSync(FLAG)) fs.appendFileSync(__filename, '\\n// changed');
  process.stdout.write(JSON.stringify({ v: 2, roles: ['check'], env: ['REQUEST_COPY'] }));
  process.exit(0);
}
let request;
try { request = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch { console.log('the request is not JSON'); process.exit(2); }
if (request.v !== 1) { console.log('unknown request version'); process.exit(2); }
if (process.env.REQUEST_COPY) fs.writeFileSync(process.env.REQUEST_COPY, JSON.stringify(request));
const report = { execPath: process.execPath, version: process.version, cwd: fs.realpathSync(process.cwd()), env: Object.keys(process.env).filter((k) => k !== '__CF_USER_TEXT_ENCODING').sort() };
console.log(JSON.stringify({ findings: [{ code: '${NAME}/report', severity: 'info', path: 'fixture', message: JSON.stringify(report) }] }));
`;
/** The same plugin as an ES module, which has no #! line and is told apart by its extension. */
const MODULE = 'import fs from "node:fs";\n' + FIXTURE.split('\n').slice(1).join('\n').replace("const fs = require('fs');", '').replace(/__filename/g, 'process.argv[1]').replace(/require\('fs'\)/g, 'fs');

/** The plugin changes its own file during the manifest call when this file exists. */
const SELFMOD = (flag: string) => FIXTURE.replace("const FLAG = '/nonexistent';", `const FLAG = ${JSON.stringify(flag)};`);
const FIXTURE_MARKER = (marker: string) => FIXTURE.replace("if (process.argv[2] === '--blazon-manifest') {", `fs.writeFileSync(${JSON.stringify(marker)}, 'started');\nif (process.argv[2] === '--blazon-manifest') {`);

interface Install {
  /** The fake install's plugins folder, with shipped.lock beside the plugin folders */
  shipped: string;
  /** The project the plugin is configured in */
  cwd: string;
  config: BlazonConfig;
  folder: string;
  entry: string;
  options: PluginRunOptions;
}

/** A fake install with one shipped plugin, its lock made from the folder. `entryName` is the program's path inside the folder. */
function install(source = FIXTURE, entryName = `bin/blazon-${NAME}.🔌`, name = NAME, root = scratch()): Install {
  const shipped = path.join(root, 'plugins');
  const folder = path.join(shipped, name);
  const entry = path.join(folder, entryName);
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, source);
  fs.chmodSync(entry, 0o755);
  writeLock(shipped, { [name]: { path: name, entry: entryName, digest: treeDigest(folder) } });
  const cwd = tempDir();
  const config = { ...DEFAULT_CONFIG, plugins: [{ name, env: ['REQUEST_COPY'] }] } as BlazonConfig;
  return { shipped, cwd, config, folder, entry, options: { shipped } };
}
function writeLock(shipped: string, plugins: Record<string, { path: string; entry: string; digest: string }>): void {
  const lock: Lock = { v: 1, plugins: Object.fromEntries(Object.entries(plugins).map(([name, p]) => [name, { kind: 'tree' as const, ...p, source: 'computed' as const }])) };
  writeLockFile(path.join(shipped, 'shipped.lock'), lock);
}

const check = (i: Install, extra: PluginRunOptions = {}) => new PluginRun(i.config, i.cwd, { ...i.options, ...extra }).check(BRAND);
const report = (findings: { message: string }[]) => JSON.parse(findings[0]!.message) as { execPath: string; version: string; cwd: string; env: string[] };
/** The one reason a plugin was refused, or fails the test. */
async function refused(i: Install, extra: PluginRunOptions = {}): Promise<string> {
  const findings = await check(i, extra);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ code: 'plugin-failed', severity: 'error', path: i.config.plugins![0]!.name });
  return findings[0]!.message;
}

describe('where the shipped plugins are', () => {
  it("is the plugins folder at blazon's package root, with no way to point it elsewhere", () => {
    expect(shippedDirectory()).toBe(path.join(ROOT_DIR, 'plugins'));
    expect(fs.readFileSync(path.join(ROOT_DIR, 'src/plugins/pins/shipped.ts'), 'utf-8')).not.toMatch(/process\.env\b/);
  });

  it("verifies the plugin blazon ships, in place, against the lock that ships beside it", () => {
    const found = findShipped(shippedDirectory(), 'blazon.print-book');
    expect(found).toMatchObject({ directory: path.join(ROOT_DIR, 'plugins/blazon.print-book'), entry: path.join(ROOT_DIR, 'plugins/blazon.print-book/bin/blazon-blazon.print-book.🔌') });
    const clean = chainProblem(shippedDirectory(), { final: 'dir' });
    if (clean) return console.warn(`shipped.test: skipped the check of the real shipped plugin: ${clean}`);
    expect(shippedProblem(found as Exclude<typeof found, { problem: string } | undefined>)).toBeUndefined();
  });
});

describe('finding a shipped plugin', () => {
  here('resolves a configured name that the project lock does not pin to the shipped plugin', async () => {
    const found = await check(install());
    expect(found.map((f) => f.code)).toEqual([`${NAME}/report`]);
  });

  here('lets a project pin win over a shipped plugin of the same name', async () => {
    const i = install();
    const project = { ...i, cwd: tempDir() };
    const own = path.join(project.cwd, 'plugins', NAME);
    fs.mkdirSync(own, { recursive: true, mode: 0o700 });
    const file = path.join(own, `blazon-${NAME}`);
    fs.writeFileSync(file, shell({ v: 2, roles: ['check'] }, answer([{ code: `${NAME}/mine`, severity: 'warning', path: 'p', message: 'from the project' }])), { mode: 0o755 });
    const { recordPin } = await import('../../../src/plugins/pins/lock.js');
    recordPin(project.cwd, NAME, own);
    expect(fs.existsSync(path.join(project.cwd, LOCK_FILE))).toBe(true);
    expect((await check(project)).map((f) => f.code)).toEqual([`${NAME}/mine`]);
  });

  it('is the same plugin-failed as today for a name that is neither pinned nor shipped', async () => {
    const i = install();
    i.config = { ...i.config, plugins: [{ name: 'acme.other' }] } as BlazonConfig;
    expect(await refused(i)).toMatch(/^no program found: it is not pinned \(see blazon plugin pin\), and there is no blazon-acme\.other in \.blazon\/plugins or on PATH$/);
  });

  describe('a shipped name cannot be shadowed', () => {
    const shadow = (dir: string) => {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `blazon-${NAME}`);
      fs.writeFileSync(file, shell({ v: 2, roles: ['build'] }, 'exit 0'), { mode: 0o755 });
      fs.chmodSync(file, 0o755);
      return file;
    };
    const ran = (i: Install, file: string) => {
      // A shadow that were started would be a build plugin and add no finding; mark it by a file instead.
      fs.writeFileSync(file, `#!/bin/sh\ntouch ${JSON.stringify(path.join(i.cwd, 'shadow-ran'))}\nexit 1\n`, { mode: 0o755 });
      return () => fs.existsSync(path.join(i.cwd, 'shadow-ran'));
    };

    here('by a program in .blazon/plugins', async () => {
      const i = install();
      const started = ran(i, shadow(path.join(i.cwd, '.blazon', 'plugins')));
      expect((await check(i)).map((f) => f.code)).toEqual([`${NAME}/report`]);
      expect(started()).toBe(false);
    });

    here('by a program on PATH', async () => {
      const i = install();
      const bin = path.join(i.cwd, 'bin');
      const started = ran(i, shadow(bin));
      expect((await check(i, { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } })).map((f) => f.code)).toEqual([`${NAME}/report`]);
      expect(started()).toBe(false);
    });

    here('by a program named on the command line', async () => {
      const i = install();
      const named = shadow(path.join(i.cwd, 'named'));
      const started = ran(i, named);
      expect((await check(i, { named: [named] })).map((f) => f.code)).toEqual([`${NAME}/report`]);
      expect(started()).toBe(false);
    });

    here('when the shipped plugin is refused: the shadow does not take its place', async () => {
      const i = install();
      const started = ran(i, shadow(path.join(i.cwd, '.blazon', 'plugins')));
      fs.appendFileSync(i.entry, '\n// changed');
      expect(await refused(i)).toContain('does not match the lock');
      expect(started()).toBe(false);
    });
  });
});

describe('what is refused, and why', () => {
  here('a folder in which one byte changed: the plugin is not started, and the reason names the folder', async () => {
    const marker = path.join(scratch(), 'started');
    const i = install(FIXTURE_MARKER(marker));
    fs.appendFileSync(i.entry, '\n// changed');
    const reason = await refused(i);
    expect(reason).toContain(`the plugin folder ${i.folder} does not match the lock that ships with blazon (want ${treeDigest(i.folder) === '' ? '' : 't1:'}`);
    expect(reason).toMatch(/found t1:[0-9a-f]{64}\); reinstall blazon\)$/);
    expect(reason).toMatch(/^the manifest call did not exit 0 \(unavailable: shipped plugin: /);
    expect(fs.existsSync(marker)).toBe(false);
  });

  here('a file added to the folder', async () => {
    const i = install();
    fs.writeFileSync(path.join(i.folder, 'extra.js'), '');
    expect(await refused(i)).toContain('does not match the lock');
  });

  here('a lock entry for a folder that is not there', async () => {
    const i = install();
    fs.rmSync(i.folder, { recursive: true });
    expect(await refused(i)).toMatch(/does not exist, so blazon will not run a plugin from/);
  });

  here('a lock that is not valid', async () => {
    const i = install();
    fs.writeFileSync(path.join(i.shipped, 'shipped.lock'), '{"v":1,"plugins":{"blazon.fixture":{"kind":"tree"}}}');
    expect(await refused(i)).toMatch(/^the lock that ships with blazon cannot be used \(.*digest.*\); reinstall blazon$/);
    fs.writeFileSync(path.join(i.shipped, 'shipped.lock'), 'not json');
    expect(await refused(i)).toMatch(/^the lock that ships with blazon cannot be used \(.*not valid JSON/);
  });

  here('a lock that others can write', async () => {
    const i = install();
    fs.chmodSync(path.join(i.shipped, 'shipped.lock'), 0o666);
    expect(await refused(i)).toMatch(/^the lock that ships with blazon cannot be used \(shipped\.lock is writable by group or others; run chmod go-w shipped\.lock\)/);
  });

  here('a lock entry that is not a tree inside plugins/', async () => {
    const i = install();
    const lock = JSON.parse(fs.readFileSync(path.join(i.shipped, 'shipped.lock'), 'utf-8'));
    lock.plugins[NAME].path = '../elsewhere';
    fs.writeFileSync(path.join(i.shipped, 'shipped.lock'), JSON.stringify(lock));
    expect(await refused(i)).toMatch(/^shipped\.lock describes blazon\.fixture as something blazon does not run/);
    lock.plugins[NAME] = { kind: 'file', path: `${NAME}/bin/blazon-${NAME}.🔌`, digest: `sha256:${'0'.repeat(64)}`, source: 'computed' };
    fs.writeFileSync(path.join(i.shipped, 'shipped.lock'), JSON.stringify(lock));
    expect(await refused(i)).toMatch(/^shipped\.lock describes blazon\.fixture as something blazon does not run/);
  });

  describe('an install that others can change', () => {
    const problem = ' can be written by group or others, so blazon will not run a plugin from ';
    it.each([
      ['the plugin folder', (i: Install) => i.folder],
      ['the folder that holds the plugins', (i: Install) => i.shipped],
      ['a directory above the plugins', (i: Install) => path.dirname(i.shipped)],
      ['the directory the program is in', (i: Install) => path.dirname(i.entry)],
      ['the program', (i: Install) => i.entry],
    ])('refuses it when %s is writable by group', async (_what, target) => {
      if (notClean) return console.warn('shipped.test: skipped, the install folder is not clean');
      const i = install();
      const place = target(i);
      fs.chmodSync(place, fs.statSync(place).mode | 0o020);
      const reason = await refused(i);
      expect(reason).toContain(`${place}${problem}${i.folder}`);
      const [found] = await check(i);
      expect(found!.fix).toContain('home folder');
    });

    // The default first run of an install under a shared folder (/tmp on Linux, /private/tmp on macOS) lands here: the fix
    // moves the install, because taking write access from a folder other users share breaks it for them
    it('refuses an install under a shared folder such as /tmp, and its fix moves the install and never changes the permissions', async () => {
      const shared = fs.realpathSync('/tmp');
      if ((fs.statSync(shared).mode & 0o002) === 0) return console.warn('shipped.test: skipped, /tmp is not shared on this machine');
      const root = fs.mkdtempSync(path.join(shared, 'blazon-shared-'));
      dirs.push(root);
      const i = install(FIXTURE, undefined, NAME, root);
      const [found, ...rest] = await check(i);
      expect(rest).toEqual([]);
      expect(found!.message).toBe(`the manifest call did not exit 0 (unavailable: shipped plugin: ${shared}${problem}${i.folder})`);
      expect(found!.fix).toBe(SHARED_FIX);
      expect(`${found!.message} ${found!.fix}`).not.toMatch(/chmod|take write access/);
    });

    here('refuses it when the folder is writable by others', async () => {
      const i = install();
      fs.chmodSync(i.folder, 0o757);
      expect(await refused(i)).toContain(`${i.folder}${problem}`);
    });
  });

  here('checks again before every call: a change after one call is caught by the next', async () => {
    const i = install();
    const run = new PluginRun(i.config, i.cwd, i.options);
    expect((await run.check(BRAND)).map((f) => f.code)).toEqual([`${NAME}/report`]);
    fs.appendFileSync(i.entry, '\n// changed');
    const second = await run.check(BRAND);
    expect(second).toHaveLength(1);
    expect(second[0]!.message).toContain('does not match the lock');
  });

  here('checks again before the request, not only before the manifest: a plugin that changes itself while it answers the manifest call is not asked anything', async () => {
    const flag = path.join(scratch(), 'flag');
    fs.writeFileSync(flag, '');
    const i = install(SELFMOD(flag));
    const reason = await refused(i);
    expect(reason).toMatch(/^unavailable: shipped plugin: the plugin folder .* does not match the lock/);
  });
});

describe('running a shipped plugin', () => {
  /** Runs `body` with a node that would fail first on PATH, so a plugin started through PATH shows at once. */
  async function withDecoyNode<T>(body: () => Promise<T>): Promise<T> {
    const decoy = path.join(scratch(), 'decoy');
    fs.mkdirSync(decoy);
    fs.writeFileSync(path.join(decoy, 'node'), '#!/bin/sh\necho decoy node >&2\nexit 7\n', { mode: 0o755 });
    const before = process.env.PATH;
    process.env.PATH = `${decoy}${path.delimiter}${before}`;
    try {
      return await body();
    } finally {
      process.env.PATH = before;
    }
  }

  here('starts JavaScript with the node that runs blazon, in the plugin folder, and not with a node found on PATH', async () => {
    const i = install();
    const found = await withDecoyNode(() => check(i));
    expect(found.map((f) => f.code)).toEqual([`${NAME}/report`]);
    const seen = report(found);
    expect(seen.execPath).toBe(process.execPath);
    expect(seen.version).toBe(process.version);
    expect(seen.cwd).toBe(i.folder);
  });

  here.each([
    ['a program with a .mjs extension', 'bin/main.mjs', MODULE],
    ['a program whose first line is #!/usr/bin/node', 'bin/blazon-blazon.fixture.🔌', FIXTURE.replace('#!/usr/bin/env node', '#!/usr/bin/node')],
  ])('also starts %s with the node that runs blazon', async (_what, entryName, source) => {
    const i = install(source, entryName);
    const found = await withDecoyNode(() => check(i));
    expect(found.map((f) => f.code), JSON.stringify(found)).toEqual([`${NAME}/report`]);
    expect(report(found).execPath).toBe(process.execPath);
  });

  here('runs a program that is not JavaScript as the kernel starts it', async () => {
    const i = install(shell({ v: 2, roles: ['check'] }, answer([{ code: `${NAME}/shell`, severity: 'info', path: 'p', message: 'from sh' }])));
    expect((await check(i)).map((f) => f.code)).toEqual([`${NAME}/shell`]);
  });

  here('gives it the clean environment and the request, as for any plugin', async () => {
    const i = install();
    const copy = path.join(i.cwd, 'request');
    process.env.OTHER_SECRET = 'do-not-pass';
    process.env.REQUEST_COPY = copy;
    try {
      const found = await check(i);
      const names = report(found).env;
      expect(names).toContain('REQUEST_COPY');
      expect(names).not.toContain('OTHER_SECRET');
      expect(names.filter((name) => !['PATH', 'REQUEST_COPY'].includes(name))).toEqual([]);
    } finally {
      delete process.env.OTHER_SECRET;
      delete process.env.REQUEST_COPY;
    }
    expect(JSON.parse(fs.readFileSync(copy, 'utf-8'))).toEqual({ v: 1, type: 'check', options: {}, brand: BRAND });
  });

  here('may authorize: a check plugin that is shipped is admitted as pinned', async () => {
    const i = install();
    const found = await check(i);
    expect(found[0]).toMatchObject({ code: `${NAME}/report`, severity: 'info' });
    expect(found.some((f) => f.code === 'plugin-failed')).toBe(false);
  });

  here('is stopped by the breaker like any plugin: a plugin that breaks three times in a row is not started again', async () => {
    const i = install(FIXTURE.replace("console.log(JSON.stringify({ findings", "process.exit(9); console.log(JSON.stringify({ findings"));
    const run = new PluginRun(i.config, i.cwd, i.options);
    const reasons: string[] = [];
    for (let n = 0; n < 4; n++) reasons.push((await run.check(BRAND))[0]!.message);
    expect(reasons[0]).toContain('exited with 9');
    expect(reasons[3]).toMatch(/stopped|broke/i);
  });
});

describe('blazon plugin check', () => {
  here('accepts a shipped plugin by the path of its program', () => {
    const i = install();
    // Run in the install's own folder, not the repository root: `blazon plugin check` gives each variable the plugin declares the value
    // 'check', and the fixture writes the request to that path, so in the root it left a file named `check` there.
    const tsx = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
    const result = spawnSync(process.execPath, ['--import', tsx, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), 'plugin', 'check', i.entry], { encoding: 'utf-8', cwd: i.cwd, env: { ...process.env, NO_COLOR: '1' } });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 60_000);
});

describe('blazon check', () => {
  it('shows plugin-failed for a name that is not pinned, not shipped and not found, as it does today', async () => {
    const cwd = await starterProject({ plugins: ['acme.none'] });
    const tsx = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
    const result = spawnSync(process.execPath, ['--import', tsx, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), 'check'], { encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' } });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('no program found: it is not pinned (see blazon plugin pin), and there is no blazon-acme.none in .blazon/plugins or on PATH');
  }, 60_000);
});
