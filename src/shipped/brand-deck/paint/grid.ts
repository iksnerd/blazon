import { DeckError } from '../favicons.js';
import { GRID_CAPTION, GRID_GAP, GRID_ROW_GAP, type GridSlide, MARGIN, NOTE_PT, PANEL_BOTTOM, PANEL_TOP, TEXT_FLOOR_PT } from '../plan/index.js';
import { Canvas } from './canvas.js';
import { PW } from './style.js';

/** The figures of a `blazon:assets` directive: each picture fitted, not cropped, into its cell and sitting on the row's baseline, its title centred under it. A picture on a dark ground is drawn on the dark colour, as in an asset's panel. */
export function drawGrid(p: Canvas, slide: GridSlide): void {
  p.begin(slide.title);
  const { cols, rows } = slide;
  const cellW = (PW - 2 * MARGIN - GRID_GAP * (cols - 1)) / cols;
  const cellH = (PANEL_TOP - PANEL_BOTTOM - GRID_ROW_GAP * (rows - 1)) / rows;
  slide.figures.forEach((figure, index) => {
    const x = MARGIN + (index % cols) * (cellW + GRID_GAP);
    const bottom = PANEL_TOP - Math.floor(index / cols) * (cellH + GRID_ROW_GAP) - cellH + GRID_CAPTION;
    const area = cellH - GRID_CAPTION;
    const dark = figure.background === 'dark';
    let draw: ReturnType<Canvas['image']>['draw'] | undefined;
    let naturalW: number;
    let naturalH: number;
    try {
      ({ draw, width: naturalW, height: naturalH } = p.image(figure.file));
    } catch (error) {
      if (!(error instanceof DeckError) || !figure.local) throw error;
      // A category kept out of git: an empty frame with the sentence that says how to get the image
      [naturalW, naturalH] = [figure.width || 1, figure.height || 1];
    }
    const artW = figure.width || naturalW;
    const artH = figure.height || naturalH;
    const scale = Math.min(cellW / artW, area / artH);
    const [w, h] = [artW * scale, artH * scale];
    const left = x + (cellW - w) / 2;
    p.rect(left, bottom, w, h, { fill: dark ? p.colors.dark : p.colors.light });
    if (draw) draw(left, bottom, w, h);
    // The frame is drawn over the picture, so the browser cannot leave its edge under the picture's own pixels
    p.rect(left, bottom, w, h, { stroke: p.colors.border });
    if (!draw && figure.local) {
      p.paragraph(left + 8, bottom + h - 16, figure.local, w - 16, {
        size: TEXT_FLOOR_PT,
        color: dark ? p.colors.onDark : p.colors.muted,
        maxLines: Math.max(1, Math.floor((h - 8) / (TEXT_FLOOR_PT * 1.3))),
      });
    }
    p.paragraph(x + cellW / 2, bottom - 14, figure.title, cellW, { font: 'Helvetica-Bold', size: NOTE_PT, color: p.fg, leading: 12, maxLines: 2, align: 'center' });
  });
  p.end();
}
