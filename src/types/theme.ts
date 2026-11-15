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

/** The semantic variables shadcn/ui components read (`--background`, `--chart-1`, ...), without the leading dashes. */
export const SHADCN_VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'radius',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

export type ShadcnVariable = (typeof SHADCN_VARIABLES)[number];
