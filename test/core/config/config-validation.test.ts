import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { DEFAULT_CONFIG, OLD_CONFIG_FILE_NAMES, loadConfig } from '../../../src/core/config/index.js';
import { CONFIG_KEYS, ConfigError } from '../../../src/core/config/validate.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { runCheck } from '../../../src/cli/commands/check.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { ROOT, interfaceKeys } from '../../support/spec-helpers.js';
import { tempDir } from '../../support/project';

// blazon.json is plain JSON written by hand, so it is checked (RFC 0001 §14): an unknown key or a
// value of the wrong type is an error, and a config that cannot be loaded stops the run instead of falling back
// to defaults, which builds a brand book with the wrong title and no theme or logo and looks fine.

function project(config?: string): string {
  const root = tempDir();
  if (config !== undefined) fs.writeFileSync(path.join(root, 'blazon.json'), config);
  return root;
}

const FONTS_MESSAGE =
  'fonts must be a list of stylesheet URLs (strings) or font files {"family": name, "file": path, "weight"?: a number from 1 to 1000, normal, bold or a range such as "200 1000", "style"?: "normal" or "italic"}';

const configFindings = async (config: Record<string, unknown>) =>
  (await compileBlazonData({ ...DEFAULT_CONFIG, ...config } as BlazonConfig, project())).findings.filter((f) => f.code === 'config-invalid');

describe('the config keys the checker knows', () => {
  it('are the keys of BlazonConfig, no more and no fewer', () => {
    expect([...CONFIG_KEYS].sort()).toEqual(interfaceKeys('BlazonConfig').sort());
  });
});

describe('compileBlazonData reports a config that is wrong', () => {
  it('accepts every real config and a config with keys set to undefined', async () => {
    expect(await configFindings({ logo: undefined, theme: undefined, sections: undefined })).toEqual([]);
    const { starterProject } = await import('../../support/init-project.js');
    const { hasReference, referencePath } = await import('../../support/reference.js');
    const reference = hasReference('examples/auth0') ? [referencePath('examples/auth0')] : [];
    for (const dir of [...reference, 'examples/blazon', await starterProject()]) {
      const root = path.resolve(ROOT, dir);
      const found = (await compileBlazonData(await loadConfig(root), root)).findings.filter((f) => f.code === 'config-invalid');
      expect(found, dir).toEqual([]);
    }
  });

  it('names an unknown key as an error on that key, and suggests the key it is close to', async () => {
    const [found, ...rest] = await configFindings({ asset: {} });
    expect(rest).toEqual([]);
    expect(found).toMatchObject({ code: 'config-invalid', severity: 'error', path: 'asset' });
    expect(found!.message).toContain('unknown key "asset"');
    expect(found!.message).toContain('did you mean "assets"?');
    // a typo is a typo: the pin hint is for a key that is not close to any real one
    expect(found!.message).not.toContain('blazon pin');
  });

  it('does not guess when no key is close', async () => {
    const [found] = await configFindings({ colour: 'red' });
    expect(found!.message).toContain('unknown key "colour"');
    expect(found!.message).not.toContain('did you mean');
    expect(found!.message).toContain('known: title,');
  });

  it('says what to do about a key that may belong to a newer blazon', async () => {
    // A key no blazon has yet; the book's own `emailSignature` was the example here until a blazon had it.
    const [found] = await configFindings({ quarterlyDigest: { lines: [] } });
    expect(found).toMatchObject({ code: 'config-invalid', severity: 'error', path: 'quarterlyDigest' });
    expect(found!.message).toContain('unknown key "quarterlyDigest"');
    expect(found!.message).toContain("move the book's blazon pin to a commit that has it before using it (manual, chapter 15)");
  });

  it.each<[string, string, unknown, string]>([
    ['title', 'title', 5, 'title must be a string'],
    ['description', 'description', 5, 'description must be a string'],
    ['a directory', 'tokensDir', '', 'tokensDir must be a path: a non-empty string'],
    ['a directory that is a number', 'docsDir', 3, 'docsDir must be a path: a non-empty string'],
    ['the resolver', 'resolver', 5, 'resolver must be a path: a non-empty string'],
    ['cssPrefix', 'cssPrefix', 5, 'cssPrefix must be a string'],
    ['cssSelector', 'cssSelector', '', 'cssSelector must be a non-empty string'],
    ['a port that is text', 'port', '3000', 'port must be a whole number from 0 to 65535'],
    ['a port that is too high', 'port', 70000, 'port must be a whole number from 0 to 65535'],
    ['a port that is not whole', 'port', 1.5, 'port must be a whole number from 0 to 65535'],
    ['a logo that is a number', 'logo', 5, 'logo must be a path, or {"onLight": path, "onDark"?: path}'],
    ['a logo with no onLight', 'logo', { onDark: 'a.svg' }, 'logo must be a path, or {"onLight": path, "onDark"?: path}'],
    ['a logo with an extra field', 'logo', { onLight: 'a.svg', onLite: 'b.svg' }, 'logo must be a path, or {"onLight": path, "onDark"?: path}'],
    ['a theme that is a list', 'theme', ['accent'], 'theme must be an object of roles to token paths'],
    [
      'a theme role that does not exist',
      'theme',
      { accnt: 'brand.primary' },
      'theme has unknown role "accnt"; known: background, canvas, text, muted, border, accent, accentText, inverse, inverseText, fontDisplay, fontBody, fontMono, radius',
    ],
    ['a theme role that is not a path', 'theme', { accent: 5 }, 'theme.accent must be a token path (a string)'],
    [
      'the shadcn key, which the blazon.shadcn plugin took over',
      'shadcn',
      { ring: 'text.primary' },
      'the "shadcn" key is gone: blazon.shadcn, a plugin blazon ships, takes the same map as its "variables" option. Use { "name": "blazon.shadcn", "options": { "variables": { ... } } } in plugins',
    ],
    ['iconSets that is not a list', 'iconSets', 'lucide', 'iconSets must be a list'],
    ['fonts that is not a list', 'fonts', 'x', FONTS_MESSAGE],
    ['fonts with a number in it', 'fonts', ['https://a', 3], FONTS_MESSAGE],
    ['contextSelectors with a number', 'contextSelectors', { locale: 5 }, 'contextSelectors must be an object of selector strings, one per modifier'],
    ['assets that is a list', 'assets', ['photography'], 'assets must be an object keyed by category'],
  ])('refuses %s', async (_name, key, value, message) => {
    const found = await configFindings({ [key]: value });
    expect(found.map((f) => f.message)).toEqual([message]);
    expect(found[0]).toMatchObject({ severity: 'error', path: key });
  });

  it('names the icon set that is wrong, by its place in the list', async () => {
    const found = await configFindings({ iconSets: [{ name: 'lucide', package: 'lucide-static' }, { name: 'tabler' }] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: 'iconSets[1]', severity: 'error' });
    expect(found[0]!.message).toContain('iconSets[1] must be {"name": string, "package": string');
  });

  it('does not crash on a wrong value: the key is ignored and the default is used', async () => {
    const data = await compileBlazonData({ ...DEFAULT_CONFIG, title: 5, tokensDir: 7, logo: 3 } as unknown as BlazonConfig, project());
    expect(data.title).toBe(DEFAULT_CONFIG.title);
    expect(data.findings.filter((f) => f.code === 'config-invalid').map((f) => f.path)).toEqual(['logo', 'title', 'tokensDir']);
    expect(data.logo).toBeUndefined();
  });
});

