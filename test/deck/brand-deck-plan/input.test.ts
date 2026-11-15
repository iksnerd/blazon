import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { readBrand } from '../../../src/shipped/brand-deck/brand.js';
import { DeckError, readFavicons } from '../../../src/shipped/brand-deck/favicons.js';
import { brand, logoAsset, type J } from './helpers.js';

describe('reading favicons.json', () => {
  const folder = (content: unknown): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-favicons-test-'));
    if (content !== null) fs.writeFileSync(path.join(dir, 'favicons.json'), typeof content === 'string' ? content : JSON.stringify(content));
    return dir;
  };
  const GOOD: J = { format: 'blazon-favicons', version: 1, symbol: 'logos/mark', views: [{ id: 'tabs', title: 'T', file: 'favicon-tabs.png', width: 2400, height: 680 }] };
  const withMark = readBrand(brand([], { assets: [logoAsset('mark', undefined, 'svg')] }));
  const none = readBrand(brand());

  it('a folder with no favicons.json is null', () => {
    expect(readFavicons(folder(null), none)).toBeNull();
  });

  it('adds the folder it read from', () => {
    const dir = folder(GOOD);
    expect(readFavicons(dir, withMark)!.folder).toBe(dir);
  });

  it('a file that is not favicons.json is an error', () => {
    for (const content of ['{ nope', { format: 'other', version: 1 }, { ...GOOD, version: 2 }, '[]']) {
      expect(() => readFavicons(folder(content), none), JSON.stringify(content)).toThrow(DeckError);
    }
  });

  it('an error names the file', () => {
    const dir = folder({ ...GOOD, version: 2 });
    expect(() => readFavicons(dir, none)).toThrow(path.join(dir, 'favicons.json'));
    expect(() => readFavicons(dir, none)).toThrow('is not a favicons.json this deck reads');
  });

  it('a view outside the folder is an error', () => {
    for (const name of ['../x.png', '/etc/passwd', 'a/b.png']) {
      const bad = { ...GOOD, views: [{ id: 'tabs', title: 'T', file: name }] };
      expect(() => readFavicons(folder(bad), withMark), name).toThrow(DeckError);
    }
    expect(() => readFavicons(folder({ ...GOOD, views: [{ ...GOOD.views[0], file: '../secret.png' }] }), withMark)).toThrow('names a file outside its own folder');
  });

  it('a view that is not a complete view is an error, not a crash', () => {
    const full = GOOD.views[0];
    const badViews: unknown[] = [
      { id: 'tabs', file: 'a.png', width: 1, height: 1 }, // no title
      { title: 'T', file: 'a.png', width: 1, height: 1 }, // no id
      { id: 'tabs', title: 'T', file: 'a.png', height: 1 }, // no width
      { ...full, height: 'tall' },
      { ...full, width: 0 },
      { ...full, width: true },
      { ...full, file: '' },
      { ...full, file: '..' },
      { ...full, file: '.' },
      { ...full, title: 7 },
      'tabs',
    ];
    for (const bad of badViews) expect(() => readFavicons(folder({ ...GOOD, views: [bad] }), withMark), JSON.stringify(bad)).toThrow(DeckError);
    expect(() => readFavicons(folder({ ...GOOD, views: { id: 'tabs' } }), withMark)).toThrow(DeckError);
  });

  it('the other parts must have the shape the slides read', () => {
    const bad: J[] = [
      { head: 5 },
      { head: ['<link>'] },
      { colors: 'blue' },
      { colors: [] },
      { adaptive: 'wide' },
      { adaptive: { symbolReach: 'far', safeRadius: 0.3 } },
      { adaptive: { symbolReach: 0.2 } },
      { files: 'favicon.svg' },
      { files: ['favicon.svg'] },
      { files: [{ file: 'a.svg', size: '32' }] },
    ];
    for (const extra of bad) expect(() => readFavicons(folder({ ...GOOD, ...extra }), withMark), JSON.stringify(extra)).toThrow(DeckError);
  });

  it('a complete file is still read', () => {
    const good = {
      ...GOOD,
      head: '<link rel="icon" href="/favicon.svg">\n',
      colors: { ground: '#3F73F8' },
      adaptive: { symbolReach: 0.2, safeRadius: 0.3056 },
      files: [{ file: 'favicon.svg', size: 'vector', use: 'Browser tab' }],
    };
    expect(readFavicons(folder(good), withMark)).not.toBeNull();
  });

  it('a set for a symbol the brand does not have is left out, and said', () => {
    const said: string[] = [];
    expect(readFavicons(folder(GOOD), none, (message) => said.push(message))).toBeNull();
    expect(said[0]).toContain('favicons not drawn');
  });
});

describe('reading the brand', () => {
  it('refuses what is not a blazon brand, and a version it does not know, naming the reason', () => {
    expect(() => readBrand({ format: 'something-else', version: 1 }, 'x.json')).toThrow("x.json is not a blazon brand: its format is 'something-else', not 'blazon-brand'");
    expect(() => readBrand({ format: 'blazon-brand', version: 99 })).toThrow('the brand in the request is version 99; this reader understands version 1');
    expect(() => readBrand(undefined)).toThrow('its format is None');
  });
});
