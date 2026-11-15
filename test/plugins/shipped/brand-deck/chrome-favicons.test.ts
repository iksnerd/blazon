import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { tempDir } from '../../../support/project';
import { NAME } from '../../../../src/shipped/brand-deck/request.js';
import { CHROME, PIXEL, POPPLER, browser, pages, pdfOf, run, text, world } from './helpers.js';

describe.skipIf(!CHROME || !POPPLER)('the deck plugin, in a real browser', () => {
  describe('the favicons part', () => {
    const favicons = (edit: (data: any) => void = () => {}) => {
      const tokens = tempDir('blazon-deck-favicons-');
      const folder = path.join(tokens, 'blazon.favicons');
      fs.mkdirSync(folder);
      const data = {
        format: 'blazon-favicons',
        version: 1,
        symbol: 'logos/onlight',
        colors: { ground: '#3F73F8', ink: '#FFFFFF', favicon: '#3F73F8', themeColor: '#3F73F8' },
        views: [{ id: 'tabs', title: 'Browser tabs', file: 'favicon-tabs.png', width: 2400, height: 680 }],
        adaptive: { symbolReach: 0.2831, safeRadius: 0.3056 },
        files: [{ file: 'favicon.svg', size: 'vector', use: 'Tab icon' }],
        head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n',
      };
      edit(data);
      fs.writeFileSync(path.join(folder, 'favicons.json'), JSON.stringify(data));
      fs.copyFileSync(PIXEL, path.join(folder, 'favicon-tabs.png'));
      return { tokens, out: path.join(tokens, 'blazon.brand-deck') };
    };

    it("finds the plugin's folder beside its own out_dir, and ends the deck with the view and the files table with the head snippet under it", async () => {
      const w = world();
      const plain = run(w);
      const { out } = favicons();
      fs.mkdirSync(out);
      const { ran } = run(w, {}, browser, out);
      expect(ran.status, ran.out + ran.err).toBe(0);
      const all = text(pdfOf(out));
      const count = (await pages(pdfOf(out))).length;
      expect(count).toBe((await pages(pdfOf(plain.outDir))).length + 3);
      expect(all[count - 3]).toContain('The favicon and app-icon set');
      expect(all[count - 2]).toContain('Browser tabs');
      expect(all[count - 1]).toContain('Favicon files');
      expect(all[count - 1]).toContain('Tab icon');
      expect(all[count - 1]).toContain('rel="icon" href="/favicon.svg"');
      expect(all[1]).toContain('Favicons');
    }, 180_000);

    it('exits 2 naming the file, and writes nothing, when favicons.json is not one it reads', () => {
      const { out, tokens } = favicons((data) => (data.version = 2));
      fs.mkdirSync(out);
      const { ran } = run(world(), {}, browser, out);
      expect(ran.status).toBe(2);
      expect(ran.out.split('\n')[0]).toContain(`${path.join(tokens, 'blazon.favicons', 'favicons.json')} is not a favicons.json this deck reads`);
      expect(fs.readdirSync(out)).toEqual([]);
      const outside = favicons((data) => (data.views[0].file = '../secret.png'));
      fs.mkdirSync(outside.out);
      expect(run(world(), {}, browser, outside.out).ran.out).toContain('names a file outside its own folder');
    }, 120_000);

    it('says on standard error, and leaves the part out, when the set is for a symbol this brand does not have', async () => {
      const { out } = favicons((data) => (data.symbol = 'logos/other'));
      fs.mkdirSync(out);
      const { ran, findings } = run(world(), {}, browser, out);
      expect(ran.status, ran.out + ran.err).toBe(0);
      expect(ran.err).toContain('favicons not drawn');
      expect(findings.map((f) => [f.code, f.severity, f.path])).toEqual([[`${NAME}/favicons-not-drawn`, 'warning', 'blazon.favicons/favicons.json']]);
      expect(text(pdfOf(out)).some((page) => page.includes('Favicon files'))).toBe(false);
    }, 120_000);
  });
});
