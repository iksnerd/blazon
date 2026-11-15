export const SWATCHES_PER_SLIDE = 8;
export const SWATCH_COLUMNS = 4; // at least; a slide whose longest group has more swatches has that many
export const GROUPS_PER_SLIDE = 3;
export const COLORS_ROOM = 366; // points between the title and the footer
export const COLORS_HEADING = 26;
export const COLORS_MIN_SWATCH = 36;
export const COLORS_LINE = 12; // a line of print values under a swatch, set at TEXT_FLOOR_PT
export const GRADIENTS_PER_SLIDE = 6;
// A type sample is drawn at PX_TO_PT of its size, between these, and a slide holds the rows whose heights fit
export const SAMPLE_MIN_PT = 14;
export const SAMPLE_MAX_PT = 54;
export const TYPE_ROWS_TOP = 130; // below the slide's top edge
export const TYPE_ROWS_BOTTOM = 70; // above its bottom edge: a row's text ends 22 pt higher, clear of a note of two lines above BODY_BOTTOM
export const PAGE = { width: 960, height: 540 } as const;
export const MARGIN = 56;
/**
 * The footer is 10 pt type on a baseline 26 pt above the slide's bottom edge, so its capitals and ascenders reach FOOTER_TOP. The lowest
 * line of the body of a slide (a list, a note, a source, a row of a table) has its baseline no lower than BODY_BOTTOM: the footer and it
 * are at least BODY_GAP apart, descenders (up to 4 pt at these sizes) included.
 */
export const FOOTER_TOP = 34;
export const BODY_GAP = 24;
export const BODY_BOTTOM = FOOTER_TOP + BODY_GAP + 4;
export const TEXT_FLOOR_PT = 10; // no text on a slide is set smaller: about the least that can be read when it is projected
export const NOTE_PT = 10; // sources, notes and the footer
export const BODY_PT = 12; // lists and captions
export const DIVIDER_FLOOR = BODY_BOTTOM;
/** Where a divider's title starts: with lists of what is left open, at least DIVIDER_TOP_OPEN and at most DIVIDER_TOP_MAX, in steps of DIVIDER_TOP_STEP. */
export const DIVIDER_TOP_OPEN = 340;
export const DIVIDER_TOP_MAX = 420;
export const DIVIDER_TOP_STEP = 10;
export const CONTENTS_LARGE = 7; // more parts than this are drawn smaller, in columns
export const CONTENTS_SMALL_PT = 14;
export const CONTENTS_SMALL_ROWS = 9;
export const PX_TO_PT = 0.5; // a 1920px design on a 960pt slide
// An asset's slide: the image in a panel on the left, its text beside it. The text is set at the first of these sizes at which it all
// fits beside a panel of the first of these widths; a smaller size or a narrower panel is tried before the text goes on a second slide
export const GUIDE_SIZES = [12, 11, 10] as const; // none is smaller than a note
export const GUIDE_PANELS = [540, 450, 360] as const;
export const GUIDE_PANEL_MIN = 200; // a panel that hugs a tall image is not narrower than this
export const FONTS_TOP = 380; // the baseline of the first family's name on a slide of typefaces, above the slide's bottom edge
export const FONTS_PT = 11; // what is said under a name: the stack, the description, whether it loads on the web
export const FONTS_LEAD = FONTS_PT * 1.3;
export const FONTS_NAME = 22; // from the name's baseline to the first line under it
export const FONTS_JOIN = 2; // between what is said under a name
export const FONTS_GAP = 34; // below the last line of a family, to the next name
export const FONTS_WIDTH = 800;
export const FONTS_NOTE_ROOM = 2 * 13 + 8; // the note under the families, which may be two lines, and a gap above it
export const PANEL_TOP = 410; // the panel's top edge, in points above the slide's bottom
export const PANEL_BOTTOM = 70;
export const PANEL_GAP = 32; // the space between the panel and the text
export const GUIDE_LEAD = 1.3;
export const GUIDE_BULLET = 12; // the width the bullet of a list item has before its text
export const GUIDE_LABEL = 18; // the height of "Do" and "Don't"
export const GUIDE_SPACE = 8; // below each block of text
export const GUIDE_ITEM = 3; // below each item
export const GUIDE_PAIR_GAP = 24; // between Do and Don't set side by side
export const GUIDE_PAIR_MIN = 200; // and each is at least this wide
/** (columns of Do and Don't, traits as one line), the plainest first */
export const GUIDE_FORMS: readonly (readonly [1 | 2, boolean])[] = [
  [1, false],
  [1, true],
  [2, false],
  [2, true],
];
export const GUIDE_INSET = 4; // the text starts this far below the top of the panel
export const GUIDE_SOURCE_LEAD = 13;

// A grid slide (a `blazon:assets` directive): up to GRID_MAX figures in rows of at most GRID_COLS, each a picture fitted into its cell with
// its title under it. A figure is never drawn smaller than GRID_MIN_AREA points squared (about 126 x 126), so the count per slide follows
// the pictures: three tall posts, six squares, two wide banners.
export const GRID_MAX = 6;
export const GRID_COLS = 3;
export const GRID_GAP = 16;
export const GRID_ROW_GAP = 14;
export const GRID_CAPTION = 30; // below each picture: two lines of a note
export const GRID_MIN_AREA = 16000;
