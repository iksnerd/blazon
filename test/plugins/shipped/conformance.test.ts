import { describe, it, expect } from 'vitest';
import { spawnSync } from '../../support/spawn';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLockFile } from '../../../src/plugins/pins/lock.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';
import { EXTERNAL } from '../../../scripts/plugin-externals.js';
import { treeDigest } from '../../../src/plugins/pins/pin.js';

// What every plugin in plugins/blazon.* must be, found from the folder, so a plugin added later is held to it with no edit here:
// one built program that holds all its code and imports nothing outside its folder but Node's modules and two named packages,
// a package.json and a README, a source in src/shipped, a pin in shipped.lock, a manifest that tells the truth, finding codes in one style, and the same answer to a broken request (exit 2, the reason first, nothing
// written). Entries run from source, as the plugins' own tests run them, and nothing here needs a browser.

const PLUGINS = path.join(ROOT_DIR, 'plugins');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const names = fs
  .readdirSync(PLUGINS, { withFileTypes: true })
  .filter((item) => item.isDirectory() && item.name.startsWith('blazon.'))
  .map((item) => item.name)
  .sort();

/** Variables a plugin reads that its manifest leaves out on purpose, with why. */
const NOT_DECLARED: Record<string, string> = {
  BLAZON_PRINT_SECONDS: 'a knob for running blazon.print-book by hand and for its tests; its README says blazon does not pass it',
};

const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf-8');

/** The key of the plugin's source, such as `shipped/favicons`, and the folder of that source. */
function entryOf(name: string): { key: string; source: string } {
  const key = `shipped/${name.replace(/^blazon\./, '')}`;
  return { key, source: path.join(ROOT_DIR, 'src', key) };
}


