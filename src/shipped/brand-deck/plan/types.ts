/** The deck's way of breaking text into lines of at most `width` points at `size` points, in the body face */
export type Wrap = (text: string, size: number, width: number) => string[];

export interface Rule {
  label: string;
  text: string;
}
export interface Swatch {
  name: string;
  path: string;
  hex: string;
  rgb: number[] | null;
  cmyk: number[] | null;
  pms: string | null;
  ral: string | null;
  description: string | null;
}
export interface ColorGroup {
  title: string;
  note: string | null;
  swatches: Swatch[];
}
export interface GradientStop {
  color: string;
  position: number;
}
export interface Gradient {
  name: string;
  path: string;
  angle: number;
  stops: GradientStop[];
}
export interface FontFamily {
  name: string;
  path: string;
  stack: string;
  description: string | null;
  web_font?: string;
}
export interface TypeStyle {
  name: string;
  path: string;
  family: string | null;
  size_px: number | null;
  weight: unknown;
  line_height: unknown;
  letter_spacing: string | null;
}
export interface Layout {
  panel: number | null;
  size: number;
  columns: 1 | 2;
  traits: 'line' | 'list';
}
export interface OpenList {
  title: string;
  items: string[];
  source: string | null;
}
export interface Figure {
  title: string;
  file: string;
  format: string;
  width: number | null | undefined;
  height: number | null | undefined;
  background: string;
  local: string | null | undefined;
}

export interface CoverSlide {
  kind: 'cover';
  title: string;
  subtitle: string | null;
  logo: { file: string; background: 'light' | 'dark' } | null;
}
export interface ContentsSlide {
  kind: 'contents';
  title: string;
  items: { title: string; page: number }[];
}
export interface PageSlide {
  kind: 'page';
  title: string;
  description: string | null;
  open: OpenList[];
}
export interface ColorsSlide {
  kind: 'colors';
  title: string;
  note: string | null;
  groups: ColorGroup[];
  swatches: Swatch[];
}
export interface GradientsSlide {
  kind: 'gradients';
  title: string;
  gradients: Gradient[];
}
export interface FontsSlide {
  kind: 'fonts';
  title: string;
  families: FontFamily[];
}
export interface TypeScaleSlide {
  kind: 'type-scale';
  title: string;
  styles: TypeStyle[];
}
export interface LogoSlide {
  kind: 'logo';
  title: string;
  file: string;
  format: string;
  width: number | null | undefined;
  height: number | null | undefined;
  background: string;
  note: string | null;
  rules: Rule[];
  clear_space_px: number | null;
}
export interface GuidelineSlide {
  kind: 'guideline';
  title: string;
  file: string;
  format: string;
  width: number | null | undefined;
  height: number | null | undefined;
  background: string;
  description: string | null;
  traits: string[];
  do: string[];
  dont: string[];
  source: string | null;
  local: string | null | undefined;
  layout?: Layout;
}
export interface GridSlide {
  kind: 'grid';
  title: string;
  cols: number;
  rows: number;
  figures: Figure[];
}
export interface FaviconViewSlide {
  kind: 'favicon-view';
  title: string;
  base: string;
  file: string;
  width: number;
  height: number;
  note: string | null;
}
export interface FaviconFilesSlide {
  kind: 'favicon-files';
  title: string;
  rows: { file: string; size: string; use: string }[];
  /** The head snippet and the set's colours, when they fit under the table; otherwise a slide of their own follows. */
  head?: string[];
  colors?: Record<string, string>;
}
export interface FaviconHeadSlide {
  kind: 'favicon-head';
  title: string;
  head: string[];
  colors: Record<string, string>;
}

export type Slide =
  | CoverSlide
  | ContentsSlide
  | PageSlide
  | ColorsSlide
  | GradientsSlide
  | FontsSlide
  | TypeScaleSlide
  | LogoSlide
  | GuidelineSlide
  | GridSlide
  | FaviconViewSlide
  | FaviconFilesSlide
  | FaviconHeadSlide;

export interface GuideContent {
  description: string | null;
  traits: string[];
  do: string[];
  dont: string[];
}
export type GuideRole = 'text' | 'bullet' | 'item' | 'label';
export type GuideOp = [GuideRole, number, number, string];
