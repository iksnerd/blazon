import type { Asset, AssetRules, DocItem, Finding, BlazonData, GroupMeta, ThemeRole, TokenItem } from '../../types/index.js';
import { blackContrast, contrastBetween, GRAPHIC_CONTRAST, whiteContrast } from './theme/color';
import { humanize, parentOf } from './tokens/format';
import { logoDenialUnder } from '../../core/checker/logo-rules.js';

/** Token types shown on the Motion page and on the Strokes & effects page. */
export const MOTION_TYPES: readonly string[] = ['duration', 'cubicBezier', 'transition'];
export const EFFECT_TYPES: readonly string[] = ['strokeStyle', 'border', 'shadow', 'number'];

export const TOKEN_PAGES = [
  { hash: '#tokens/colors', label: 'Colors', has: (t: TokenItem) => t.type === 'color' || t.type === 'gradient' },
  { hash: '#tokens/typography', label: 'Typography', has: (t: TokenItem) => ['typography', 'fontFamily', 'fontWeight'].includes(t.type ?? '') },
  { hash: '#tokens/dimensions', label: 'Dimensions', has: (t: TokenItem) => t.type === 'dimension' && !t.path.startsWith('font.') },
  { hash: '#tokens/motion', label: 'Motion', has: (t: TokenItem) => MOTION_TYPES.includes(t.type ?? '') },
  { hash: '#tokens/effects', label: 'Strokes & effects', has: (t: TokenItem) => EFFECT_TYPES.includes(t.type ?? '') },
] as const;

export function defaultHash(data: BlazonData): string {
  return data.docs[0] ? `#doc/${data.docs[0].slug}` : '#tokens/colors';
}

export function docGroup(doc: DocItem): string {
  return typeof doc.meta.group === 'string' ? doc.meta.group : 'Guidelines';
}

export function docGroups(data: BlazonData): [string, DocItem[]][] {
  const groups = new Map<string, DocItem[]>();
  for (const doc of data.docs) groups.set(docGroup(doc), [...(groups.get(docGroup(doc)) ?? []), doc]);
  return [...groups.entries()];
}

export interface AssetCategoryView {
  category: string;
  label: string;
  description?: string;
  rules?: AssetRules;
  notSpecified?: string[];
  source?: { doc: string; locator: string };
  /** Explorations: labelled in the book, and not findings */
  experimental?: true;
  /** Kept for comparison, or supplied by someone else: labelled in the book, and not findings */
  reference?: true;
  assets: Asset[];
}

/**
 * The asset categories that have files, as the sidebar and the asset pages show them. When core sends
 * `assetCategories` (from the config's `assets` block), its labels, descriptions and order win, and a
 * category it does not list follows, by label. Without it: folder names, logos and icons first.
 */
export function assetCategories(data: BlazonData): AssetCategoryView[] {
  const custom = Object.entries(data.assets.custom).map(([category, assets]) => ({ category, label: humanize(category), assets }));
  const folders: AssetCategoryView[] = [
    { category: 'logos', label: 'Logos', assets: data.assets.logos },
    { category: 'icons', label: 'Icons', assets: data.assets.icons },
    ...custom,
  ].filter((c) => c.assets.length > 0);
  const listed = data.assetCategories;
  if (!listed) return folders;

  const byCategory = new Map(listed.map((info, index) => [info.category, { info, index }]));
  return folders
    .map((folder) => {
      const info = byCategory.get(folder.category)?.info;
      if (!info) return folder;
      const { label, description, rules, notSpecified, source, experimental, reference } = info;
      return {
        ...folder,
        label,
        ...(description && { description }),
        ...(rules && { rules }),
        ...(notSpecified && { notSpecified }),
        ...(source && { source }),
        ...(experimental && { experimental }),
        ...(reference && { reference }),
      };
    })
    .sort((a, b) => {
      const ia = byCategory.get(a.category)?.index ?? Infinity;
      const ib = byCategory.get(b.category)?.index ?? Infinity;
      return ia !== ib ? ia - ib : a.label.localeCompare(b.label);
    });
}