/** Every module a built program loads: its `require` calls, which are the only way a CommonJS file reaches outside itself. Comments are skipped. */
function loads(program: string): string[] {
  const code = program
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return [...code.matchAll(/\brequire\(\s*(['"`])([^'"`]*)\1\s*\)/g)].map((match) => match[2]!);
}

/** The entry, started as blazon starts a plugin: one request on standard input and only the variables it is given. */
function run(source: string, input: string, args: string[] = []) {
  const result = spawnSync(process.execPath, ['--import', TSX, path.join(source, 'main.ts'), ...args], {
    input,
    encoding: 'utf-8',
    env: { PATH: '/usr/bin:/bin', HOME: os.homedir() },
  });
  return { status: result.status, out: result.stdout, err: result.stderr, first: result.stdout.split('\n')[0]! };
}

/** Every .ts file under a folder */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? sources(path.join(dir, item.name)) : item.name.endsWith('.ts') ? [path.join(dir, item.name)] : []));
}

describe('plugins/', () => {
  it('holds at least the plugins blazon ships', () => {
    expect(names).toEqual(expect.arrayContaining(['blazon.favicons', 'blazon.print-book', 'blazon.social-cards']));
  });

  it('has a shipped.lock that is the one the folders make (scripts/shipped-lock.mjs --check, which writes nothing)', () => {
    const ran = spawnSync(path.join(ROOT_DIR, 'node_modules/.bin/tsx'), [path.join(ROOT_DIR, 'scripts/shipped-lock.mjs'), '--check'], { encoding: 'utf-8' });
    expect(ran.status, ran.stderr).toBe(0);
    const lock = readLockFile(path.join(PLUGINS, 'shipped.lock'), 'shipped.lock');
    expect(lock.problems).toEqual([]);
    expect(Object.keys(lock.lock.plugins).sort()).toEqual(names);
  });
});

describe.each(names)('%s', (name) => {
  const { key, source } = entryOf(name);
  const folder = path.join(PLUGINS, name);

  it('has one executable program that node runs, a package.json that makes it CommonJS, and a README', () => {
    const program = path.join(folder, 'bin', `blazon-${name}.🔌`);
    expect(fs.statSync(program).mode & 0o111, `${program} is not executable`).toBe(0o111);
    expect(fs.readFileSync(program, 'utf-8').split('\n')[0]).toBe('#!/usr/bin/env node');
    expect(fs.readdirSync(path.join(folder, 'bin'))).toEqual([`blazon-${name}.🔌`]);
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf-8'))).toEqual({ type: 'commonjs' });
    expect(fs.readFileSync(path.join(folder, 'README.md'), 'utf-8').split('\n')[0], 'README.md should open with the plugin name').toBe(`# ${name}`);
  });

  it('holds all its code: it loads only Node\'s modules and the packages the RFC names, never a file of blazon\'s dist/ or src/', () => {
    const program = fs.readFileSync(path.join(folder, 'bin', `blazon-${name}.🔌`), 'utf-8');
    const outside = loads(program).filter((specifier) => !specifier.startsWith('node:') && !EXTERNAL.includes(specifier));
    expect(outside, `${name} loads ${outside.join(', ')}`).toEqual([]);
    expect(program, 'a dynamic import() of a file would reach outside the folder too').not.toMatch(/^\s*(?:await\s+)?import\(\s*['"`]\.{1,2}\//m);
    expect(program).not.toMatch(/\/dist\/(?:shipped|chunks)\//);
  });

  it('runs from its folder alone: copied where blazon\'s dist/ is not, it gives the manifest the source gives', () => {
    const away = tempDir('blazon-conformance-copy-');
    fs.cpSync(folder, path.join(away, name), { recursive: true });
    // The two packages it names are found in node_modules, as they are beside an installed blazon
    fs.symlinkSync(path.join(ROOT_DIR, 'node_modules'), path.join(away, 'node_modules'));
    const program = path.join(away, name, 'bin', `blazon-${name}.🔌`);
    const built = spawnSync(process.execPath, [program, '--blazon-manifest'], { encoding: 'utf-8', cwd: path.join(away, name) });
    expect(built.status, built.stderr).toBe(0);
    expect(JSON.parse(built.stdout)).toEqual(JSON.parse(run(source, '', ['--blazon-manifest']).out));
  });

  it('is built the same way every time: its bytes carry no build stamp, no path of this machine and no hashed name', () => {
    const program = fs.readFileSync(path.join(folder, 'bin', `blazon-${name}.🔌`), 'utf-8');
    expect(program).not.toContain('__BLAZON_BUILD__');
    expect(program).not.toContain(ROOT_DIR);
    expect(program).not.toMatch(/chunks\/[\w-]+-[A-Za-z0-9_-]{8}\.js/);
  });

  it('has a source in src/shipped, and is pinned in shipped.lock', () => {
    expect(key).toMatch(/^shipped\/[a-z0-9-]+$/);
    expect(fs.existsSync(path.join(source, 'main.ts'))).toBe(true);
    const pin = JSON.parse(read('plugins/shipped.lock')).plugins[name];
    expect(pin).toMatchObject({ kind: 'tree', path: name, entry: `bin/blazon-${name}.🔌` });
    expect(pin.digest, 'the lock does not describe the folder as built').toBe(treeDigest(folder));
  });

  describe('the manifest', () => {
    const ran = run(source, '', ['--blazon-manifest']);
    const manifest = ran.status === 0 ? JSON.parse(ran.out) : {};

    it('is one JSON line on exit 0, and the fields are the host\'s', () => {
      expect(ran.status, ran.err).toBe(0);
      expect(ran.out.endsWith('\n') && ran.out.trim().split('\n').length === 1).toBe(true);
      expect(manifest.v).toBe(2);
      expect(manifest.roles.length).toBeGreaterThan(0);
      expect(new Set(manifest.roles).size).toBe(manifest.roles.length);
      expect(manifest.roles.every((role: string) => role === 'check' || role === 'build')).toBe(true);
      expect(Number.isInteger(manifest.timeout_ms) && manifest.timeout_ms > 0 && manifest.timeout_ms <= 60000, `timeout_ms ${manifest.timeout_ms}`).toBe(true);
      expect(manifest.env.every((variable: string) => /^[A-Z0-9_]+$/.test(variable))).toBe(true);
    });

    it('has a title, a description of at most 160 characters and a version, in the style of the others', () => {
      expect(typeof manifest.title === 'string' && manifest.title.length > 0).toBe(true);
      expect(typeof manifest.description === 'string' && manifest.description.length > 0 && manifest.description.length <= 160).toBe(true);
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('lists every variable the source reads', () => {
      const files = sources(source);
      // Only the shared files the plugin imports: a plugin that never draws with a browser reads no BLAZON_CHROME
      const shared = new Set(files.flatMap((file) => [...fs.readFileSync(file, 'utf-8').matchAll(/from '\.\.\/shared\/([\w-]+)\.js'/g)].map((match) => match[1]!)));
      files.push(...[...shared].map((name) => path.join(ROOT_DIR, 'src/shipped/shared', `${name}.ts`)));
      const read = new Set(files.flatMap((file) => [...fs.readFileSync(file, 'utf-8').matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]!)));
      for (const variable of read) if (!NOT_DECLARED[variable]) expect(manifest.env, `${name} reads ${variable}`).toContain(variable);
    });
  });

  it('writes finding codes as <name>/<lowercase-words> with a severity of error, warning or info', () => {
    for (const file of sources(source)) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const [, code] of text.matchAll(/\$\{NAME\}\/([^`'"]*)[`'"]/g)) expect(code, `${file}: finding code`).toMatch(/^([a-z0-9]+(-[a-z0-9]+)*|\$\{code\})$/);
      for (const [, code] of text.matchAll(new RegExp(`['"\`]${name.replace(/\./g, '\\.')}/([^'"\`]*)['"\`]`, 'g'))) expect(code, `${file}: finding code`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const [, severity] of text.matchAll(/severity: '([^']*)'/g)) expect(['error', 'warning', 'info'], `${file}: severity`).toContain(severity);
    }
  });

  describe('a broken request', () => {
    const manifest = JSON.parse(run(source, '', ['--blazon-manifest']).out);
    const site = tempDir('blazon-conformance-site-');
    fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html>');
    const out = tempDir('blazon-conformance-out-');
    const request = (fields: object) => JSON.stringify({ v: 1, type: manifest.roles[0], brand: {}, options: {}, site_dir: site, out_dir: out, ...fields });

    it.each([
      ['is not JSON', '{ nope'],
      ['is empty', ''],
      ['is not an object', '[]'],
      ['is of another version', request({ v: 2 })],
      ['is for a role that is not one', request({ type: 'conformance-probe' })],
    ])('exits 2 with the reason on the first line, and writes nothing, when it %s', (_, input) => {
      const ran = run(source, input);
      expect(ran.status, ran.out + ran.err).toBe(2);
      expect(ran.first.length).toBeGreaterThan(0);
      expect(() => JSON.parse(ran.first), 'the first line is a reason, not an answer').toThrow();
      expect(fs.readdirSync(out)).toEqual([]);
    });

    it('exits 2 for a role the manifest does not list', () => {
      for (const role of ['check', 'build'].filter((role) => !manifest.roles.includes(role))) {
        const ran = run(source, request({ type: role }));
        expect(ran.status, `${role}: ${ran.out}${ran.err}`).toBe(2);
        expect(fs.readdirSync(out)).toEqual([]);
      }
    });

    it('exits 2 when a build has no site_dir or out_dir to work in', () => {
      if (!manifest.roles.includes('build')) return;
      for (const fields of [{ type: 'build', site_dir: undefined }, { type: 'build', out_dir: path.join(out, 'nonexistent') }]) {
        const ran = run(source, request(fields));
        expect(ran.status, ran.out + ran.err).toBe(2);
        expect(ran.first).toMatch(/site_dir|out_dir/);
      }
      expect(fs.readdirSync(out)).toEqual([]);
    });
  });
});
