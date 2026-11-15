import { describe, it, expect } from 'vitest';
import { spawnSync } from '../../support/spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT_DIR } from '../support/spec.js';
import { starterProject, tempDir } from '../../support/project';

// The second reference plugin, examples/plugins/blazon.cue-rules: a brand writes its rules in CUE, over the brand's
// brand.json, and the plugin turns what the rules compute into findings. CUE is the language of the rules; the program
// that speaks the plugin protocol is a short Python file, because `cue` itself does not speak it.

const PLUGIN = path.join(ROOT_DIR, 'examples/plugins/blazon.cue-rules');
const PROGRAM = path.join(PLUGIN, 'blazon-blazon.cue-rules');
const NAME = 'blazon.cue-rules';
const CUE_VERSION = '0.17.1';

/** The cue this machine has, when it is the version the plugin is written for. */
function findCue(): { path?: string; why?: string } {
  const where = spawnSync('which', ['cue'], { encoding: 'utf-8' });
  const cue = where.status === 0 ? where.stdout.trim() : '';
  if (!cue) return { why: 'cue is not installed' };
  const version = spawnSync(cue, ['version'], { encoding: 'utf-8' }).stdout.match(/cue version v(\S+)/)?.[1];
  return version === CUE_VERSION ? { path: cue } : { why: `cue ${version ?? '?'} is installed, and the plugin is written for ${CUE_VERSION}` };
}
const found = findCue();
const python = spawnSync('python3', ['--version']).status === 0;
// A missing cue skips these tests and says so; a machine that installs cue sets BLAZON_REQUIRE_CUE=1 and then a missing cue fails.
if (!found.path) {
  if (process.env.BLAZON_REQUIRE_CUE) throw new Error(`BLAZON_REQUIRE_CUE is set, and ${found.why}`);
  console.warn(`cue-rules.test: skipped, ${found.why}`);
}
const CUE = found.path ?? '';