/** What a category is when it is not the live identity: explorations, or material kept for comparison (RFC 0001 §11). Neither, for an ordinary one. */
export type CategoryKind = 'experiment' | 'reference';

export const categoryKind = (category: { experimental?: boolean; reference?: boolean }): CategoryKind | undefined =>
  category.experimental === true ? 'experiment' : category.reference === true ? 'reference' : undefined;

/** The kind of the asset's category: a directive that draws the asset labels it. */
export function assetKind(data: BlazonData, asset: Asset): CategoryKind | undefined {
  const category = data.assetCategories?.find((c) => c.category === asset.category);
  return category ? categoryKind(category) : undefined;
}

/** The logo variant for a background, per primary usage: dark artwork on light, light artwork on dark. */
export function logoFor(data: BlazonData, background: 'light' | 'dark'): string | undefined {
  if (!data.logo) return undefined;
  return background === 'dark' ? data.logo.onDark : data.logo.onLight;
}

/** The token that fills a theme role (`background`, `inverse`, `accent`), when the brand maps it. */
export function themeRoleToken(data: BlazonData, role: ThemeRole): TokenItem | undefined {
  const path = data.themeTokens?.[role];
  return path ? data.tokens.items.find((t) => t.path === path) : undefined;
}

/** Whether `logo.deny` forbids a configured variant on a background token, under the variant name or the id of the asset it is. */
export function logoDeniedOn(data: BlazonData, token: TokenItem | undefined, variant: 'onLight' | 'onDark'): boolean {
  if (!token) return false;
  const asset = variant === 'onLight' ? data.logo?.onLightAsset : data.logo?.onDarkAsset;
  return Boolean(logoDenialUnder(token, data.tokens.items, asset ? [variant, asset] : [variant]));
}

/** A logo asset whose sidecar declares the artwork's `ink`, as a candidate for a background. */
export interface InkedLogo {
  name: string;
  src: string;
  ink: string;
}

/** The `logos` assets that declare an `ink`. */
export function inkedLogos(data: BlazonData): InkedLogo[] {
  return data.assets.logos.flatMap((asset) => (asset.meta?.ink ? [{ name: asset.id, src: asset.url, ink: asset.meta.ink }] : []));
}

/** A logo as `blazon:logo-contrast` judges it: the file, the names a `logo.deny` rule may call it, and its contrast on a paint. */
export interface LogoCandidate {
  /** `onLight` or `onDark` for a configured file, else the asset id */
  name: string;
  /** Every name `logo.deny` may use for this file: its variant name, and its asset id when it is one */
  names: string[];
  src: string;
  ratio: (paint: string) => number | undefined;
}

/**
 * The logos the contrast grid lists, once each. A configured file is judged as the ink its sidecar declares,
 * and as black (`onLight`) or white (`onDark`) when it declares none. A `logos` asset that declares an ink
 * and is not a configured file follows as a row of its own.
 */
export function logoCandidates(data: BlazonData): LogoCandidate[] {
  const logo = data.logo;
  if (!logo) return [];
  const configured = (name: string, src: string | undefined, asset: string | undefined, ink: string | undefined, plain: LogoCandidate['ratio']): LogoCandidate[] =>
    src ? [{ name, names: asset ? [name, asset] : [name], src, ratio: ink ? (paint) => contrastBetween(ink, paint) : plain }] : [];
  const taken = new Set([logo.onLightAsset, logo.onDarkAsset]);
  return [
    ...configured('onLight', logo.onLight, logo.onLightAsset, logo.onLightInk, blackContrast),
    ...configured('onDark', logo.onDark, logo.onDarkAsset, logo.onDarkInk, whiteContrast),
    ...inkedLogos(data)
      .filter((v) => !taken.has(v.name))
      .map((v): LogoCandidate => ({ name: v.name, names: [v.name], src: v.src, ratio: (paint) => contrastBetween(v.ink, paint) })),
  ];
}