describe('loadConfig stops on a config that is wrong', () => {
  it('uses the defaults when there is no config file, as before', async () => {
    expect(await loadConfig(project())).toMatchObject({ tokensDir: './tokens', port: 3000 });
  });

  it('merges a valid config over the defaults and applies overrides', async () => {
    const root = project(`{"title": "Acme", "port": 4000}\n`);
    expect(await loadConfig(root, { port: 5000 })).toMatchObject({ title: 'Acme', port: 5000, tokensDir: './tokens' });
  });

  it('rejects a file that is not JSON, naming the file and the cause', async () => {
    const error = await loadConfig(project(`{\n`)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Could not load blazon.json');
    expect((error as Error).message).toContain('plain JSON');
  });

  it('rejects a comment: JSON has none', async () => {
    await expect(loadConfig(project(`{ // the title\n "title": "Acme" }\n`))).rejects.toThrow(/Could not load blazon\.json/);
  });

  it('rejects JSON that is not an object', async () => {
    await expect(loadConfig(project(`[]\n`))).rejects.toThrow(/blazon\.json must be a JSON object/);
  });

  it.each(OLD_CONFIG_FILE_NAMES)('refuses %s, names it, and names blazon.json as the file to use', async (name) => {
    const root = project();
    fs.writeFileSync(path.join(root, name), "export default { title: 'Old' };\n");
    const error = await loadConfig(root).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).findings.map((f) => [f.code, f.path])).toEqual([['config-invalid', name]]);
    expect((error as ConfigError).message).toContain(`${name} is not read any more: blazon reads plain JSON from blazon.json`);
  });

  it('refuses an old config even when a blazon.json sits beside it, so the old file is not left to look live', async () => {
    const root = project(`{"title": "New"}\n`);
    fs.writeFileSync(path.join(root, 'blazon.config.ts'), "export default { title: 'Old' };\n");
    await expect(loadConfig(root)).rejects.toThrow(/blazon\.config\.ts is not read any more/);
  });

  it('rejects a config with an unknown key or a wrong type, listing every problem', async () => {
    const error = await loadConfig(project(`{"asset": {}, "port": "x", "title": "Acme"}\n`)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain('blazon.json is invalid');
    expect(message).toContain('asset: unknown key "asset"');
    expect(message).toContain('port: port must be a whole number from 0 to 65535');
    expect((error as ConfigError).findings.map((f) => f.path).sort()).toEqual(['asset', 'port']);
  });
});

describe('the command line', () => {
  it('blazon check fails on a config that is wrong, and the message names the key', async () => {
    await expect(runCheck(project(`{"asset": {}}\n`))).rejects.toThrow(/asset: unknown key "asset"/);
  });

  it('exits 1 from the real command, and says why on stderr', () => {
    const root = project(`{"asset": {}}\n`);
    const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts/blazon-src.ts'), 'check', root], { encoding: 'utf-8', cwd: ROOT });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown key "asset"');
  }, 60_000);
});
