import {
  BODY_BOTTOM,
  familyDrop,
  FONTS_JOIN,
  FONTS_NAME,
  FONTS_PT,
  FONTS_TOP,
  FONTS_WIDTH,
  type FontsSlide,
  MARGIN,
  number,
  SAMPLE_MIN_PT,
  samplePt,
  TYPE_ROWS_TOP,
  type TypeScaleSlide,
} from '../plan/index.js';
import { Canvas } from './canvas.js';
import { PH, PW } from './style.js';

export function drawFonts(p: Canvas, slide: FontsSlide): void {
  p.begin(slide.title);
  // The plan has put as many families on the slide as its room holds (plan/typography.ts): where each is drawn is the same sum
  let y = FONTS_TOP;
  for (const family of slide.families) {
    // Each family in itself where there is a file for it, and in bold Helvetica where there is not
    p.text(MARGIN, y, family.name, p.own(family.name, 400) ?? '!Helvetica-Bold', 38, { color: p.fg });
    let at = y - FONTS_NAME;
    const say = (text: string, font: 'Helvetica' | 'Helvetica-Oblique') => {
      at = p.paragraph(MARGIN, at, text, FONTS_WIDTH, { font, size: FONTS_PT, color: p.colors.muted, maxLines: 2 }) - FONTS_JOIN;
    };
    say(family.stack, 'Helvetica');
    if (family.description) say(family.description, 'Helvetica');
    if (family.web_font) say(family.web_font, 'Helvetica-Oblique');
    y -= familyDrop(family, p.wrap)[0];
  }
  p.note(MARGIN, BODY_BOTTOM, p.r.table.note(slide.families.map((family) => family.name)), PW - 2 * MARGIN);
  p.end();
}

export function drawTypeScale(p: Canvas, slide: TypeScaleSlide): void {
  p.begin(slide.title);
  let y = PH - TYPE_ROWS_TOP;
  for (const style of slide.styles) {
    const pt = samplePt(style.size_px);
    const bold = (typeof style.weight === 'number' && style.weight >= 600) || style.weight === 'bold' || style.weight === 'semibold';
    const own = p.own(style.family, style.weight);
    p.text(MARGIN, y - pt * 0.8, style.name, own ?? (bold ? '!Helvetica-Bold' : '!Helvetica'), pt, { color: p.fg });
    const facts = [style.family || 'no family', style.size_px !== null ? `${number(style.size_px)}px` : 'no size'];
    if (style.line_height !== null) facts[1] += ` / ${String(style.line_height)}`;
    if (style.weight !== null) facts.push(`weight ${String(style.weight)}`);
    if (style.letter_spacing) facts.push(`tracking ${style.letter_spacing}`);
    p.text(PW - MARGIN, y - pt * 0.8, facts.join(', '), 'Helvetica', 10, { color: p.colors.muted, align: 'right' });
    y -= pt * 1.3 + 22;
  }
  const families = [...new Set(slide.styles.flatMap((style) => (style.family ? [style.family] : [])))];
  const note = families.some((family) => p.r.table.has(family))
    ? `Samples are drawn at half their pixel size, ${SAMPLE_MIN_PT}pt at least; the real size is on each line. ${p.r.table.note(families)}`
    : `Samples are drawn at half their pixel size, ${SAMPLE_MIN_PT}pt at least, and set in Helvetica; the typeface and the real size are on each line.`;
  p.note(MARGIN, BODY_BOTTOM, note, PW - 2 * MARGIN);
  p.end();
}
