import { describe, it, expect } from 'vitest';
import { tempDir } from '../../../support/project';
import { brand, color, type J } from '../../../deck/brand-deck-plan/helpers.js';
import { readBrand } from '../../../../src/shipped/brand-deck/brand.js';
import { Images } from '../../../../src/shipped/brand-deck/images.js';
import { FontTable } from '../../../../src/shipped/brand-deck/fonts.js';
import { Measure } from '../../../../src/shipped/brand-deck/measure.js';
import { Painter } from '../../../../src/shipped/brand-deck/paint/index.js';
import { plan } from '../../../../src/shipped/brand-deck/plan/index.js';
import { PH } from '../../../../src/shipped/brand-deck/paint/style.js';

// The palette slide with two groups: the plan decides how many groups share a slide, and paint decides the row height from what is left.
// Text is read back from the HTML by its baseline (y = PH - top - STRUT, STRUT being 200pt).

interface Text {
  y: number;
  size: number;
  text: string;
}

const LONG = 'A description long enough that it wraps onto a second line under its swatch';

function palette(print: J): { slides: number; texts: Text[] } {
  const tokens = [color('color.first.a', '#635DFF', print, undefined, LONG), color('color.second.b', '#101010', { cmyk: [1, 2, 3, 4], pms: '100 C' })];
  const parsed = readBrand(brand(tokens));
  const measure = new Measure();
  const painter = new Painter({ brand: parsed, measure, images: new Images(measure), table: FontTable.scan([]), siteDir: tempDir('blazon-deck-site-') });
  const slides = plan(parsed, null, painter.wrap).filter((slide) => slide.kind === 'colors');
  for (const slide of slides) painter.draw(slide);
  const html = painter.sections[painter.sections.length - 1]!;
  const texts = [...html.matchAll(/<div class="t" style="[^"]*?top:([\d.-]+)pt;[^"]*?font-size:([\d.]+)pt[^"]*"><i><\/i>([^<]*)<\/div>/g)].map((m) => ({
    y: PH - Number(m[1]) - 200,
    size: Number(m[2]),
    text: m[3]!,
  }));
  return { slides: slides.length, texts };
}

/** Points between the lowest line of the first group's swatch and the baseline of the second group's heading */
function gapToNextHeading(texts: Text[]): number {
  const heading = texts.find((t) => t.text === 'Second')!;
  const above = texts.filter((t) => t.y > heading.y && t.size <= 11 && t.y < 400 && t.text !== 'Second');
  return Math.min(...above.map((t) => t.y)) - heading.y;
}

describe('palette slide with two groups', () => {
  const three = palette({ cmyk: [84, 70, 0, 0], pms: '2726 C' });
  const four = palette({ cmyk: [84, 70, 0, 0], pms: '2726 C', ral: '5012' });

  it('both groups share one slide with three and with four lines of values', () => {
    expect(three.slides).toBe(1);
    expect(four.slides).toBe(1);
  });

  it('a fourth line of values leaves the next heading as far from the description as three lines do', () => {
    expect(gapToNextHeading(four.texts)).toBeGreaterThanOrEqual(gapToNextHeading(three.texts));
  });

  it('keeps every line of the slide above the footer', () => {
    const lowest = Math.min(...four.texts.filter((t) => t.y > 26 || t.size > 10).map((t) => t.y));
    expect(lowest).toBeGreaterThan(26 + 10);
  });
});
