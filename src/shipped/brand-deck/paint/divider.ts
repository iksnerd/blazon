import { BODY_PT, DIVIDER_FLOOR, DIVIDER_TOP_MAX, DIVIDER_TOP_OPEN, DIVIDER_TOP_STEP, GUIDE_BULLET, GUIDE_SOURCE_LEAD, MARGIN, NOTE_PT, type PageSlide } from '../plan/index.js';
import { Canvas, clip } from './canvas.js';
import { type Rgba } from './style.js';

/**
 * A page of the brand book: its title and its description on the dark ground, and below them what its categories' guidelines leave open,
 * as far as there is room above the footer. A page with lists of what is left open starts higher, as much higher as it takes (up to
 * DIVIDER_TOP_MAX) for none of them to be cut: the slide is measured first, without drawing, then drawn.
 */
export function drawDivider(p: Canvas, slide: PageSlide): void {
  let top = slide.open.length > 0 ? DIVIDER_TOP_OPEN : 300;
  if (slide.open.length > 0) {
    p.dry = true;
    try {
      while (top < DIVIDER_TOP_MAX && dividerBody(p, slide, top)) top += DIVIDER_TOP_STEP;
    } finally {
      p.dry = false;
    }
  }
  p.begin(null, true);
  dividerBody(p, slide, top);
  p.end();
}

/** A divider's title, description and lists with the title at `top`; true if a list was cut short. */
function dividerBody(p: Canvas, slide: PageSlide, top: number): boolean {
  p.cut = false;
  let y = p.paragraph(MARGIN, top, slide.title, 760, { font: 'Title', size: 44, color: p.fg, leading: 52, maxLines: 3 });
  if (slide.description) y = p.paragraph(MARGIN, y - 10, slide.description, 700, { size: 18, color: p.fg, maxLines: 5 });
  y -= 28;
  for (const [position, category] of slide.open.entries()) {
    if (y < DIVIDER_FLOOR + 60) {
      p.text(MARGIN, y, `+${slide.open.length - position} more`, 'Helvetica', BODY_PT, { color: p.fg });
      p.cut = true;
      break;
    }
    p.text(MARGIN, y, `Not specified: ${category.title}`, 'Helvetica-Bold', BODY_PT, { color: p.fg });
    // The source is wrapped to the list's width, and the list stops above the lines after its first
    const source = category.source ? p.lines(category.source, 'Helvetica', NOTE_PT, 700) : [];
    const extra = Math.max(source.length - 1, 0) * GUIDE_SOURCE_LEAD;
    y = drawBullets(p, MARGIN, y - 8, category.items, 700, DIVIDER_FLOOR + extra, BODY_PT, p.fg);
    source.forEach((line, n) => p.text(MARGIN, y - 10 - n * GUIDE_SOURCE_LEAD, line, 'Helvetica', NOTE_PT, { color: p.fg }));
    y -= (source.length > 0 ? 14 + extra : 0) + 18;
  }
  return p.cut;
}

/** A list from y downward that stops above `floor` and says how many items it left out; returns the y below it. */
function drawBullets(p: Canvas, x: number, y: number, items: string[], width: number, floor: number, size = BODY_PT, color?: Rgba): number {
  const leading = size * 1.3;
  let at = y;
  for (const [index, item] of items.entries()) {
    const all = p.lines(item, 'Helvetica', size, width - GUIDE_BULLET);
    const lines = all.slice(0, 3);
    const rest = items.length - index;
    if (at - lines.length * leading < floor + (rest > 1 ? leading : 0)) {
      p.text(x, at - size, `+${rest} more`, 'Helvetica', size, { color: color ?? p.colors.muted });
      p.cut = true;
      return at - leading;
    }
    p.bullet(x + GUIDE_BULLET, at - size, clip(all, 3), 'Helvetica', size, { color, marker: color ?? p.colors.muted, leading });
    at -= lines.length * leading + 3;
  }
  return at;
}
