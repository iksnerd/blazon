import { SQUEEZE_FLOOR } from '@/lib/paginate';
import { CONTENT } from './geometry';

/**
 * A slide frame holding copies of its blocks, drawn smaller when they still overflow it. A split slide puts its text
 * in a column on the left and its figure (the last block) on the right.
 */
export function frame(kind: 'opener' | 'content', blocks: HTMLElement[], layout?: 'split', squeeze?: boolean): HTMLElement {
  const slide = document.createElement('div');
  slide.dataset.printSlide = kind;
  if (squeeze) slide.dataset.printSqueeze = '';
  const body = document.createElement('div');
  body.dataset.printSlideBody = '';
  // the prose classes the blocks were styled by, now that they are copied out of their columns
  if (kind === 'content') body.className = 'blazon-prose';
  const copies = blocks.map((el) => el.cloneNode(true));
  if (layout === 'split') {
    body.dataset.layout = 'split';
    const text = document.createElement('div');
    text.append(...copies.slice(0, -1));
    const figure = document.createElement('div');
    figure.append(copies.at(-1)!);
    body.append(text, figure);
  } else body.append(...copies);
  // A slide that opens with a later piece of a table or a grid says what it continues (cut() sets the heading as the value)
  const heading = blocks[0]?.dataset.printContinued;
  if (kind === 'content' && heading) body.prepend(continuedLabel(heading));
  slide.append(body);
  return slide;
}

/** "<heading> (continued)": the heading may be cut with an ellipsis, the suffix is not. */
function continuedLabel(heading: string): HTMLElement {
  const label = document.createElement('div');
  label.dataset.printContinuedLabel = '';
  const [name, suffix] = [document.createElement('span'), document.createElement('span')];
  name.textContent = heading;
  suffix.textContent = ' (continued)';
  label.append(name, suffix);
  return label;
}

/** A content frame's footer: the brand on the left, the page number on the right. */
export function footer(title: string, page: number): HTMLElement {
  const el = document.createElement('div');
  el.dataset.printFooter = '';
  const [brand, number] = [document.createElement('span'), document.createElement('span')];
  brand.textContent = title;
  number.textContent = String(page);
  el.append(brand, number);
  return el;
}

/** The pictures of a figure that a slide may draw shorter: a framed image or an asset's picture that does not claim a size of its own. */
const SQUEEZABLE = '[data-frame] img:not([data-min-size]), [data-section-asset] img:not([data-min-size])';

/** How much shorter (px) the pictures of a block can be drawn, down to SQUEEZE_FLOOR of their height. */
export function slackOf(el: HTMLElement): number {
  const imgs = el.matches(SQUEEZABLE) ? [el] : [...el.querySelectorAll<HTMLElement>(SQUEEZABLE)];
  return Math.floor(imgs.reduce((sum, img) => sum + img.getBoundingClientRect().height * (1 - SQUEEZE_FLOOR), 0));
}

/** Draws the pictures of a squeezed slide shorter by what its body overflows by, each in its share, never below the floor. */
function squeeze(body: HTMLElement): void {
  const imgs = [...body.querySelectorAll<HTMLElement>(SQUEEZABLE)];
  const heights = imgs.map((img) => img.getBoundingClientRect().height);
  const total = heights.reduce((a, b) => a + b, 0);
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const over = body.scrollHeight - CONTENT.height;
    if (over <= 1 || total <= 0) return;
    imgs.forEach((img, i) => {
      const now = img.getBoundingClientRect().height;
      img.style.maxHeight = `${Math.max(heights[i]! * SQUEEZE_FLOOR, now - (over * heights[i]!) / total)}px`;
    });
  }
}

/** The most times `fit` measures again: a grid takes a different number of rows once its body is wider */
const FIT_PASSES = 4;
/**
 * The smallest a body is drawn, the last resort: below the packer's split floor (MIN_SCALE, 0.9), which a block it can
 * split never needs. Only a block that cannot be split (one tall figure, a long code block) is drawn between the two:
 * small, but all of it. Losing content is worse than small text. A body that still overflows at this floor is cut off
 * at the foot and marked `data-print-clipped`, and the plugin reports its page; the book once went down to 0.25, where
 * 18px text is under 5px.
 */
export const LAST_RESORT_ZOOM = 0.5;
const MIN_ZOOM = LAST_RESORT_ZOOM;

/**
 * A sample that claims a size (the minimum-size logo, `data-min-size` in CSS px) is drawn at that size on the page, not at that size
 * times the body's zoom: the zoom is undone on the sample, so it stays N px of the 1280 px slide. The slide prints at 0.75 pt per
 * px (1280 px is 960 pt), which is 96 dpi: the sample is N/96 inch on paper when the PDF is printed at 100%.
 */
function trueSize(body: HTMLElement, zoom: number): void {
  for (const img of body.querySelectorAll<HTMLElement>('[data-min-size]')) {
    const px = Number(img.dataset.minSize);
    if (!(px > 0)) continue;
    const axis = img.dataset.minAxis === 'height' ? 'height' : 'width';
    img.style[axis] = `${px / zoom}px`;
    img.style[axis === 'width' ? 'height' : 'width'] = 'auto';
  }
}

/**
 * Draws a frame's body smaller when its contents are taller than the frame: what measuring could not foresee.
 * Drawn at a factor, the body is a page of CONTENT / factor on both sides, so smaller is wider and taller by the
 * same measure; its height was once left at CONTENT.height, which cut off at the foot what a wider body reflowed into
 * a second row of tiles. A body is measured again after each change, because the content reflows, and the factor
 * is taken from the height measured, which is in the body's own pixels.
 */
export function fit(slide: HTMLElement): void {
  const body = slide.querySelector<HTMLElement>('[data-print-slide-body]')!;
  if (slide.dataset.printSlide !== 'content') return;
  if (slide.dataset.printSqueeze !== undefined) squeeze(body);
  let zoom = 1;
  // A picture is as wide as its frame allows, so a body drawn smaller (and wider by the same measure) would draw it wider
  // and as tall as before: held to the width it has now, it shrinks with the zoom as the text does
  const widths = [...body.querySelectorAll<HTMLElement>('[data-frame] img:not([data-min-size]), [data-section-asset] img:not([data-min-size])')].map(
    (img) => [img, img.getBoundingClientRect().width] as const,
  );
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const height = body.scrollHeight;
    if (!height || height - CONTENT.height / zoom <= 1) break;
    const next = Math.max(MIN_ZOOM, CONTENT.height / height);
    if (next >= zoom) break;
    zoom = next;
    body.style.zoom = String(zoom);
    body.style.width = `${CONTENT.width / zoom}px`;
    body.style.height = `${CONTENT.height / zoom}px`;
    trueSize(body, zoom);
    for (const [img, width] of widths) if (width > 0) img.style.maxWidth = `${width}px`;
  }
  // Still taller than its frame at the floor: what the packer could not split, drawn at the last-resort floor and cut off
  if (body.scrollHeight - CONTENT.height / zoom > 1) slide.dataset.printClipped = '';
}
