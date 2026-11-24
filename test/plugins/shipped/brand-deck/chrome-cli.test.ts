import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { tempDir } from '../../../support/project';
import { readBrand } from '../../../../src/shipped/brand-deck/brand.js';
import { plan } from '../../../../src/shipped/brand-deck/plan/index.js';
import { CHROME, POPPLER, browser, pages, plugin, world } from './helpers.js';

describe.skipIf(!CHROME || !POPPLER)('the deck plugin, in a real browser', () => {
  describe('the command line', () => {
    const cli = (w: ReturnType<typeof world>, args: string[], env: Record<string, string> = browser) => {
      const dir = tempDir('blazon-deck-cli-');
      fs.cpSync(w.siteDir, dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(w.brand));
      return { dir, ran: plugin('', env, [path.join(dir, 'brand.json'), ...args]) };
    };

    it('writes a PDF beside brand.json and says how many slides', () => {
      const { dir, ran } = cli(world(), ['-o', path.join(tempDir('blazon-deck-cli-out-'), 'deck.pdf')]);
      expect(ran.status, ran.out + ran.err).toBe(0);
      expect(ran.out).toMatch(/^wrote .*deck\.pdf \(\d+ slides\)\n$/);
      expect(fs.readdirSync(dir)).not.toContain('acme-brand-deck.pdf');
    }, 120_000);

    it('exits 2 for a file that is not a blazon brand, and 1 naming a logo that is missing, writing nothing', () => {
      const out = path.join(tempDir('blazon-deck-cli-out-'), 'deck.pdf');
      const dir = tempDir('blazon-deck-cli-bad-');
      fs.writeFileSync(path.join(dir, 'other.json'), '{"format":"something-else","version":1}');
      expect(plugin('', browser, [path.join(dir, 'other.json'), '-o', out]).status).toBe(2);
      fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(world().brand));
      const missing = plugin('', browser, [path.join(dir, 'brand.json'), '-o', out]);
      expect(missing.status).toBe(1);
      expect(missing.err).toContain('brand-assets/logos/onlight.svg');
      expect(fs.existsSync(out)).toBe(false);
      expect(plugin('', browser, ['-o', out]).status).toBe(2);
    }, 120_000);

    it('leaves out what --skip names, and warns about a name that is none', async () => {
      const w = world();
      const out = path.join(tempDir('blazon-deck-cli-out-'), 'deck.pdf');
      const { ran } = cli(w, ['--skip', 'logos', '--skip', 'nope', '-o', out]);
      expect(ran.status, ran.out + ran.err).toBe(0);
      expect(ran.err).toContain('"nope" is no asset category of this brand');
      expect((await pages(out)).length).toBe(plan(readBrand(w.brand), null, () => ['x'], ['logos']).length);
    }, 120_000);
  });
});
