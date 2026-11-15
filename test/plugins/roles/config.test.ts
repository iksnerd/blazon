import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';
import { literal, shippedPluginNames } from '../../support/starter-facts';

// The `plugins` key of blazon.config.ts is the allowlist (RFC 0002, section 2; RFC 0005 section
// 3.2): only the operator names the plugins that may run, and the config holds no path and no command.

const compile = (plugins: unknown) => compileBlazonData({ ...DEFAULT_CONFIG, plugins } as unknown as BlazonConfig, tempDir());
const invalid = async (plugins: unknown) => (await compile(plugins)).findings.filter((f) => f.code === 'config-invalid');

describe('the `plugins` key', () => {
  it('accepts plugins by name, with options, and none at all', async () => {
    expect(await invalid([{ name: 'acme.house-style', options: { headingFont: 'Inter' } }, { name: 'acme.deck' }])).toEqual([]);
    expect(await invalid([])).toEqual([]);
  });

  it('accepts one plugin listed several times with an id each, an id of 64 characters, and an id equal to its own name', async () => {
    const four = ['a', 'b', 'c', 'd'].map((x) => ({ name: 'acme.book', as: `acme.book-${x}`, options: { pages: x } }));
    expect(await invalid(four)).toEqual([]);
    expect(await invalid([{ name: 'acme.a', as: `acme.${'x'.repeat(59)}` }, { name: 'acme.a', as: 'acme.a' }])).toEqual([]);
    expect(await invalid([{ name: `acme.${'x'.repeat(60)}`, as: 'acme.short' }])).toEqual([]);
  });

  it.each<[string, unknown, string, string]>([
    ['plugins that is not a list', 'acme.house-style', 'plugins', 'plugins must be a list of {"name": plugin name, "options"?: object, "env"?: [variable names]}'],
    ['a name that is not a plugin name', [{ name: 'house-style' }], 'plugins[0]', 'plugins[0].name must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['an uppercase name', [{ name: 'Acme.Style' }], 'plugins[0]', 'plugins[0].name must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['a name that is a path', [{ name: '../acme.style' }], 'plugins[0]', 'plugins[0].name must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['no name', [{ options: {} }], 'plugins[0]', 'plugins[0].name must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['a name used twice', [{ name: 'acme.a' }, { name: 'acme.a' }], 'plugins[1]', 'plugins[1].name "acme.a" is used twice'],
    ['an instance id used twice', [{ name: 'acme.a', as: 'acme.x' }, { name: 'acme.a', as: 'acme.x' }], 'plugins[1]', 'plugins[1].as "acme.x" is used twice'],
    ['an instance id that repeats the name of an earlier entry', [{ name: 'acme.a' }, { name: 'acme.a', as: 'acme.a' }], 'plugins[1]', 'plugins[1].as "acme.a" is used twice'],
    ['an instance id that is not dotted', [{ name: 'acme.a', as: 'book' }], 'plugins[0]', 'plugins[0].as must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['an instance id that is not a string', [{ name: 'acme.a', as: 7 }], 'plugins[0]', 'plugins[0].as must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['an instance id that is a path', [{ name: 'acme.a', as: '../acme.x' }], 'plugins[0]', 'plugins[0].as must be a plugin name: dotted lowercase words such as acme.house-style'],
    ['an instance id of 65 characters', [{ name: 'acme.a', as: `acme.${'x'.repeat(60)}` }], 'plugins[0]', `plugins[0].as "acme.${'x'.repeat(60)}" is 65 characters; an instance id is at most 64`],
    ['a name of 65 characters that is the id, with no "as"', [{ name: `acme.${'x'.repeat(60)}` }], 'plugins[0]', `plugins[0].name "acme.${'x'.repeat(60)}" is 65 characters; an instance id is at most 64, so give the entry a shorter "as"`],
    ['an instance id that is the name of another plugin',[{ name: 'acme.a', as: 'acme.b' }, { name: 'acme.b' }], 'plugins[0]', 'plugins[0].as "acme.b" is the name of another plugin in the list'],
    ['an instance id that is the name of a plugin listed later', [{ name: 'acme.b' }, { name: 'acme.a', as: 'acme.b' }], 'plugins[1]', 'plugins[1].as "acme.b" is the name of another plugin in the list'],
    ['an instance id that is a token output file', [{ name: 'acme.a', as: 'tokens.json' }], 'plugins[0]', 'plugins[0].as "tokens.json" is a file blazon writes in tokensOutDir, where the instance\'s output folder would go. Give it another "as"'],
    ['an instance id that is the css token output', [{ name: 'acme.a', as: 'theme.css' }], 'plugins[0]', 'plugins[0].as "theme.css" is a file blazon writes in tokensOutDir, where the instance\'s output folder would go. Give it another "as"'],
    ['an instance id that is a context token output', [{ name: 'acme.a', as: 'tokens.theme.dark.json' }], 'plugins[0]', 'plugins[0].as "tokens.theme.dark.json" is a file blazon writes in tokensOutDir, where the instance\'s output folder would go. Give it another "as"'],
    ['an env that is not a list', [{ name: 'acme.a', env: 'HOME' }], 'plugins[0]', 'plugins[0].env must be a list of variable names (capital letters, digits and underscores), the ones this plugin may be given'],
    ['an env with a name that is not a variable name', [{ name: 'acme.a', env: ['home'] }], 'plugins[0]', 'plugins[0].env must be a list of variable names (capital letters, digits and underscores), the ones this plugin may be given'],
    ['options that are not an object', [{ name: 'acme.a', options: ['x'] }], 'plugins[0]', 'plugins[0].options must be an object'],
    ['a command', [{ name: 'acme.a', command: ['python3', 'x.py'] }], 'plugins[0]', 'plugins[0] has "command", which does not belong in the config: a plugin is found by its name or pinned with `blazon plugin pin`, and the config holds no path and no command'],
    ['a path', [{ name: 'acme.a', path: './plugins/a' }], 'plugins[0]', 'plugins[0] has "path", which does not belong in the config: a plugin is found by its name or pinned with `blazon plugin pin`, and the config holds no path and no command'],
    ['a digest', [{ name: 'acme.a', digest: 'sha256:00' }], 'plugins[0]', 'plugins[0] has "digest", which does not belong in the config: a plugin is found by its name or pinned with `blazon plugin pin`, and the config holds no path and no command'],
    ['an unknown field', [{ name: 'acme.a', order: 1 }], 'plugins[0]', 'plugins[0] has unknown field "order"; known: name, as, options, env'],
  ])('refuses %s, as config-invalid on the place it is', async (_name, plugins, where, message) => {
    const found = await invalid(plugins);
    expect(found.map((f) => [f.path, f.message])).toEqual([[where, message]]);
    expect(found[0]!.severity).toBe('error');
  });

  describe('an entry that is not an object', () => {
    // The plugins are the folders of plugins/: the message must list every one, sorted, and the code reads the lock instead
    const SHIPPED = new RegExp(literal(`blazon ships: ${shippedPluginNames().join(', ')}`));

    it('says the entry is an object with a name, and lists the plugins blazon ships', async () => {
      const [found] = await invalid(['nope']);
      expect(found!.path).toBe('plugins[0]');
      expect(found!.message).toContain('plugins[0] must be an object {"name": "<plugin>"}, not a string');
      expect(found!.message).toMatch(SHIPPED);
      expect(found!.message).not.toContain('did you mean');
    });

    it('offers the shipped plugin a string is close to, written as the object it should be', async () => {
      const [found] = await invalid(['blazon.favicns']);
      expect(found!.message).toContain('did you mean {"name": "blazon.favicons"}?');
    });

    it('says what a non-string is, too', async () => {
      expect((await invalid([42]))[0]!.message).toContain('not a number');
      expect((await invalid([null]))[0]!.message).toContain('not null');
      expect((await invalid([['x']]))[0]!.message).toContain('not a list');
    });
  });

  it('leaves out the entry that is wrong and keeps the rest', async () => {
    const data = await compile([{ name: 'acme.a' }, { name: 'Bad' }, { name: 'acme.b', options: { x: 1 } }]);
    expect(data.findings.filter((f) => f.code === 'config-invalid')).toHaveLength(1);
  });
});
