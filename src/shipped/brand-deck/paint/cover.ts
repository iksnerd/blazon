import { CONTENTS_LARGE, CONTENTS_SMALL_PT, CONTENTS_SMALL_ROWS, type ContentsSlide, type CoverSlide, MARGIN } from '../plan/index.js';
import { Canvas } from './canvas.js';
import { PH, PW } from './style.js';

export function drawCover(p: Canvas, slide: CoverSlide): void {
  const { logo } = slide;
  const dark = logo?.background === 'dark';
  p.begin(null, dark);
  p.rect(0, 0, 18, PH, { fill: p.colors.accent });
  if (logo) {
    const { draw, width, height } = p.image(logo.file);
    const scale = Math.min(220 / width, 56 / height);
    draw(MARGIN + 8, PH - 64 - height * scale, width * scale, height * scale);
  }
  const y = p.paragraph(MARGIN + 8, 300, slide.title, 760, { font: 'Title', size: 54, color: p.fg, leading: 62, maxLines: 3 });
  if (slide.subtitle) p.paragraph(MARGIN + 8, y - 12, slide.subtitle, 640, { size: 20, color: dark ? p.fg : p.colors.muted, maxLines: 4 });
  p.end();
}

/** A few parts are drawn large on one line each; many are drawn smaller in columns, so every part is on the slide. */
export function drawContents(p: Canvas, slide: ContentsSlide): void {
  p.begin(slide.title);
  const { items } = slide;
  const many = items.length > CONTENTS_LARGE;
  const [size, step, rows] = many ? [CONTENTS_SMALL_PT, 34, CONTENTS_SMALL_ROWS] : [24, 52, items.length || 1];
  const columns = items.length > 0 ? Math.ceil(items.length / rows) : 1;
  const gap = 28;
  const width = (PW - 2 * MARGIN - gap * (columns - 1)) / columns;
  items.forEach((item, index) => {
    const x = MARGIN + Math.floor(index / rows) * (width + gap);
    const y = 360 - (index % rows) * step;
    p.text(x, y, p.fit(item.title, 'Helvetica-Bold', size, width - 44), 'Helvetica-Bold', size, { color: p.fg });
    p.text(x + width, y, String(item.page), 'Helvetica', size, { color: p.colors.muted, align: 'right' });
    p.line(x, y - 10, x + width);
  });
  p.end();
}
