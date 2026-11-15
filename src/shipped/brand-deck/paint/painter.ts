import { type Slide } from '../plan/index.js';
import { Canvas } from './canvas.js';
import { drawColors, drawGradients } from './colors.js';
import { drawContents, drawCover } from './cover.js';
import { drawDivider } from './divider.js';
import { drawFaviconFiles, drawFaviconHead, drawFaviconView } from './favicons.js';
import { drawGrid } from './grid.js';
import { drawGuideline } from './guideline.js';
import { drawLogo } from './logo.js';
import { drawFonts, drawTypeScale } from './typography.js';

export class Painter extends Canvas {
  draw(slide: Slide): void {
    switch (slide.kind) {
      case 'cover':
        return drawCover(this, slide);
      case 'contents':
        return drawContents(this, slide);
      case 'colors':
        return drawColors(this, slide);
      case 'gradients':
        return drawGradients(this, slide);
      case 'fonts':
        return drawFonts(this, slide);
      case 'type-scale':
        return drawTypeScale(this, slide);
      case 'logo':
        return drawLogo(this, slide);
      case 'page':
        return drawDivider(this, slide);
      case 'guideline':
        return drawGuideline(this, slide);
      case 'grid':
        return drawGrid(this, slide);
      case 'favicon-view':
        return drawFaviconView(this, slide);
      case 'favicon-files':
        return drawFaviconFiles(this, slide);
      case 'favicon-head':
        return drawFaviconHead(this, slide);
    }
  }
}
