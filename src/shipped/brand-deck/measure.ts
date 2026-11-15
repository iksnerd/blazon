import type { Page } from 'playwright-core';

// The plan fits an asset's text to its slide, and the drawing breaks every paragraph into lines, so both need the width of text in
// the browser's own fonts. Layout is synchronous and the browser is not, so layout asks for widths it does not have yet and gets an
// estimate, and the questions it could not answer are asked of the browser in one batch; the layout is then run again. When a run
// asks nothing new, every width it used was measured. Nothing is guessed in the drawn deck.

/** A face as a browser names it: the CSS font-family list, the weight, and whether it is italic */
export interface Spec {
  family: string;
  weight: number;
  italic?: boolean;
}

export interface Natural {
  width: number;
  height: number;
}

const PT_PER_PX = 0.75;

export class Measure {
  private widths = new Map<string, number>();
  private sizes = new Map<string, Natural | null>();
  private askedText = new Map<string, [Spec, number, string]>();
  private askedImages = new Set<string>();

  /** The width in points of `text` set in `spec` at `size` points; an estimate (half the size a letter) until the browser has measured it */
  width(spec: Spec, size: number, text: string): number {
    const key = `${spec.italic ? 'i' : 'n'}|${spec.weight}|${spec.family}|${size}|${text}`;
    const known = this.widths.get(key);
    if (known !== undefined) return known;
    this.askedText.set(key, [spec, size, text]);
    return [...text].length * size * 0.5;
  }

  /** The size of an image in its own pixels: undefined until measured, null when the browser cannot read it */
  natural(url: string): Natural | null | undefined {
    const known = this.sizes.get(url);
    if (known === undefined) this.askedImages.add(url);
    return known;
  }

  /** Records the size of an image that needs no browser to read (an SVG's own width and height) */
  setNatural(url: string, size: Natural): void {
    this.sizes.set(url, size);
    this.askedImages.delete(url);
  }

  get settled(): boolean {
    return this.askedText.size === 0 && this.askedImages.size === 0;
  }

  /** Asks the browser the questions layout could not answer. `page` has the deck's fonts and serves its images. */
  async fill(page: Page, origin: string, skipImages: ReadonlySet<string> = new Set()): Promise<void> {
    const texts = [...this.askedText];
    const images = [...this.askedImages].filter((url) => !skipImages.has(url));
    this.askedText = new Map();
    this.askedImages = new Set();
    const jobs = texts.map(([key, [spec, size, text]]) => ({ key, font: `${spec.italic ? 'italic ' : ''}${spec.weight} ${(size * 4) / 3}px ${spec.family}`, text }));
    const answer = await page.evaluate(
      async ({ jobs: asked, images: urls, origin: base }) => {
        await Promise.all([...new Set(asked.map((job) => job.font))].map((font) => document.fonts.load(font).catch(() => [])));
        const context = document.createElement('canvas').getContext('2d')!;
        const widths: [string, number][] = asked.map((job) => {
          context.font = job.font;
          return [job.key, context.measureText(job.text).width];
        });
        const sizes: [string, { width: number; height: number } | null][] = await Promise.all(
          urls.map(async (url): Promise<[string, { width: number; height: number } | null]> => {
            const image = new Image();
            image.src = `${base}${url}`;
            try {
              await image.decode();
              return [url, { width: image.naturalWidth, height: image.naturalHeight }];
            } catch {
              return [url, null];
            }
          }),
        );
        return { widths, sizes };
      },
      { jobs, images, origin },
    );
    for (const [key, px] of answer.widths) this.widths.set(key, px * PT_PER_PX);
    for (const [url, size] of answer.sizes) this.sizes.set(url, size);
  }
}

/** Python's reportlab `simpleSplit`, on the browser's widths: paragraphs split at line breaks, words at spaces, and a word wider than the line cut by letters */
export function wrapText(measure: Measure, spec: Spec, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  const space = measure.width(spec, size, ' ');
  for (const paragraph of text.split(/\r\n|\n|\r/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    let used = 0;
    const push = () => {
      if (line !== '') out.push(line);
      line = '';
      used = 0;
    };
    for (const word of words) {
      let rest = word;
      let wide = measure.width(spec, size, rest);
      while (wide > maxWidth && [...rest].length > 1) {
        // A word wider than the line is cut where the line is full
        push();
        const letters = [...rest];
        let take = letters.length - 1;
        while (take > 1 && measure.width(spec, size, letters.slice(0, take).join('')) > maxWidth) take--;
        out.push(letters.slice(0, take).join(''));
        rest = letters.slice(take).join('');
        wide = measure.width(spec, size, rest);
      }
      if (line !== '' && used + space + wide > maxWidth) push();
      line = line === '' ? rest : `${line} ${rest}`;
      used = line === rest ? wide : used + space + wide;
    }
    push();
  }
  return out.length > 0 ? out : [''];
}

/** The text, cut with "..." when it is wider than `width` */
export function fitText(measure: Measure, spec: Spec, text: string, size: number, width: number): string {
  if (measure.width(spec, size, text) <= width) return text;
  let cut = [...text];
  while (cut.length > 0 && measure.width(spec, size, `${cut.join('')}...`) > width) cut = cut.slice(0, -1);
  return `${cut.join('').trimEnd()}...`;
}
