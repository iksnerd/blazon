import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { compileBlazonData, emitTokenOutputs } from '../../src/core/index.js';
import { projectInputs } from '../../src/core/inputs.js';
import { writeProject, TEST_CONFIG } from '../support/helpers.js';

// A token file the brand reads can sit in the folder the code outputs go to. The writer does not write over it, and does not delete it
// as if it were a stale output of its own, whatever its name looks like.

const BASE = { color: { $type: 'color', ink: { $value: '#000000' }, paper: { $value: '#ffffff' } } };
const DARK = { color: { paper: { $value: '#111111' } } };

/** A resolver with a `theme` modifier whose `dark` context reads `source`. */
const project = (source: string) =>
  writeProject({
    'blazon.resolver.json': {
      version: '2025.10',
      sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
      modifiers: { theme: { contexts: { light: [], dark: [{ $ref: source }] }, default: 'light' } },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    },
    'tokens/base.json': BASE,
    [source]: DARK,
  });

describe('emitTokenOutputs and the files the brand reads', () => {
  it('leaves a source that looks like a stale output of its own, which an earlier blazon would have deleted', async () => {
    const root = project('extras/tokens.mode.dark.json');
    const config = { ...TEST_CONFIG, tokensOutDir: './extras' };
    await emitTokenOutputs(await compileBlazonData(config, root), config, root);
    expect(fs.existsSync(path.join(root, 'extras/tokens.mode.dark.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'extras/tokens.theme.dark.json'))).toBe(true);
  });

  it('still removes the stale output of its own that is not a source', async () => {
    const root = project('extras/tokens.mode.dark.json');
    fs.writeFileSync(path.join(root, 'extras/tokens.old.gone.json'), '{}');
    fs.writeFileSync(path.join(root, 'extras/tokens.mode.dark.json'), JSON.stringify(DARK));
    const config = { ...TEST_CONFIG, tokensOutDir: './extras' };
    await emitTokenOutputs(await compileBlazonData(config, root), config, root);
    expect(fs.existsSync(path.join(root, 'extras/tokens.old.gone.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'extras/tokens.mode.dark.json'))).toBe(true);
  });

  it('refuses to write over a source that has the name of an output, and writes none of the others', async () => {
    const root = project('extras/tokens.theme.dark.json');
    const config = { ...TEST_CONFIG, tokensOutDir: './extras' };
    const data = await compileBlazonData(config, root);
    await expect(emitTokenOutputs(data, config, root)).rejects.toThrow(/tokens\.theme\.dark\.json[^]*written over a resolver source[^]*extras\/tokens\.theme\.dark\.json/);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'extras/tokens.theme.dark.json'), 'utf-8'))).toEqual(DARK);
    expect(fs.existsSync(path.join(root, 'extras/theme.css'))).toBe(false);
  });
});

describe('the inventory of what a compile reads', () => {
  it('has every kind of path the config and the resolver name', () => {
    const root = project('extras/dark.json');
    fs.mkdirSync(path.join(root, 'shared/photos'), { recursive: true });
    const config = {
      ...DEFAULT_CONFIG,
      logo: { onLight: 'brand/light.svg', onDark: 'brand/dark.svg' },
      fonts: ['https://fonts.example/css', { family: 'Kinto', file: 'fonts/kinto.woff2' }],
      iconSets: [{ name: 'lucide', package: 'lucide-static', categories: 'icon-meta/categories.json' }],
      assets: { photos: { dir: './shared/photos' } },
    } as typeof DEFAULT_CONFIG;
    // The temporary folder is behind a link on some systems, and a category folder is reported by where it really is
    const real = fs.realpathSync(root);
    const rel = (p: string) => {
      const there = fs.existsSync(p) ? fs.realpathSync(p) : path.join(real, path.relative(root, p));
      return path.relative(real, there).split(path.sep).join('/');
    };
    const found = new Map(projectInputs(config, root).map((i) => [rel(i.path) || '.', i.name]));
    expect([...found.keys()].sort()).toEqual(
      [
        '.',
        'assets',
        'brand/dark.svg',
        'brand/light.svg',
        'docs',
        'extras/dark.json',
        'blazon.resolver.json',
        'fonts/kinto.woff2',
        'icon-meta/categories.json',
        'shared/photos',
        'tokens',
        'tokens/base.json',
      ].sort(),
    );
    expect(found.get('extras/dark.json')).toBe('a resolver source');
    expect(found.get('icon-meta/categories.json')).toMatch(/categories file of the "lucide" icon set/);
  });
});