/**
 * The logo for a paint (a color or gradient). `dark` says which configured variant would stand on it
 * today: onDark when true, onLight when false, the other one when the brand has only one (unless
 * `fallback` is false). A logo asset that declares an `ink` replaces that pick when its ink reaches
 * graphic contrast (3:1) on the paint, the highest contrast winning among several. A configured file
 * is one of those candidates when its sidecar declares an ink, and is otherwise assumed black or white,
 * which cannot be beaten by ratio, so a brand's own color is used wherever it reads. With no declared
 * ink, or none that reads, the result is the pick.
 *
 * `background` is the token the paint comes from. A logo its `logo.deny` rule forbids, under the variant name or the asset id, is never
 * chosen: not as a candidate, and not as the pick, which then gives nothing. `blazon logo --on` applies the same rule (`pickLogo`).
 */
export function logoOn(data: BlazonData, paint: string | undefined, dark: boolean, fallback = true, background?: TokenItem): string | undefined {
  const logo = data.logo;
  const variant = fallback ? (dark ? (logo?.onDark ? 'onDark' : 'onLight') : logo?.onLight ? 'onLight' : 'onDark') : dark ? 'onDark' : 'onLight';
  const picked = logo?.[variant] && !logoDeniedOn(data, background, variant) ? logo[variant] : undefined;
  if (paint === undefined) return picked;
  const denied = (name: string) =>
    Boolean(background && logoDenialUnder(background, data.tokens.items, name === logo?.onLightAsset ? ['onLight', name] : name === logo?.onDarkAsset ? ['onDark', name] : [name]));
  const best = inkedLogos(data)
    .filter((candidate) => !denied(candidate.name))
    .map((candidate) => ({ candidate, ratio: contrastBetween(candidate.ink, paint) }))
    .filter((c): c is { candidate: InkedLogo; ratio: number } => c.ratio !== undefined && c.ratio >= GRAPHIC_CONTRAST)
    .sort((a, b) => b.ratio - a.ratio)[0];
  return best?.candidate.src ?? picked;
}

/**
 * Whether a theme background is dark, judged first by the text color the brand pairs with it (light
 * text means a dark background), then by white reaching graphic contrast (3:1) on the background itself.
 * A role the brand does not map is the viewer's default, which is dark for the accent and the inverse.
 */
export function isDarkBackground(background: string | undefined, ink: string | undefined): boolean {
  if (ink) {
    const onWhite = blackContrast(ink);
    const onBlack = whiteContrast(ink);
    if (onWhite !== undefined && onBlack !== undefined) return onWhite > onBlack;
  }
  const white = background ? whiteContrast(background) : undefined;
  return white === undefined ? true : white >= 3;
}

/** The findings on a token, plus a `review-pending` on a group above it: a flagged group is listed once on the Review page, and its tokens still show the flag. */
export function findingsFor(data: BlazonData, path: string): Finding[] {
  const above = new Set<string>();
  // A token with a review of its own (even `ok`) is not covered by the group
  if (data.tokens.items.find((t) => t.path === path)?.blazon.review) return data.findings.filter((f) => f.path === path);
  for (let at = parentOf(path); at; at = parentOf(at)) above.add(at);
  return data.findings.filter((f) => f.path === path || (f.code === 'review-pending' && above.has(f.path)));
}

/** The nearest group, from the token's parent upwards, that has a description. */
export function groupMetaFor(data: BlazonData, path: string): GroupMeta | undefined {
  for (let at = path; at; at = parentOf(at)) {
    const meta = data.tokens.groupMeta.find((g) => g.path === at && g.description);
    if (meta) return meta;
  }
  return undefined;
}

export function search(data: BlazonData, query: string): { tokens: TokenItem[]; docs: DocItem[] } {
  const q = query.trim().toLowerCase();
  return {
    tokens: data.tokens.items.filter((t) => t.path.toLowerCase().includes(q) || String(t.value).toLowerCase().includes(q) || t.cssVariable.includes(q)),
    docs: data.docs.filter((d) => d.title.toLowerCase().includes(q) || d.markdown.toLowerCase().includes(q)),
  };
}