interface Ran {
  status: number | null;
  out: string;
  err: string;
}
/** The program, started the way a host does: one request on standard input and only the variables it is given. */
function program(input: string | object, env: Record<string, string> = { BLAZON_CUE: CUE }, args: string[] = []): Ran {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  const result = spawnSync(PROGRAM, args, { input: stdin, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
}
const check = (rules: unknown, brand: object = BRAND, extra: object = {}) => program({ v: 1, type: 'check', options: { rules }, brand, ...extra });
const answer = (ran: Ran): { findings: { code: string; severity: string; path: string; message: string }[] } => {
  expect(ran.status, ran.out + ran.err).toBe(0);
  return JSON.parse(ran.out);
};
const cannot = (ran: Ran, reason: RegExp | string): void => {
  expect(ran.status, ran.out + ran.err).toBe(2);
  expect(ran.out.split('\n')[0]).toMatch(reason instanceof RegExp ? reason : new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
};

const BRAND = {
  format: 'blazon-brand',
  version: 1,
  tokens: [
    { path: 'color.blue', type: 'color', value: '#00f', blazon: { tier: 'primitive' } },
    { path: 'brand.primary', type: 'color', value: '#00f', aliasOf: 'color.blue', blazon: { tier: 'semantic' } },
    { path: 'brand.raw', type: 'color', value: '#f00', blazon: { tier: 'semantic' } },
  ],
};
const RAW_COLORS = `
out: [ for t in tokens if t.type == "color" if t.blazon != _|_ if t.blazon.tier == "semantic" if t.aliasOf == _|_ {
  rule: "raw-color", severity: "error", path: t.path, message: "\\(t.path) is a raw value, point it at a primitive"
} ]
`;
const NOTHING = 'out: []';

describe.skipIf(!found.path || !python)('the program', () => {
  it('prints a manifest for the check role that asks for BLAZON_CUE', () => {
    const ran = program('', {}, ['--blazon-manifest']);
    expect(ran.status).toBe(0);
    const manifest = JSON.parse(ran.out);
    expect(manifest.roles).toEqual(['check']);
    expect(manifest.env).toContain('BLAZON_CUE');
    expect(manifest.timeout_ms).toBeGreaterThan(0);
  });

  it('passes `blazon plugin check`', () => {
    const result = spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), 'plugin', 'check', PROGRAM], { encoding: 'utf-8', env: { ...process.env, BLAZON_CUE: CUE } });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('Passed');
  }, 60_000);

  it('answers with no findings when the rules find nothing', () => {
    expect(answer(check(NOTHING)).findings).toEqual([]);
    expect(answer(check(RAW_COLORS, { ...BRAND, tokens: BRAND.tokens.slice(0, 2) })).findings).toEqual([]);
  });

  it('turns what the rules compute into findings: the code carries the plugin name, the rest is the rule\'s', () => {
    expect(answer(check(RAW_COLORS)).findings).toEqual([
      { code: `${NAME}/raw-color`, severity: 'error', path: 'brand.raw', message: 'brand.raw is a raw value, point it at a primitive' },
    ]);
  });

  it('keeps the order the rules give, and every severity', () => {
    const rules = `out: [
      {rule: "b-first", severity: "info", path: "a", message: "one"},
      {rule: "a-second", severity: "warning", path: "b", message: "two"},
      {rule: "c-third", severity: "error", path: "c", message: "three"},
    ]`;
    const found = answer(check(rules)).findings;
    expect(found.map((f) => [f.code, f.severity])).toEqual([[`${NAME}/b-first`, 'info'], [`${NAME}/a-second`, 'warning'], [`${NAME}/c-third`, 'error']]);
  });

  it('sees the whole brand, not a part of it', () => {
    const rules = 'out: [ if brand.title == "Mine" { rule: "title", severity: "info", path: "brand", message: "\\(brand.title)" } ]';
    const brand = { ...BRAND, brand: { title: 'Mine' } };
    expect(answer(check(rules, brand)).findings.map((f) => f.message)).toEqual(['Mine']);
  });

  describe('says it cannot judge, and never passes, when', () => {
    it('the request is not JSON, of another version, or for another role', () => {
      cannot(program('{ not json'), 'the request is not JSON');
      cannot(program({ v: 2, type: 'check', options: { rules: NOTHING }, brand: BRAND }), 'this plugin speaks version 1 of the request');
      cannot(program({ v: 1, type: 'build', options: { rules: NOTHING }, brand: BRAND }), 'this plugin fills the check role');
    });

    it.each([
      ['missing', undefined],
      ['not text', 5],
      ['empty', ''],
      ['only white space', '  \n'],
    ])('options.rules is %s', (_what, rules) => {
      cannot(check(rules), 'options.rules is required');
    });

    it('the rules are not valid CUE, and says where without a stack of noise', () => {
      const ran = check('out: [ {');
      cannot(ran, /^cue could not read the rules/);
      expect(ran.out.length).toBeLessThan(2000);
    });

    it('the rules are invalid in many places: it keeps the first lines, not a page', () => {
      const ran = check(`out: [ ${'a'.repeat(5000)} ]`);
      cannot(ran, /^cue could not read the rules/);
      expect(ran.out.length).toBeLessThan(1700);
    });

    it('the brand in the request is not an object', () => {
      cannot(check(NOTHING, null as unknown as object), 'the brand in the request is not a blazon brand');
      cannot(check(NOTHING, [] as unknown as object), 'the brand in the request is not a blazon brand');
    });

    it('the brand in the request is not a version 1 blazon brand', () => {
      cannot(check(NOTHING, { ...BRAND, format: 'nope' }), 'the brand in the request is not a blazon brand: its format is "nope", not "blazon-brand"');
      cannot(check(NOTHING, { ...BRAND, version: 9 }), 'the brand in the request is version 9; this reader understands version 1');
      cannot(check(NOTHING, { tokens: [] }), 'its format is nothing');
    });

    it('the rules define no out', () => {
      cannot(check('title: "no out here"'), 'the rules must define `out`');
    });

    it('out is not a list of findings', () => {
      cannot(check('out: "a string"'), 'out must be a list');
      cannot(check('out: [1]'), 'out[0] must be an object');
    });

    it.each([
      ['no rule', '{severity: "error", path: "p", message: "m"}', 'out[0].rule'],
      ['a rule with capitals', '{rule: "Raw", severity: "error", path: "p", message: "m"}', 'out[0].rule'],
      ['a rule with a slash', '{rule: "a/b", severity: "error", path: "p", message: "m"}', 'out[0].rule'],
      ['an unknown severity', '{rule: "r", severity: "fatal", path: "p", message: "m"}', 'out[0].severity'],
      ['no path', '{rule: "r", severity: "error", message: "m"}', 'out[0].path'],
      ['a message that is not text', '{rule: "r", severity: "error", path: "p", message: 3}', 'out[0].message'],
    ])('a finding has %s', (_what, finding, field) => {
      cannot(check(`out: [${finding}]`), field);
    });

    it('the rules are slow: it stops cue and says so', () => {
      const rules = 'out: [ for i in list.Range(0, 100000000, 1) { rule: "r", severity: "info", path: "p", message: "m" } ]';
      cannot(check(`import "list"\n${rules}`, BRAND, {}), /cue (did not finish|could not read the rules)/);
    }, 60_000);

    it('cue is not found', () => {
      cannot(program({ v: 1, type: 'check', options: { rules: NOTHING }, brand: BRAND }, { BLAZON_CUE: '/nonexistent/cue' }), 'cue was not found');
      cannot(program({ v: 1, type: 'check', options: { rules: NOTHING }, brand: BRAND }, {}), 'cue was not found');
    });

    it('cue is another version than the one the plugin is written for', () => {
      const dir = tempDir();
      const fake = path.join(dir, 'cue');
      fs.writeFileSync(fake, '#!/bin/sh\necho "cue version v0.16.0"\n', { mode: 0o755 });
      cannot(program({ v: 1, type: 'check', options: { rules: NOTHING }, brand: BRAND }, { BLAZON_CUE: fake }), `cue ${CUE_VERSION} is required, found 0.16.0`);
    });
  });

  it('puts every key of the brand in scope or beside it, whatever the key is called', () => {
    const brand = { ...BRAND, for: 1, import: 2, 'my-key': 3, $schema: 'x', 'quo"te': 4, 'é': 5, tokens: BRAND.tokens };
    const rules = 'out: [ if tokens != _|_ { rule: "seen", severity: "info", path: "p", message: "ok" } ]';
    expect(answer(check(rules, brand)).findings.map((f) => f.code)).toEqual([`${NAME}/seen`]);
  });

  it('carries text that is not ASCII into the rules unchanged', () => {
    const brand = { ...BRAND, brand: { title: 'Café 日本 😀' } };
    const rules = 'out: [ { rule: "title", severity: "info", path: "p", message: brand.title } ]';
    expect(answer(check(rules, brand)).findings.map((f) => f.message)).toEqual(['Café 日本 😀']);
  });

  it('does not run rules the brand puts in its own data: the brand is data, never CUE', () => {
    const brand = { ...BRAND, brand: { title: 'x" }\nout: [ {rule: "injected", severity: "error", path: "p", message: "m"} ]\n//' } };
    expect(answer(check(NOTHING, brand)).findings).toEqual([]);
  });

  it('leaves nothing behind in the temporary directory', () => {
    const scratch = tempDir('blazon-cue-tmpdir-');
    const env = { BLAZON_CUE: CUE, TMPDIR: scratch };
    const request = (rules: string) => ({ v: 1, type: 'check', options: { rules }, brand: BRAND });
    answer(program(request(RAW_COLORS), env));
    cannot(program(request('out: [ {'), env), /./);
    expect(fs.readdirSync(scratch)).toEqual([]);
  });
});

