import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { requestFrom } from '../../../src/shipped/favicons/request.js';
import { planFor } from '../../../src/shipped/favicons/plan.js';
import { logoConfig } from '../../support/helpers.js';
import { tempProject } from '../../support/project';

// An id names a logical mark (RFC 0001 section 7), and one name in two formats is one id on two records. A plugin that takes "the"
// asset with an id takes the first of them, and the scanner reads files in name order, so the extension decides which one that is.
// The test marked `it.fails` pins that: it is green while the defect exists and turns red when a fix makes it pass, at which point
// drop the `.fails`.

const SVG = '<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
/** Not an image anyone could open: the scanner records a file by its extension and reads a size from its header only when it can. */
const RASTER = Buffer.alloc(40, 1);

/** A project whose `logos/mark` is `mark.svg` and a second file in another format, so only the second file's extension differs. */
async function markWith(extension: 'png' | 'webp') {
  const root = tempProject({ 'assets/logos/mark.svg': SVG, 'assets/logos/mark.json': { lockup: 'mark' } });
  fs.writeFileSync(path.join(root, `assets/logos/mark.${extension}`), RASTER);
  const brand = buildBrandExport(await compileBlazonData(logoConfig(root), root), { ...DEFAULT_CONFIG }, root);
  return { brand, order: brand.assets.filter((asset) => asset.id === 'logos/mark').map((asset) => asset.format) };
}

const planFrom = (brand: object) => planFor(requestFrom(JSON.stringify({ v: 1, type: 'check', options: { symbol: 'logos/mark', ground: '#1A1A1A' }, brand })));

describe('blazon.favicons with a symbol id that two files share', () => {
  it('sees the two files in the order of their extensions: png before svg, svg before webp', async () => {
    expect((await markWith('png')).order).toEqual(['png', 'svg']);
    expect((await markWith('webp')).order).toEqual(['svg', 'webp']);
  });

  it.fails('draws from the SVG whichever file sorts first', async () => {
    for (const extension of ['png', 'webp'] as const) {
      const { brand } = await markWith(extension);
      expect(planFrom(brand).symbolId, `mark.svg beside mark.${extension}`).toBe('logos/mark');
    }
  });
});
