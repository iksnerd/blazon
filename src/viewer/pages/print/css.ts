import { CONTENT, LABEL_GAP, LABEL_LINE, MARGIN, SLIDE } from './geometry';
import { layoutOf, type LayoutName } from './layouts';

/**
 * CSS for the print book. Every slide is a frame of its own, the whole 16:9 page: a content frame draws its margin and
 * its footer (the brand and the page number) itself, so a screenshot of a frame is the printed page; an opener (the
 * cover, a chapter's title band or header) is full bleed. The chapters the book measured stay off the page and print
 * nothing. Text is set at slide size: the web page's sizes, which are for a screen read at arm's length, are raised by
 * 1.11 (body 18px is 20px, which prints as 15 pt on the 960 pt slide) so a slide's text reads as a slide's.
 */
export function printCss(layout: LayoutName): string {
  const { figureMax, sectionPadding, sectionGap, proseLeading, proseMargin, headingMargin } = layoutOf(layout);
  const book = '[data-print-book]';
  return `
@page { size: ${SLIDE.width}px ${SLIDE.height}px; margin: 0; }
html, body { background: var(--background); }
/* Laid out (it is what the book measures) but off the page, in a box of no height, so it prints nothing */
${book} [data-print-flow] { position: absolute; left: -100000px; top: 0; width: ${CONTENT.width}px; height: 0; overflow: hidden; }
${book} [data-print-slide] { position: relative; box-sizing: border-box; width: ${SLIDE.width}px; height: ${SLIDE.height}px;
  padding: ${MARGIN.top}px ${MARGIN.side}px ${MARGIN.bottom}px; overflow: hidden; break-after: page; }
${book} [data-print-slide]:not([data-print-slide="cover"]) { background: var(--background); }
${book} [data-print-slide]:last-child { break-after: auto; }
${book} [data-print-slide] > [data-print-slide-body] { height: ${CONTENT.height}px; overflow: hidden; }
${book} [data-print-slide="opener"] { padding: 0; }
${book} [data-print-slide="cover"] { background: var(--blazon-inverse); padding: 80px 112px; }
/* An opener's section label and brand mark are placed absolutely, past its padding: give them the slide's margin */
${book} [data-print-slide="opener"] [data-opener-label] { top: ${MARGIN.top}px; }
${book} [data-print-slide="opener"] [data-opener-mark] { bottom: ${MARGIN.bottom}px; }
${book} [data-print-slide="opener"] > [data-print-slide-body] { height: 100%; }
${book} [data-print-slide="opener"] [data-print-slide-body] > * { box-sizing: border-box; height: 100%; min-height: 0; padding: 80px 112px; }
${book} [data-print-footer] { position: absolute; left: ${MARGIN.side}px; right: ${MARGIN.side}px; bottom: 28px; display: flex;
  justify-content: space-between; font: 13px var(--font-sans); color: var(--muted-foreground); }
/* A long title is one line, cut with an ellipsis, so the footer is as high as it is with a short one */
${book} [data-print-footer] > span { white-space: nowrap; }
${book} [data-print-footer] > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; margin-right: 24px; }
${book} [data-print-footer] > span:last-child { flex: none; }
@media screen { html, body { background: var(--muted); } ${book} { padding: 56px 0; } ${book} [data-print-slide] { margin: 0 auto 56px; outline: 1px solid var(--border); } }
/* Interactive chrome of the web page: the copy button of a code block has nothing to do on paper */
${book} [data-slot="code-block-actions"], ${book} [data-slot="code-block-copy-button"] { display: none !important; }
${book} footer, ${book} [data-section-index] { display: none; }
${book} article, ${book} [data-print-chapter] > div, ${book} header { padding-left: 0; padding-right: 0; }
${book} section:not([data-print-slide] [data-print-slide-body] > section:only-child) { grid-template-columns: minmax(0, 1fr); padding: ${sectionPadding}px 0; border: 0; row-gap: ${sectionGap}px; }
${book} h2 { font-family: var(--font-heading); font-size: 38px; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em; }
${book} .blazon-prose { max-width: none; font-size: 20px; line-height: ${proseLeading}; }
${proseMargin ? `${book} .blazon-prose :is(p, ul, ol, table) { margin-bottom: ${proseMargin}; }\n` : ''}${headingMargin ? `${book} .blazon-prose h3 { margin-top: ${headingMargin}; }\n` : ''}${book} .blazon-prose table { font-size: 16px; }
${book} .blazon-prose blockquote { font-size: 15px; }
${book} .blazon-prose p, ${book} .blazon-prose li { max-width: 62ch; }
/* A continued slide's label, the section heading and "(continued)" in the muted colour on one line: the heading gives way
   with an ellipsis, the suffix never. 14px, so 12.6px (9.5 pt) at the smallest a slide is drawn at */
${book} [data-print-continued-label] { display: flex; height: ${LABEL_LINE}px; margin-bottom: ${LABEL_GAP}px; font: 500 14px/${LABEL_LINE}px var(--font-sans); color: var(--muted-foreground); }
${book} [data-print-continued-label] span:first-child { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
${book} [data-print-continued-label] span:last-child { flex: none; white-space: pre; }
/* A split slide: the intro in a column on the left, the figure in the two thirds on the right */
${book} [data-print-slide-body][data-layout="split"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 40px; align-items: start; }
${book} [data-section-asset] { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); align-items: center; }
${book} [data-section-asset] h3 { font-size: 27px; font-family: var(--font-heading); }
${book} [data-section-asset] p, ${book} [data-section-asset] li { font-size: 18px; }
/* An asset's figure beside its text, not below it as on a wide web page */
${book} [data-section-asset] figure { grid-column: auto; }
${book} [data-section-asset] figure > div { max-height: 360px; }
/* A figure is framed at its image's real ratio on the web, so its height grows with its width, and drawing the frame
   smaller (fit) widens it again: a tall image never got shorter and was cut off at the foot of the slide. In print the
   frame takes the image's own size, and the image is held to what a slide has room for. */
${book} [data-frame] { aspect-ratio: auto !important; }
${book} [data-frame] img { max-height: ${figureMax}px; width: auto; }
/* A Favicons view is a picture at the full width of the page, as tall as its ratio makes it: a square sheet was 1054px tall and
   wider still when the slide was drawn smaller, past what even the smallest size holds. It is held to what a slide has room for. */
${book} [data-favicons-view] img { max-height: ${figureMax}px; width: auto; max-width: 100%; margin-inline: auto; object-fit: contain; }
${book} [data-section-asset] img { max-height: 330px; width: auto; max-width: 100%; margin-inline: auto; object-fit: contain; }
/* The viewer's small type, raised by the same 1.11 as the body: its smallest (a caption, a label) is 12px, 9 pt on the
   slide and 8.1 pt at the smallest scale a slide is drawn at. In :where, so a rule above that sets a size (a heading) wins */
${SIZES.map(([from, to]) => `${book} :where([class~="${from}"]) { font-size: ${to}px; }`).join('\n')}`;
}

/** The viewer's text sizes (a Tailwind class) and what each is in the book, in px: every one raised by 1.11 */
const SIZES: [string, number][] = [
  ['text-[0.625rem]', 12],
  ['text-[11px]', 12.5],
  ['text-xs', 13.5],
  ['text-[0.8rem]', 14],
  ['text-[13px]', 14.5],
  ['text-sm', 16],
  ['text-[15px]', 17],
  ['text-base', 18],
  ['text-lg', 20],
];
