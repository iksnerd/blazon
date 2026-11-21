// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { directiveFindings } from '../../../src/core/docs/directives.js';
import { describeLogo } from '../../../src/core/read/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { readBrand as socialCards } from '../../../src/shipped/social-cards/brand.js';
import { readBrand as pressKit } from '../../../src/shipped/press-kit/brand.js';
import { readBrand as officeTemplate } from '../../../src/shipped/office-template/brand.js';
import { readBrand as logoKit } from '../../../src/shipped/logo-kit/brand.js';
import { readBrand as logoGeometry } from '../../../src/shipped/logo-geometry/brand.js';
import { readBrand as deckBrand } from '../../../src/shipped/brand-deck/brand.js';
import { logoSlides } from '../../../src/shipped/brand-deck/plan/logo.js';
import { LogoPartner } from '../../../src/viewer/components/blazon/logo-rules';
import type { Asset, AssetCatalog, BlazonData, DocItem } from '../../../src/types/index.js';
import { logoConfig } from '../../support/helpers.js';
import { tempProject } from '../../support/project';

// An asset id with several files is one asset (RFC 0001 section 7), and every reader that needs one file for an id chooses it by one
// rule (section 12), so the same file is chosen whatever order brand.json lists the files in. Each reader asks for the formats it
// can use, and a reader with no preference takes the default order: svg, png, webp, jpg, gif, then other formats by name.

const orders = <T,>(items: readonly T[]): T[][] =>
  items.length <= 1 ? [[...items]] : items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));

const SETS = {
  'png and svg': ['png', 'svg'],
  'svg and webp': ['svg', 'webp'],
  'png, svg and webp': ['png', 'svg', 'webp'],
  'png and webp': ['png', 'webp'],
};

/** What brand.json holds for `logos/mark` in these formats, in this order. */
const entries = (formats: readonly string[]) =>
  formats.map((format) => ({ id: 'logos/mark', name: 'mark', category: 'logos', file: `brand-assets/logos/mark.${format}`, format, mediaType: `image/${format}`, bytes: 40, width: 10, height: 10, meta: { lockup: 'mark' } }));
const brandOf = (formats: readonly string[]) => ({ format: 'blazon-brand', version: 2, assets: entries(formats) });

/** For every set and every order of its files, the format a reader chose, which must be the same for every order of one set. */
function chosen(read: (brand: unknown) => { assets: Map<string, { format: string }> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [label, formats] of Object.entries(SETS)) {
    const picks = new Set(orders(formats).map((order) => read(brandOf(order)).assets.get('logos/mark')!.format));
    expect([...picks], `${label}: one choice for every order`).toHaveLength(1);
    result[label] = [...picks][0]!;
  }
  return result;
}

describe('every reader of brand.json chooses one file for an id with several', () => {
  const DEFAULT = { 'png and svg': 'svg', 'svg and webp': 'svg', 'png, svg and webp': 'svg', 'png and webp': 'png' };

  it('blazon.social-cards, blazon.press-kit and blazon.logo-kit take the default order', () => {
    expect(chosen(socialCards as never)).toEqual(DEFAULT);
    expect(chosen(pressKit as never)).toEqual(DEFAULT);
    expect(chosen(logoKit as never)).toEqual(DEFAULT);
  });

  it('blazon.office-template asks for svg, png, jpg, gif: a webp is kept only when the id has nothing else', () => {
    expect(chosen(officeTemplate as never)).toEqual(DEFAULT);
    const webpOnly = officeTemplate(brandOf(['webp'])) as unknown as { assets: Map<string, { format: string }> };
    expect(webpOnly.assets.get('logos/mark')!.format).toBe('webp');
  });

  it('blazon.logo-geometry asks for svg, png, webp: an avif is kept only when the id has nothing else', () => {
    expect(chosen(logoGeometry as never)).toEqual(DEFAULT);
    const both = (formats: string[]) => (logoGeometry(brandOf(formats)) as unknown as { assets: Map<string, { format: string }> }).assets.get('logos/mark')!.format;
    expect(both(['avif', 'png'])).toBe('png');
    expect(both(['png', 'avif'])).toBe('png');
    expect(both(['avif'])).toBe('avif');
  });

  it('blazon.brand-deck names a logo that another one is replaced by with the same title for every order', () => {
    // fabricated: the two entries carry different titles, which one id never does, so the choice shows
    const withTitles = (order: ('svg' | 'png')[]) => ({
      format: 'blazon-brand',
      version: 2,
      assets: [
        { id: 'logos/small', name: 'small', category: 'logos', file: 'brand-assets/logos/small.svg', format: 'svg', meta: { replacedBelow: { value: 20, unit: 'px', by: 'logos/mark' } } },
        ...order.map((format) => ({ id: 'logos/mark', name: 'mark', category: 'logos', file: `brand-assets/logos/mark.${format}`, format, meta: { title: `Mark as ${format}` } })),
      ],
    });
    const texts = ([['svg', 'png'], ['png', 'svg']] as const).map((order) => {
      const slides = logoSlides(deckBrand(withTitles([...order])));
      return JSON.stringify(slides.find((slide) => slide.file.endsWith('small.svg'))!.rules);
    });
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toContain('Mark as svg');
  });
});

