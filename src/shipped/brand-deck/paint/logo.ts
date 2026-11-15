import { type LogoSlide, MARGIN, NOTE_PT } from '../plan/index.js';
import { Canvas } from './canvas.js';
import { PW } from './style.js';

export function drawLogo(p: Canvas, slide: LogoSlide): void {
  const dark = slide.background === 'dark';
  p.begin(slide.title);
  const [px, py, pw, ph] = [MARGIN, 70, 540, 340];
  p.rect(px, py, pw, ph, { fill: dark ? p.colors.dark : p.colors.light });
  p.rect(px, py, pw, ph, { stroke: p.colors.border });
  const { draw, width: naturalW, height: naturalH } = p.image(slide.file);
  const artW = slide.width || naturalW;
  const artH = slide.height || naturalH;
  const clear = slide.clear_space_px || 0;
  const scale = Math.min((pw - 48) / (artW + 2 * clear), (ph - 48) / (artH + 2 * clear));
  const [w, h] = [artW * scale, artH * scale];
  const [x, y] = [px + (pw - w) / 2, py + (ph - h) / 2];
  draw(x, y, w, h);
  if (clear) {
    const gap = clear * scale;
    p.dashed(x - gap, y - gap, w + 2 * gap, h + 2 * gap, p.colors.accent);
  }
  const rx = px + pw + 32;
  const rw = PW - MARGIN - rx;
  let ry = py + ph;
  if (slide.note) ry = p.paragraph(rx, ry - 14, slide.note, rw, { size: 12, color: p.colors.muted, maxLines: 5 }) - 10;
  for (const rule of slide.rules) {
    p.text(rx, ry - 14, rule.label, 'Helvetica-Bold', 11, { color: p.fg });
    ry = p.paragraph(rx, ry - 30, rule.text, rw, { size: 11, color: p.colors.muted, maxLines: 3 }) - 6;
  }
  if (clear) p.text(rx, py, 'Dashed line: the clear space, kept free around the logo.', 'Helvetica', NOTE_PT, { color: p.colors.muted });
  p.end();
}
