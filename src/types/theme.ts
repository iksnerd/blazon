/** Viewer roles the brand book takes from the brand's own tokens. */
export type ThemeRole =
  | 'background'
  | 'canvas'
  | 'text'
  | 'muted'
  | 'border'
  | 'accent'
  | 'accentText'
  | 'inverse'
  | 'inverseText'
  | 'fontDisplay'
  | 'fontBody'
  /** The monospace typeface of code, labels and values */
  | 'fontMono'
  /** Corner radius of the viewer's own surfaces (cards, inputs, menus) */
  | 'radius';

export type BrandTheme = Partial<Record<ThemeRole, string>>;

export interface LogoSet {
  onLight: string;
  onDark?: string;
  /** The id of the `logos` asset that `onLight` is, when it is one (matched by file, not by content) */
  onLightAsset?: string;
  onDarkAsset?: string;
  /** The ink that asset's sidecar declares, as a CSS color. Absent: the file is judged as black on light (`onLight`) or white on dark (`onDark`) */
  onLightInk?: string;
  onDarkInk?: string;
}
