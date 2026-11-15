/** A slide is 1280 x 720 CSS px; the content sits inside these margins, and the footer in the bottom one. */
export const SLIDE = { width: 1280, height: 720 };
export const MARGIN = { top: 72, side: 112, bottom: 72 };
export const CONTENT = { width: SLIDE.width - 2 * MARGIN.side, height: SLIDE.height - MARGIN.top - MARGIN.bottom };
/** A few pixels short of the content height, so a rounding difference between measuring and printing does not spill a slide */
export const ROOM = CONTENT.height - 8;
/** The tallest a figure's image is drawn: what is left of a slide under a heading, with the frame's padding and caption. */
export const FIGURE_MAX = 420;
/**
 * The contents are set in CONTENTS_COLUMNS columns of at most CONTENTS_ROWS lines, each entry a line of 45 px with its gap
 * (the rows then end well above the footer). An entry whose title does not fit a column wraps to a second line (or more:
 * a title is never cut), and counts as that many lines. More entries than a slide holds run over more contents slides,
 * packed in even shares (`packContents`). The cover is page 1, the contents follow it, and the first chapter comes after.
 */
export const CONTENTS_ROWS = 10;
export const CONTENTS_COLUMNS = 3;
/** Between the columns, and so the width of one: what a title wraps at */
export const CONTENTS_GAP = 48;
export const CONTENTS_COLUMN_WIDTH = (CONTENT.width - (CONTENTS_COLUMNS - 1) * CONTENTS_GAP) / CONTENTS_COLUMNS;
export const firstChapterPage = (contentsSlides: number): number => 2 + contentsSlides;

/**
 * The label at the top of a continued slide ("Rates (continued)"): one line of LABEL_LINE px and LABEL_GAP px below it.
 * A continued piece is packed with this height on top of its rows, and the CSS draws the label to exactly this.
 */
export const LABEL_LINE = 20;
export const LABEL_GAP = 12;
export const LABEL_HEIGHT = LABEL_LINE + LABEL_GAP;