const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const blazon = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(ROOT_DIR, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd, env: { ...process.env, BLAZON_CUE: CUE } });
const output = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

/** The starter, with the plugin copied in and pinned, and the rules in a `rules.cue` of the project that the config reads. */
async function project(rules: string): Promise<string> {
  const root = await starterProject();
  fs.cpSync(PLUGIN, path.join(root, 'plugins/blazon.cue-rules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rules.cue'), rules);
  const pin = blazon(root, 'plugin', 'pin', 'plugins/blazon.cue-rules', '--name', NAME);
  expect(pin.status, output(pin)).toBe(0);
  const config = path.join(root, 'blazon.config.ts');
  const text = fs.readFileSync(config, 'utf-8').replace('export default defineConfig({', `export default defineConfig({\n  plugins: [{ name: '${NAME}', options: { rules: readFileSync('rules.cue', 'utf-8') } }],`);
  fs.writeFileSync(config, `import { readFileSync } from 'node:fs';\n${text}`);
  return root;
}

describe.skipIf(!found.path || !python)('in the real commands', () => {
  it('fails `blazon check` for a rule the brand breaks, with the code, the path and the message', async () => {
    const root = await project(`out: [ for t in tokens if t.type == "color" if t.blazon != _|_ if t.blazon.tier == "primitive" if t.path == "color.base.bone" {
      rule: "no-bone", severity: "error", path: t.path, message: "\\(t.path) is bone, which this brand does not use"
    } ]`);
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('color.base.bone is bone, which this brand does not use');
    expect(output(result)).toContain(`[${NAME}/no-bone]`);
  }, 180_000);

  it('passes `blazon check` and `blazon build` when the rules find nothing, and the site is built', async () => {
    const root = await project(NOTHING);
    expect(blazon(root, 'check').status).toBe(0);
    const build = blazon(root, 'build');
    expect(build.status, output(build)).toBe(0);
    expect(fs.existsSync(path.join(root, 'dist/site/index.html'))).toBe(true);
  }, 180_000);

  it('reports a rules file it cannot read as a failure of the plugin, not a pass', async () => {
    const root = await project('out: [ {');
    const result = blazon(root, 'check');
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toContain('[plugin-failed]');
    expect(output(result)).toContain('cue could not read the rules');
  }, 180_000);

  it('is not run once its bytes change', async () => {
    const root = await project(NOTHING);
    fs.appendFileSync(path.join(root, 'plugins/blazon.cue-rules/blazon-blazon.cue-rules'), '\n# edited after pinning\n');
    const result = blazon(root, 'check');
    expect(result.status).toBe(1);
    expect(output(result)).toContain('pin mismatch');
  }, 180_000);
});

