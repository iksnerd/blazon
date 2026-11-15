import path from 'node:path';
import {
  BODY_BOTTOM,
  BODY_PT,
  FAVICON_HEAD_LINE_PT,
  FAVICON_HEAD_PT,
  FAVICON_HEAD_WIDTH,
  FAVICON_ROW_PT,
  type FaviconFilesSlide,
  type FaviconHeadSlide,
  type FaviconViewSlide,
  humanize,
  MARGIN,
  parseHex,
} from '../plan/index.js';
import { Canvas } from './canvas.js';
import { PH, PW } from './style.js';

/** A view the favicons plugin drew: its image across the slide, and what it shows. */
export function drawFaviconView(p: Canvas, slide: FaviconViewSlide): void {
  p.begin(slide.title);
  const { draw, width: naturalW, height: naturalH } = p.image(slide.file, path.dirname(slide.base));
  const width = PW - 2 * MARGIN;
  const height = (width * (slide.height || naturalH)) / (slide.width || naturalW);
  const top = PH - 110;
  draw(MARGIN, top - height, width, height);
  p.rect(MARGIN, top - height, width, height, { stroke: p.colors.border });
  if (slide.note) p.paragraph(MARGIN, top - height - 24, slide.note, width, { size: BODY_PT, color: p.colors.muted, maxLines: 4 });
  p.end();
}

/** The table of the set's files: file, size, use; the head snippet and the set's colours under it when the plan put them there. */
export function drawFaviconFiles(p: Canvas, slide: FaviconFilesSlide): void {
  p.begin(slide.title);
  const columns = [MARGIN, MARGIN + 230, MARGIN + 380] as const;
  const right = PW - MARGIN;
  const pitch = slide.head ? FAVICON_ROW_PT : 22;
  let y = PH - 120;
  ['File', 'Size', 'Use'].forEach((label, index) => p.text(columns[index]!, y, label, 'Helvetica-Bold', 11, { color: p.fg }));
  p.line(MARGIN, y - 6, right);
  for (const row of slide.rows) {
    y -= pitch;
    if (y < BODY_BOTTOM) break;
    p.text(columns[0], y, p.fit(row.file, 'Helvetica', 10, 220), 'Helvetica', 10, { color: p.fg });
    p.text(columns[1], y, p.fit(row.size, 'Helvetica', 10, 140), 'Helvetica', 10, { color: p.colors.muted });
    p.text(columns[2], y, p.fit(row.use, 'Helvetica', 10, right - columns[2]), 'Helvetica', 10, { color: p.colors.muted });
  }
  if (slide.head) {
    y -= 22;
    p.text(MARGIN, y, 'Head snippet', 'Helvetica-Bold', 11, { color: p.fg });
    drawFaviconSwatches(p, slide.colors ?? {}, { x: MARGIN + 430, top: y + 4, columns: 2, pitch: 42 });
    for (const line of slide.head) {
      y -= FAVICON_HEAD_LINE_PT;
      p.text(MARGIN, y, p.fit(line, '!Courier', FAVICON_HEAD_PT, FAVICON_HEAD_WIDTH), '!Courier', FAVICON_HEAD_PT, { color: p.fg });
    }
  }
  p.end();
}

/** The tags to paste into <head>, and the colors the set is drawn in. */
export function drawFaviconHead(p: Canvas, slide: FaviconHeadSlide): void {
  p.begin(slide.title);
  let y = PH - 124;
  for (const line of slide.head) {
    p.text(MARGIN, y, p.fit(line, '!Courier', 11, PW - 2 * MARGIN), '!Courier', 11, { color: p.fg });
    y -= 18;
  }
  drawFaviconSwatches(p, slide.colors);
  p.end();
}

/** The set's colours as small swatches: in one row near the foot, or, given a `grid`, in rows of `columns` from `top` down. */
function drawFaviconSwatches(p: Canvas, colors: Record<string, string>, grid?: { x: number; top: number; columns: number; pitch: number }): void {
  let index = 0;
  for (const label of ['ground', 'ink', 'favicon', 'themeColor']) {
    const rgb = parseHex(colors[label] ?? '');
    if (!rgb) continue;
    const x = (grid?.x ?? MARGIN) + (grid ? index % grid.columns : index) * 150;
    const y = grid ? grid.top - 28 - Math.floor(index / grid.columns) * grid.pitch : 80;
    p.rect(x, y, 28, 28, { fill: [rgb[0], rgb[1], rgb[2], 1], stroke: p.colors.border });
    p.text(x + 36, y + 18, humanize(label), 'Helvetica-Bold', 10, { color: p.fg });
    p.text(x + 36, y + 4, colors[label]!, 'Helvetica', 10, { color: p.colors.muted });
    index += 1;
  }
}
