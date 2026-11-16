/**
 * The two ways the print book can be spaced, as plain data: one object per layout, read by the CSS, the measuring of a
 * figure's slack and the fit of a squeezed slide. `compact` is the default and fits a book on fewer slides; `roomy` is the
 * layout the book had before pictures were squeezed to share a slide.
 */
export interface PrintLayout {
  /** A picture is drawn no shorter than this share of its height to share a slide; 1 draws none shorter, so none is squeezed */
  squeezeFloor: number;
  /** The tallest a figure's image is drawn, in px: what is left of a slide under a heading, with the frame's padding and caption */
  figureMax: number;
  /** The padding above and below a section, and the gap between its rows, in px */
  sectionPadding: number;
  sectionGap: number;
  /** The line height of the prose */
  proseLeading: number;
  /** The bottom margin of a paragraph, list or table, and the top margin of a third-level heading, when the layout sets one */
  proseMargin?: string;
  headingMargin?: string;
}

export const LAYOUTS = {
  compact: { squeezeFloor: 0.6, figureMax: 380, sectionPadding: 12, sectionGap: 12, proseLeading: 1.4, proseMargin: '0.6em', headingMargin: '1em' },
  roomy: { squeezeFloor: 1, figureMax: 420, sectionPadding: 24, sectionGap: 16, proseLeading: 1.5 },
} as const satisfies Record<string, PrintLayout>;

export type LayoutName = keyof typeof LAYOUTS;
export const DEFAULT_LAYOUT: LayoutName = 'compact';

/** The layout a print hash names; the default for an absent or unknown name, so a hand-written hash never breaks the book. */
export function layoutNamed(name: string | undefined): LayoutName {
  return name !== undefined && Object.hasOwn(LAYOUTS, name) ? (name as LayoutName) : DEFAULT_LAYOUT;
}

/** A layout as the full shape, so the optional margins can be read from either */
export const layoutOf = (name: LayoutName): PrintLayout => LAYOUTS[name];