/** A catalog whose records are in this order, with a sidecar rule on the svg only (a fabricated difference that shows the choice). */
const asset = (format: string, meta?: Asset['meta']): Asset => ({
  id: 'logos/mark',
  name: 'mark',
  category: 'logos',
  filePath: `logos/mark.${format}`,
  format: format as Asset['format'],
  mediaType: `image/${format}`,
  url: `brand-assets/logos/mark.${format}`,
  bytes: 1,
  width: 10,
  height: 10,
  ...(meta && { meta }),
});
const catalog = (assets: Asset[]): AssetCatalog => ({ logos: assets, icons: [], custom: {}, all: assets });
const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
const findings = (markdown: string, assets: Asset[]) => directiveFindings([doc(markdown)], { tokens: { items: [], groupMeta: [] }, assets: catalog(assets), hasLogo: true });

describe('the directives and the viewer', () => {
  it('a directive that needs a sidecar field reads it from the one file chosen, whatever the order', () => {
    for (const order of orders(['png', 'svg', 'webp'])) {
      const assets = order.map((format) => asset(format, format === 'svg' ? { initiative: { name: 'Acme Labs', mark: 'logos/mark', gap: { value: 4, unit: 'px' } } } : undefined));
      expect(findings('<!-- blazon:logo-initiative logos/mark -->', assets), order.join()).toEqual([]);
    }
  });

  it('a page that draws an id with needs-review counts the id once', () => {
    const flagged = (format: string) => asset(format, { review: { status: 'needs-review' } });
    for (const order of orders(['png', 'svg'])) {
      const found = findings('<!-- blazon:logo-partner logos/mark logos/mark -->', order.map(flagged)).filter((f) => f.code === 'page-review-pending');
      expect(found.map((f) => f.message), order.join()).toEqual(['Shows 1 asset still marked needs-review: logos/mark']);
    }
  });

  describe('the logo-partner preview', () => {
    afterEach(cleanup);
    it('draws the svg of the logo and the partner whatever order the files are in', () => {
      const partner = (format: string): Asset => ({ ...asset(format), id: 'partners/acme', name: 'acme', category: 'partners', filePath: `partners/acme.${format}`, url: `brand-assets/partners/acme.${format}` });
      const meta: Asset['meta'] = { partnership: { gap: { value: 8, unit: 'px' } } };
      for (const order of orders(['png', 'svg'])) {
        const all = [...order.map((format) => asset(format, meta)), ...order.map(partner)];
        const data = { assets: catalog(all) } as unknown as BlazonData;
        const { container } = render(<LogoPartner data={data} args={['logos/mark', 'partners/acme']} />);
        const hrefs = [...container.querySelectorAll('image')].map((image) => image.getAttribute('href') ?? '');
        expect(hrefs.map((href) => href.replace(/^.*brand-assets\//, '')), order.join()).toEqual(['logos/mark.svg', 'partners/acme.svg']);
        cleanup();
      }
    });
  });
});

describe('blazon logo (get_logo)', () => {
  it('lists an id in two formats once, with its files in the default order and the variant that names either', async () => {
    const root = tempProject({
      'assets/logos/mark.svg': '<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      'assets/logos/mark.json': { lockup: 'mark' },
    });
    fs.writeFileSync(path.join(root, 'assets/logos/mark.png'), Buffer.alloc(40, 1));
    const config = { ...logoConfig(root), logo: './assets/logos/mark.png' };
    const data = await compileBlazonData(config, root);
    const logo = describeLogo(data, config, root);
    expect(logo.assets).toEqual([{ id: 'logos/mark', files: ['assets/logos/mark.svg', 'assets/logos/mark.png'], variants: ['onLight'], rules: { lockup: 'mark' } }]);
    // brand.json keeps one entry for each file, with the same id
    expect(buildBrandExport(data, { ...DEFAULT_CONFIG }, root).assets.filter((a) => a.id === 'logos/mark')).toHaveLength(2);
  });
});
