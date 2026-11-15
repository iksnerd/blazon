import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { DEFAULT_CONFIG, configEntry, loadConfig } from '../../../src/core/config/index.js';
import { CONFIG_KEYS, ConfigError } from '../../../src/core/config/validate.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { runCheck } from '../../../src/cli/commands/check.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { ROOT, interfaceKeys } from '../../support/spec-helpers.js';
import { tempDir } from '../../support/project';

// blazon.config.ts is the one input that is code, so it is checked like data (RFC 0001 §14): an unknown key or a
// value of the wrong type is an error, and a config that cannot be loaded stops the run instead of falling back
// to defaults, which builds a brand book with the wrong title and no theme or logo and looks fine.

function project(config?: string): string {
  const root = tempDir();
  if (config !== undefined) fs.writeFileSync(path.join(root, 'blazon.config.ts'), config);
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
    const { starterProject } = await import('../../support/project.js');
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
      'theme has unknown role "accnt"; known: background, canvas, text, muted, border, accent, accentText, inverse, inverseText, fontDisplay, fontBody, radius',
    ],
    ['a theme role that is not a path', 'theme', { accent: 5 }, 'theme.accent must be a token path (a string)'],
    ['a shadcn that is a list', 'shadcn', ['primary'], 'shadcn must be an object of shadcn variable names to token paths'],
    ['a shadcn variable that does not exist', 'shadcn', { '--primary': 'a.b' }, expect.stringContaining('shadcn has unknown variable "--primary"; known: background, foreground')],
    ['a shadcn variable that is not a path', 'shadcn', { destructive: 5 }, 'shadcn.destructive must be a token path (a string)'],
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
    const root = project(`export default { title: 'Acme', port: 4000 };\n`);
    expect(await loadConfig(root, { port: 5000 })).toMatchObject({ title: 'Acme', port: 5000, tokensDir: './tokens' });
  });

  it('rejects a file that cannot be run, naming the file and the cause', async () => {
    const error = await loadConfig(project(`export default {\n`)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Could not load blazon.config.ts');
  });

  it.each(['folio', '@iksnerd/folio'])('says the package was renamed when a config still imports it as %s', async (old) => {
    const error = await loadConfig(project(`import { defineConfig } from '${old}';\nexport default defineConfig({ title: 'Old' });\n`)).catch((e: unknown) => e);
    expect((error as Error).message).toContain('Could not load blazon.config.ts');
    expect((error as Error).message).toContain(
      "blazon replaces folio, and `@iksnerd/folio` is now `@iksnerd/blazon`: change the import in blazon.config.ts to `import { defineConfig } from '@iksnerd/blazon'`",
    );
  });

  it('does not blame the rename for another module that cannot be found', async () => {
    const error = await loadConfig(project(`import x from 'no-such-module-here';\nexport default { title: String(x) };\n`)).catch((e: unknown) => e);
    expect((error as Error).message).toContain('Could not load blazon.config.ts');
    expect((error as Error).message).not.toContain('renamed');
  });

  it('rejects a file that exports nothing, and says how to export', async () => {
    await expect(loadConfig(project(`const config = { title: 'Acme' };\n`))).rejects.toThrow(
      /blazon\.config\.ts has no default export; write `export default defineConfig\(\{ \.\.\. \}\)`/,
    );
  });

  it('rejects a config with an unknown key or a wrong type, listing every problem', async () => {
    const error = await loadConfig(project(`export default { asset: {}, port: 'x', title: 'Acme' };\n`)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain('blazon.config.ts is invalid');
    expect(message).toContain('asset: unknown key "asset"');
    expect(message).toContain('port: port must be a whole number from 0 to 65535');
    expect((error as ConfigError).findings.map((f) => f.path).sort()).toEqual(['asset', 'port']);
  });

  it('keeps accepting `export const config`', async () => {
    expect((await loadConfig(project(`export const config = { title: 'Acme' };\n`))).title).toBe('Acme');
  });
});

describe('the module a config imports from "@iksnerd/blazon"', () => {
  it('is this file from source', () => {
    expect(configEntry('file:///work/blazon/src/core/config/index.ts')).toBe('/work/blazon/src/core/config/index.ts');
  });

  it("is the package's config entry from a build, where the code sits in a chunk whose export names are mangled", () => {
    expect(configEntry('file:///pkg/dist/chunks/config-CizTd-n9.js')).toBe('/pkg/dist/config/index.js');
  });

  it('is the entry itself when the build does not use a chunk', () => {
    expect(configEntry('file:///pkg/dist/config/index.js')).toBe('/pkg/dist/config/index.js');
  });
});

describe('the command line', () => {
  it('blazon check fails on a config that is wrong, and the message names the key', async () => {
    await expect(runCheck(project(`export default { asset: {} };\n`))).rejects.toThrow(/asset: unknown key "asset"/);
  });

  it('exits 1 from the real command, and says why on stderr', () => {
    const root = project(`export default { asset: {} };\n`);
    const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts/blazon-src.ts'), 'check', root], { encoding: 'utf-8', cwd: ROOT });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown key "asset"');
  }, 60_000);
});
