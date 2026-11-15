import {
  BODY_BOTTOM,
  COLORS_LINE,
  type ColorsSlide,
  type GradientsSlide,
  MARGIN,
  NOTE_PT,
  number,
  parseHex,
  printLines,
  type Swatch,
  SWATCH_COLUMNS,
  TEXT_FLOOR_PT,
} from '../plan/index.js';
import { Canvas } from './canvas.js';
import { fmt, PH, PW } from './style.js';

/** The swatches of one or more groups. One group is drawn roomy, and a slide of several groups smaller, a heading each: the height of a row is what the slide has left divided by the rows it needs. */
export function drawColors(p: Canvas, slide: ColorsSlide): void {
  p.begin(slide.title);
  const { groups } = slide;
  let top = PH - 112;
  if (groups.length === 1 && slide.note) top = p.paragraph(MARGIN, top, slide.note, 760, { size: 12, color: p.colors.muted, maxLines: 2 }) - 6;
  const cols = Math.max(SWATCH_COLUMNS, ...groups.map((group) => group.swatches.length));
  const gap = 12;
  const width = (PW - 2 * MARGIN - gap * (cols - 1)) / cols;
  const heading = groups.length === 1 ? 0 : 26;
  const rowH = Math.min(190, (top - BODY_BOTTOM - heading * groups.length) / groups.length);
  const full = rowH >= 150;
  // What a row needs below its swatch: name and hex, the print values (each on a line when there is room, else together), and a description
  const lines = Math.max(...groups.flatMap((group) => group.swatches.map(printLines)));
  const below = 31 + (full ? Math.max(3, lines) * 14 + 28 : COLORS_LINE * lines) + 10;
  const swatchH = Math.min(78, Math.max(28, rowH - below));
  let y = top;
  for (const group of groups) {
    if (heading) {
      p.text(MARGIN, y - 14, group.title, 'Helvetica-Bold', 13, { color: p.fg });
      if (group.note) p.text(MARGIN + 150, y - 14, p.fit(group.note, 'Helvetica', NOTE_PT, PW - 2 * MARGIN - 150), 'Helvetica', NOTE_PT, { color: p.colors.muted });
      y -= heading;
    }
    group.swatches.forEach((swatch, index) => drawSwatch(p, MARGIN + index * (width + gap), y, width, swatchH, swatch, full));
    y -= rowH;
  }
  p.end();
}

/** One color: the swatch, then its name, hex and print values. `full` has room for each on a line and a description. */
function drawSwatch(p: Canvas, x: number, top: number, width: number, height: number, swatch: Swatch, full: boolean): void {
  const y = top - height;
  const rgb = parseHex(swatch.hex);
  p.rect(x, y, width, height, { stroke: p.colors.border, ...(rgb && { fill: rgb }) });
  p.text(x, y - 16, swatch.name, 'Helvetica-Bold', full ? 13 : 12, { color: p.fg });
  p.text(x, y - 31, swatch.hex, 'Helvetica', full ? 12 : 10, { color: p.fg });
  const lines: string[] = [];
  if (swatch.rgb) lines.push(`RGB ${swatch.rgb.join(' ')}`);
  if (swatch.cmyk && swatch.cmyk.length > 0) lines.push(`CMYK ${swatch.cmyk.join(' ')}`);
  if (swatch.pms) lines.push(`PMS ${swatch.pms}`);
  if (swatch.ral) lines.push(`RAL ${swatch.ral}`);
  const [size, step] = full ? [11, 14] : [TEXT_FLOOR_PT, COLORS_LINE];
  let lineY = y - 31;
  for (const line of lines) {
    lineY -= step;
    p.text(x, lineY, p.fit(line, 'Helvetica', size, width), 'Helvetica', size, { color: p.colors.muted });
  }
  if (swatch.description && full) p.paragraph(x, lineY - 14, swatch.description, width, { size: 10, color: p.colors.muted, maxLines: 2 });
}

export function drawGradients(p: Canvas, slide: GradientsSlide): void {
  p.begin(slide.title);
  const [cols, gap, height] = [3, 20, 110];
  const width = (PW - 2 * MARGIN - gap * (cols - 1)) / cols;
  slide.gradients.forEach((gradient, index) => {
    const x = MARGIN + (index % cols) * (width + gap);
    const y = PH - 112 - height - Math.floor(index / cols) * 190;
    const stops = gradient.stops.map((stop) => {
      const rgb = parseHex(stop.color) ?? [128, 128, 128, 1];
      return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]}) ${fmt(stop.position * 100)}%`;
    });
    p.rect(x, y, width, height, { fill: `linear-gradient(${gradient.angle}deg, ${stops.join(', ')})` });
    p.text(x, y - 18, gradient.name, 'Helvetica-Bold', 13, { color: p.fg });
    const described = gradient.stops.map((stop) => `${stop.color.toUpperCase()} ${number(stop.position * 100)}%`).join(', ');
    p.paragraph(x, y - 34, `${number(gradient.angle)} deg: ${described}`, width, { size: 10, color: p.colors.muted, maxLines: 3 });
  });
  p.end();
}
