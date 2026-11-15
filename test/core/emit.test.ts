import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileBlazonData, emitTokenOutputs } from '../../src/core/index.js';
import type { BlazonConfig } from '../../src/types/index.js';
import { writeProject, TEST_CONFIG } from '../support/helpers.js';

// A token build leaves the output folder holding what the tokens say now. A file an earlier run wrote for something the tokens no
// longer have (typography, a Tailwind theme, a context) would keep a consumer using definitions that are gone.

const TYPOGRAPHY = {
  font: { $type: 'fontFamily', body: { $value: ['Inter', 'sans-serif'] } },
  type: {
    $type: 'typography',
    h1: { $value: { fontFamily: '{font.body}', fontSize: { value: 64, unit: 'px' }, fontWeight: 600, letterSpacing: { value: 0, unit: 'px' }, lineHeight: 1.125 } },
  },
  color: { $type: 'color', ink: { $value: '#000000' } },
};
const NO_STYLE = { z: { $type: 'number', base: { $value: 1 } } };

const config = { ...TEST_CONFIG, tokensOutDir: 'out' } as BlazonConfig;
const emit = async (root: string) => emitTokenOutputs(await compileBlazonData(config, root), config, root);
const files = (root: string) => fs.readdirSync(path.join(root, 'out')).sort();

describe('emitTokenOutputs: files an earlier run wrote', () => {
  it('removes typography.css and tailwind.css when the tokens no longer ask for them', async () => {
    const root = writeProject({ 'tokens/a.json': TYPOGRAPHY });
    await emit(root);
    expect(files(root)).toEqual(expect.arrayContaining(['typography.css', 'tailwind.css', 'tailwind-reset.css']));

    fs.writeFileSync(path.join(root, 'tokens/a.json'), JSON.stringify(NO_STYLE));
    const again = await emit(root);
    expect(again.typographyPath).toBeUndefined();
    expect(again.tailwindPath).toBeUndefined();
    expect(again.tailwindResetPath).toBeUndefined();
    expect(files(root)).toEqual(['theme.css', 'tokens.json', 'tokens.ts']);
  });

  it('removes the document of a context that is gone, and keeps the ones that are left and everything it does not own', async () => {
    const resolver = (contexts: Record<string, unknown[]>) => ({
      version: '2025.10',
      sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
      modifiers: { locale: { contexts: { en: [], ...contexts }, default: 'en' } },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/locale' }],
    });
    const root = writeProject({
      'blazon.resolver.json': resolver({ ja: [{ $ref: 'tokens/ja.json' }], de: [{ $ref: 'tokens/de.json' }] }),
      'tokens/base.json': TYPOGRAPHY,
      'tokens/ja.json': { font: { body: { $value: ['Kinto', 'sans-serif'] } } },
      'tokens/de.json': { font: { body: { $value: ['Fira', 'sans-serif'] } } },
      'out/blazon.social-cards/launch.png': 'not ours',
      'out/notes.json': 'not ours',
    });
    await emit(root);
    expect(files(root)).toEqual(expect.arrayContaining(['tokens.locale.de.json', 'tokens.locale.ja.json']));

    fs.writeFileSync(path.join(root, 'blazon.resolver.json'), JSON.stringify(resolver({ ja: [{ $ref: 'tokens/ja.json' }] })));
    await emit(root);
    expect(files(root)).toContain('tokens.locale.ja.json');
    expect(files(root)).not.toContain('tokens.locale.de.json');
    expect(files(root)).toEqual(expect.arrayContaining(['blazon.social-cards', 'notes.json']));
  });
});