describe.skipIf(!found.path || !python)('the starter rules', () => {
  const STARTER = (): string => fs.readFileSync(path.join(PLUGIN, 'rules.cue'), 'utf-8');
  // A new project, never the starter's source itself: a build writes dist/ next to the config, and `blazon init` copies it
  const built = async (): Promise<{ brand: any }> => {
    const root = await starterProject();
    const result = blazon(root, 'build', '-o', path.join(root, 'site'));
    expect(result.status, output(result)).toBe(0);
    return { brand: JSON.parse(fs.readFileSync(path.join(root, 'site/brand.json'), 'utf-8')) };
  };

  it('find nothing in a new project', async () => {
    expect(answer(check(STARTER(), (await built()).brand)).findings).toEqual([]);
  }, 120_000);

  it('find a semantic color that is a raw value', async () => {
    const { brand } = await built();
    const token = brand.tokens.find((t: any) => t.path === 'interactive.primary');
    delete token.aliasOf;
    const found = answer(check(STARTER(), brand)).findings;
    expect(found.map((f) => [f.code, f.severity, f.path])).toEqual([[`${NAME}/semantic-not-alias`, 'warning', 'interactive.primary']]);
  }, 120_000);

  it('find a font family with no generic family at the end', async () => {
    const { brand } = await built();
    const token = brand.tokens.find((t: any) => t.path === 'font.family.body');
    token.resolvedValue = ['Inter'];
    const found = answer(check(STARTER(), brand)).findings;
    expect(found.map((f) => [f.code, f.severity, f.path])).toEqual([[`${NAME}/font-family-no-generic`, 'warning', 'font.family.body']]);
  }, 120_000);
});
