import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chainProblem } from '../../../src/plugins/pins/interpreter.js';
import { ROOT_DIR } from '../support/spec.js';
import { starterProject } from '../../support/project';

// The reference plugin, examples/plugins/acme.house-style: one Python file with no dependency. It passes the check
// command, and it works in a real `blazon check` and `blazon build`, pinned by the real `blazon plugin pin`.

const python = spawnSync('python3', ['--version']).status === 0;
const PLUGIN = path.join(ROOT_DIR, 'examples/plugins/acme.house-style');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const blazon = (cwd: string, ...args: string[]) => blazonWith({}, cwd, ...args);
const blazonWith = (env: Record<string, string>, cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd, env: { ...process.env, ...env } });
const output = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

/** The starter, with the reference plugin copied in, pinned by the command, and allowed with these options. */
async function starter(options: Record<string, unknown> | undefined, firstLine?: string): Promise<string> {
  const root = await starterProject();
  // blazon's h3 is set in the body face; the plugin wants every heading in one font, so the project sets it in the display face
  const typography = path.join(root, 'tokens/typography.json');
  const tree = JSON.parse(fs.readFileSync(typography, 'utf-8'));
  tree.type.h3.$value.fontFamily = '{font.family.display}';
  fs.writeFileSync(typography, JSON.stringify(tree, null, 2));
  fs.cpSync(PLUGIN, path.join(root, 'plugins/acme.house-style'), { recursive: true });
  if (firstLine) {
    const entry = path.join(root, 'plugins/acme.house-style/blazon-acme.house-style');
    fs.writeFileSync(entry, fs.readFileSync(entry, 'utf-8').replace(/^#!.*\n/, `${firstLine}\n`));
  }
  const pin = blazon(root, 'plugin', 'pin', 'plugins/acme.house-style', '--name', 'acme.house-style');
  expect(pin.status, output(pin)).toBe(0);
  const config = path.join(root, 'blazon.json');
  const brand = JSON.parse(fs.readFileSync(config, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(config, `${JSON.stringify({ ...brand, plugins: [{ name: 'acme.house-style', ...(options ? { options } : {}) }] }, null, 2)}\n`);
  return root;
}

describe.skipIf(!python)('the reference plugin', () => {
  it('passes `blazon plugin check`', () => {
    const result = blazon(ROOT_DIR, 'plugin', 'check', path.join(PLUGIN, 'blazon-acme.house-style'));
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain('Passed');
  }, 60_000);

  it('says it cannot judge a brand that is not a version 1 blazon brand', () => {
    const run = (brand: object) =>
      spawnSync('python3', [path.join(PLUGIN, 'blazon-acme.house-style')], { input: JSON.stringify({ v: 1, type: 'check', options: { headingFont: 'Inter' }, brand }), encoding: 'utf-8' });
    const wrongFormat = run({ format: 'nope', version: 1, tokens: [] });
    expect(wrongFormat.status).toBe(2);
    expect(wrongFormat.stdout.split('\n')[0]).toBe('the brand in the request is not a blazon brand: its format is "nope", not "blazon-brand"');
    const wrongVersion = run({ format: 'blazon-brand', version: 9, tokens: [] });
    expect(wrongVersion.status).toBe(2);
    expect(wrongVersion.stdout.split('\n')[0]).toBe('the brand in the request is version 9; this reader understands version 1');
    expect(run({ format: 'blazon-brand', version: 1, tokens: [] }).status).toBe(0);
  });

  it('fails `blazon check` for a heading in another font than the one the options name', async () => {
    const root = await starter({ headingFont: 'Inter' });
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('type.h1 is set in Big Shoulders Display, not Inter');
    expect(output(result)).toContain('[acme.house-style/heading-font]');
  }, 120_000);

  it('passes `blazon check` and `blazon build` when the heading is in the named font, and the site is built', async () => {
    const root = await starter({ headingFont: 'Big Shoulders Display' });
    expect(blazon(root, 'check').status).toBe(0);
    const build = blazon(root, 'build');
    expect(build.status, output(build)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 120_000);

  it('says it cannot judge, and does not pass, when the options do not name a font', async () => {
    const root = await starter(undefined);
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('could not answer: options.headingFont is required');
  }, 120_000);

  it('is not run once its bytes change, whatever the pin once said', async () => {
    const root = await starter({ headingFont: 'Big Shoulders Display' });
    fs.appendFileSync(path.join(root, 'plugins/acme.house-style/blazon-acme.house-style'), '\n# edited after pinning\n');
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('pin mismatch');
  }, 120_000);

  // The interpreter is found where blazon says, not where the host's PATH says (RFC 0005 section 3.4)
  describe('its interpreter', () => {
    const python3 = spawnSync('/usr/bin/python3', ['--version']).status === 0 ? '/usr/bin/python3' : undefined;
    const aliasDir = (): string | undefined => {
      const cache = path.join(ROOT_DIR, 'node_modules/.cache');
      fs.mkdirSync(cache, { recursive: true });
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(cache, 'blazon-alias-')));
      dirs.push(dir);
      // A launcher and not a link: Apple's python3 works out what to run from the name it was started by
      if (python3) fs.writeFileSync(path.join(dir, 'pyalias'), `#!/bin/sh\nexec ${python3} "$@"\n`, { mode: 0o755 });
      // Clean all the way up: a checkout under a folder others can write (/tmp) has no place the host would trust
      return python3 && chainProblem(dir, { final: 'dir' }) === undefined ? dir : undefined;
    };

    it('is refused, with what to change, when it is in none of the directories blazon trusts', async () => {
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazon(root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain('[plugin-failed]');
      expect(output(result)).toContain('pyalias is not in the directories blazon trusts for a pinned plugin');
      expect(output(result)).toContain('add the directory that holds it to BLAZON_PLUGIN_PATH');
    }, 120_000);

    it('is found in a directory the operator names in BLAZON_PLUGIN_PATH, and the plugin then runs', async () => {
      const dir = aliasDir();
      if (!dir) return; // no clean place to put the alias on this machine
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'check');
      expect(result.status, output(result)).toBe(0);
      const build = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'build');
      expect(build.status, output(build)).toBe(0);
    }, 120_000);

    it('is refused when the directory the operator names can be written by others, and says so', async () => {
      const dir = aliasDir();
      if (!dir) return;
      fs.chmodSync(dir, 0o775);
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ BLAZON_PLUGIN_PATH: dir }, root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain(`${dir}: ${dir} can be written by group or others`);
    }, 120_000);

    it('is not looked for on the PATH of the host', async () => {
      const dir = aliasDir();
      if (!dir) return;
      const root = await starter({ headingFont: 'Big Shoulders Display' }, '#!/usr/bin/env pyalias');
      const result = blazonWith({ PATH: `${dir}:${process.env.PATH}` }, root, 'check');
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toContain('pyalias is not in the directories blazon trusts');
    }, 120_000);
  });
});
