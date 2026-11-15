import { type Brand } from '../brand.js';
import { brandFaces, FontTable } from '../fonts.js';
import { type Images } from '../images.js';
import { fitText, type Measure, type Spec, wrapText } from '../measure.js';
import { GUIDE_LEAD, GUIDE_SOURCE_LEAD, MARGIN, NOTE_PT, type Wrap } from '../plan/index.js';
import { type Colors, css, escape, fallback, fmt, type FontName, MONO, type Options, paletteOf, PH, PW, type Rgba, specOf, STRUT } from './style.js';

export interface Resources {
  brand: Brand;
  measure: Measure;
  images: Images;
  table: FontTable;
  /** Where the site's files are, and the image a favicons.json names is read from */
  siteDir: string;
}

/** The first `maxLines` of `lines`, the last ending in "..." when some were left out */
export function clip(lines: string[], maxLines?: number): string[] {
  if (maxLines === undefined || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = `${kept[kept.length - 1]!.trimEnd()}...`;
  return kept;
}

export class Canvas {
  readonly colors: Colors;
  readonly faces: { text: Spec; bold: Spec; title: Spec };
  body: string[] = [];
  fg!: Rgba;
  background: Rgba = [255, 255, 255, 1];
  page = 0;
  /** Measuring a slide: nothing is drawn, so the code that draws it says how tall it is */
  dry = false;
  /** A list was cut short ("+N more") in the slide being drawn or measured */
  cut = false;
  /** The slides drawn so far, as HTML */
  readonly sections: string[] = [];

  constructor(readonly r: Resources) {
    this.colors = paletteOf(r.brand);
    const wanted = brandFaces(r.brand);
    const pick = (face: [string, number] | null, weight: number | null, plain: Spec): Spec => {
      const found = face ? r.table.face(face[0], weight ?? face[1]) : undefined;
      return found ? specOf(found) : plain;
    };
    this.faces = { text: pick(wanted.body, 400, fallback(400)), bold: pick(wanted.body, 700, fallback(700)), title: pick(wanted.display, null, fallback(700)) };
  }

  // -- text, shapes and images
  spec(font: FontName): Spec {
    if (typeof font !== 'string') return font;
    switch (font) {
      case 'Helvetica':
        return this.faces.text;
      case 'Helvetica-Bold':
        return this.faces.bold;
      case 'Title':
        return this.faces.title;
      case 'Helvetica-Oblique':
        return fallback(400, { italic: true });
      case '!Helvetica':
        return fallback(400);
      case '!Helvetica-Bold':
        return fallback(700);
      case '!Courier':
        return { family: MONO, weight: 400 };
    }
  }

  /** The face of one of the brand's families at a weight, or undefined when no font file was given for it */
  own(family: string | null, weight: unknown): Spec | undefined {
    const found = family ? this.r.table.face(family, weight) : undefined;
    return found && specOf(found);
  }

  width(font: FontName, size: number, text: string): number {
    return this.r.measure.width(this.spec(font), size, text);
  }

  /** The lines `text` is drawn in at this size within `width`: what the layout of a slide measures with */
  wrap: Wrap = (text, size, width) => wrapText(this.r.measure, this.faces.text, text, size, width);

  lines(text: string, font: FontName, size: number, width: number): string[] {
    return wrapText(this.r.measure, this.spec(font), text, size, width);
  }

  fit(text: string, font: FontName, size: number, width: number): string {
    return fitText(this.r.measure, this.spec(font), text, size, width);
  }

  put(html: string): void {
    this.body.push(html);
  }

  text(x: number, y: number, string: string, font: FontName = 'Helvetica', size = 12, { color = this.colors.ink, align = 'left' }: Options = {}): void {
    if (this.dry) return;
    const spec = this.spec(font);
    const place = align === 'right' ? `right:${fmt(PW - x)}pt` : `left:${fmt(x)}pt${align === 'center' ? ';transform:translateX(-50%)' : ''}`;
    this.put(
      `<div class="t" style="${place};top:${fmt(PH - y - STRUT)}pt;font-family:${spec.family};font-weight:${spec.weight};font-size:${size}pt;color:${css(color)}${spec.italic ? ';font-style:italic' : ''}"><i></i>${escape(string)}</div>`,
    );
  }

  /**
   * One list item: its `lines` (already broken for the width) in one block of text, so the browser hangs a wrapped line under the
   * text and not under the bullet, which is the list's own marker in the margin (`list-style`) and not a character of the text.
   * (x, y) is the left edge of the text and the baseline of the first line; each line after it is `leading` lower.
   */
  bullet(
    x: number,
    y: number,
    lines: string[],
    font: FontName = 'Helvetica',
    size = 12,
    { color = this.colors.ink, marker = color, leading = size * GUIDE_LEAD }: { color?: Rgba; marker?: Rgba; leading?: number } = {},
  ): void {
    if (this.dry || lines.length === 0) return;
    const spec = this.spec(font);
    this.put(
      `<ul class="l" style="left:${fmt(x)}pt;top:${fmt(PH - y - STRUT)}pt;font-family:${spec.family};font-weight:${spec.weight};font-size:${size}pt;line-height:${fmt(leading)}pt;color:${css(color)};--m:${css(marker)}"><li><i></i>${escape(lines.join('\n'))}</li></ul>`,
    );
  }

  /** A note that may be long, wrapped to `width` and drawn upward from its last line's baseline at `bottom`, so it stays clear of the footer. */
  note(x: number, bottom: number, string: string, width: number, color?: Rgba): number {
    const lines = this.lines(string, 'Helvetica', NOTE_PT, width);
    [...lines].reverse().forEach((line, n) => this.text(x, bottom + n * GUIDE_SOURCE_LEAD, line, 'Helvetica', NOTE_PT, { color: color ?? this.colors.muted }));
    return bottom + lines.length * GUIDE_SOURCE_LEAD;
  }

  /** Wrapped text from y downward; returns the y below it. With `align`, x is the left edge, the centre or the right edge. */
  paragraph(
    x: number,
    y: number,
    string: string,
    width: number,
    {
      font = 'Helvetica',
      size = 12,
      color,
      leading,
      maxLines,
      align = 'left',
    }: { font?: FontName; size?: number; color?: Rgba; leading?: number; maxLines?: number; align?: Options['align'] } = {},
  ): number {
    const lines = clip(this.lines(string, font, size, width), maxLines);
    const step = leading ?? size * 1.3;
    let at = y;
    for (const line of lines) {
      this.text(x, at, line, font, size, { color, align });
      at -= step;
    }
    return at;
  }

  /** A box with its bottom left corner at (x, y): filled, stroked with a 1 point line centred on its edge, or both. A stroke is drawn as an SVG rectangle, so the browser does not snap it to its pixels. */
  rect(x: number, y: number, w: number, h: number, { fill, stroke }: { fill?: Rgba | string; stroke?: Rgba } = {}): void {
    const place = `left:${fmt(x)}pt;top:${fmt(PH - y - h)}pt;width:${fmt(w)}pt;height:${fmt(h)}pt`;
    if (stroke) {
      const inside = fill === undefined || typeof fill === 'string' ? 'none' : css(fill);
      this.put(
        `<svg class="r" style="${place};overflow:visible" viewBox="0 0 ${fmt(w)} ${fmt(h)}"><rect width="${fmt(w)}" height="${fmt(h)}" fill="${inside}" stroke="${css(stroke)}" stroke-width="1"/></svg>`,
      );
      return;
    }
    const fillStyle = fill === undefined ? '' : `background:${typeof fill === 'string' ? fill : css(fill)}`;
    this.put(`<div class="r" style="${place};${fillStyle}"></div>`);
  }

  dashed(x: number, y: number, w: number, h: number, stroke: Rgba): void {
    this.put(
      `<svg class="r" style="left:${fmt(x)}pt;top:${fmt(PH - y - h)}pt;width:${fmt(w)}pt;height:${fmt(h)}pt;overflow:visible" viewBox="0 0 ${fmt(w)} ${fmt(h)}"><rect width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="${css(stroke)}" stroke-width="1" stroke-dasharray="4 3"/></svg>`,
    );
  }

  line(x1: number, y: number, x2: number): void {
    this.put(`<div class="r" style="left:${fmt(x1)}pt;top:${fmt(PH - y - 0.5)}pt;width:${fmt(x2 - x1)}pt;height:0;border-top:1pt solid ${css(this.colors.border)}"></div>`);
  }

  picture(url: string, x: number, y: number, w: number, h: number): void {
    this.put(`<img class="r" src="${url}" style="left:${fmt(x)}pt;top:${fmt(PH - y - h)}pt;width:${fmt(w)}pt;height:${fmt(h)}pt" alt="">`);
  }

  /** An image read from the site, or from `root`: it is drawn by `draw(x, y, w, h)`, and is `width` x `height` in its own pixels */
  image(ref: string, root = this.r.siteDir): { draw: (x: number, y: number, w: number, h: number) => void; width: number; height: number } {
    const served = this.r.images.load(ref, root);
    return { draw: (x, y, w, h) => this.picture(served.url, x, y, w, h), width: served.width, height: served.height };
  }

  // -- a slide
  begin(title: string | null, dark = false): void {
    this.page += 1;
    this.body = [];
    this.fg = dark ? this.colors.onDark : this.colors.ink;
    this.background = dark ? this.colors.dark : this.colors.light;
    this.rect(MARGIN, PH - 48, 40, 4, { fill: this.colors.accent });
    if (title) this.text(MARGIN, PH - 84, title, 'Title', 28, { color: this.fg });
    this.text(MARGIN, 26, this.r.brand.brand.title, 'Helvetica', NOTE_PT, { color: this.fg });
    this.text(PW - MARGIN, 26, String(this.page), 'Helvetica', NOTE_PT, { color: this.fg, align: 'right' });
  }

  end(): void {
    this.sections.push(`<section class="s" style="background:${css(this.background)}">${this.body.join('')}</section>`);
  }
}
