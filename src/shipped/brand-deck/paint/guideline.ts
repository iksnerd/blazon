import { DeckError } from '../favicons.js';
import { fitted, guideGeometry, type GuidelineSlide, guideOps, MARGIN, PANEL_BOTTOM, PANEL_TOP, sourceRoom } from '../plan/index.js';
import { Canvas } from './canvas.js';
import { type FontName, type Rgba } from './style.js';

/** An asset a `blazon:section` directive lists: its image on the left, what its sidecar says on the right. The plan fitted the text to the slide (`layout`); a slide that carries none is fitted here, with the slides that continue it. */
export function drawGuideline(p: Canvas, slide: GuidelineSlide): void {
  if (!slide.layout) {
    for (const part of fitted(slide, p.wrap)) drawGuideline(p, part);
    return;
  }
  const { layout } = slide;
  p.begin(slide.title);
  if (layout.panel) drawPanel(p, slide, layout.panel, slide.background === 'dark');
  const { x: rx, width: rw } = guideGeometry(layout.panel);
  const { lines } = sourceRoom(slide, rw, p.wrap);
  const { ops } = guideOps(slide, layout.size, rw, layout.columns, p.wrap, layout.traits === 'line');
  for (const [role, x, y, text] of ops) {
    if (role === 'bullet') {
      p.bullet(rx + x, PANEL_TOP - y, text.split('\n'), 'Helvetica', layout.size, { marker: p.colors.muted });
      continue;
    }
    const [font, size, color]: [FontName, number, Rgba | undefined] =
      role === 'label' ? ['Helvetica-Bold', 11, p.fg] : role === 'item' ? ['Helvetica', layout.size, undefined] : ['Helvetica', layout.size, p.colors.muted];
    p.text(rx + x, PANEL_TOP - y, text, font, size, { color });
  }
  if (lines.length > 0 && slide.source) p.note(rx, PANEL_BOTTOM, slide.source, rw);
  p.end();
}

/** The box the image of an asset slide is drawn in, with the image fitted into it. */
function drawPanel(p: Canvas, slide: GuidelineSlide, width: number, dark: boolean): void {
  const [px, py, pw, ph] = [MARGIN, PANEL_BOTTOM, width, PANEL_TOP - PANEL_BOTTOM];
  p.rect(px, py, pw, ph, { fill: dark ? p.colors.dark : p.colors.light });
  try {
    const { draw, width: naturalW, height: naturalH } = p.image(slide.file);
    const artW = slide.width || naturalW;
    const artH = slide.height || naturalH;
    const scale = Math.min((pw - 48) / artW, (ph - 48) / artH);
    draw(px + (pw - artW * scale) / 2, py + (ph - artH * scale) / 2, artW * scale, artH * scale);
    p.rect(px, py, pw, ph, { stroke: p.colors.border });
  } catch (error) {
    if (!(error instanceof DeckError) || !slide.local) throw error;
    // A category kept out of git: its sentence says how to get the image, and the text of the slide is still here
    p.rect(px, py, pw, ph, { stroke: p.colors.border });
    p.paragraph(px + 24, py + ph - 36, slide.local, pw - 48, { size: 13, color: dark ? p.colors.onDark : p.colors.muted, maxLines: 8 });
  }
}
