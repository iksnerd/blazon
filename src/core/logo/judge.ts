import { CONTRAST_MINIMUM, contrastBetween, parseColor, ratioMessage } from '../checker/contrast.js';
import { logoDenialUnder, type LogoRuleItem } from '../checker/logo-rules.js';
import { DEFAULT_COLORWAY_LEVEL } from './colorways.js';
import type { Asset, BlazonData, TokenItem } from '../../types/index.js';
import { inkOf } from './colorways.js';
import type { LogoChosen } from './pick.js';

// The judging step of `pickLogo`, on its own so a reader of brand.json (a plugin) can run the same rule on the tokens it holds.

export interface Candidate {
  file: string;
  asset: string | undefined;
  /** Every name a `logo.deny` may call it */
  names: string[];
  ink: string;
  configured: boolean;
  /** The sidecar states an `ink` (and not only the background it is made for) */
  declared?: boolean;
}

/** The shape of a background that `judgeLogos` reads: a token of core's data or of brand.json */
export interface LogoBackground {
  path: string;
  type?: string;
  value: unknown;
  aliasOf?: string;
  blazon?: { logo?: { deny?: string[]; reason?: string } };
}

/** A colorway as `pickLogo` reads it: the asset it draws, the background it names and the level it must reach */
export interface BarColorway {
  name: string;
  on: string;
  asset: string;
  min?: keyof typeof CONTRAST_MINIMUM;
}

type Chosen = LogoChosen & { configured: boolean };
export interface Judged {
  chosen: Chosen[];
  denied: { name: string; from: string; reason?: string; file: string }[];
  weak: string[];
}

/** The colorway that names this background for this asset, when there is one, and the ratio the logo must reach there: its level, else AA-large (3:1) */
function barOf(asset: string | undefined, on: string | undefined, colorways: readonly BarColorway[]): { cw: BarColorway | undefined; min: number } {
  const cw = asset === undefined ? undefined : colorways.find((w) => w.on === on && w.asset === asset);
  return { cw, min: CONTRAST_MINIMUM[cw?.min ?? DEFAULT_COLORWAY_LEVEL] };
}

/**
 * Judges candidates on one background, as `pickLogo` does and as a plugin that holds brand.json must: a `logo.deny` on the background (or a token it
 * aliases) removes a candidate, the rest need the shared contrast measure to reach the bar, which a colorway naming this background for the logo may set.
 * Pure: the caller passes the background's color and the tokens the deny rule is looked up in.
 */
export function judgeLogos(input: {
  background: LogoBackground | undefined;
  items: readonly LogoRuleItem[];
  /** The contrast of a logo's ink on the surface, or undefined when it cannot be measured: `ratioOnColor` for a color, `paintContrast` for a gradient */
  ratioOn: (ink: string) => number | undefined;
  candidates: Candidate[];
  colorways: readonly BarColorway[];
}): Judged {
  const { background, items, ratioOn, candidates, colorways } = input;
  const out: Judged = { chosen: [], denied: [], weak: [] };
  for (const c of candidates) {
    const denial = background ? logoDenialUnder(background, items, c.names) : undefined;
    if (denial) {
      out.denied.push({ name: denial.name, from: denial.path, ...(denial.reason && { reason: denial.reason }), file: c.file });
      continue;
    }
    const { cw, min } = barOf(c.asset, background?.path, colorways);
    const ratio = ratioOn(c.ink);
    if (ratio === undefined || ratio < min) {
      out.weak.push(`${c.asset ?? c.file} ${ratio === undefined ? 'cannot be measured' : `${ratioMessage(ratio)}:1, below ${min}:1`}`);
      continue;
    }
    out.chosen.push({ file: c.file, asset: c.asset ?? c.file, ratio, min, ...(cw && { colorway: cw.name }), configured: c.configured });
  }
  return out;
}

/** The highest ratio; a tie goes to the configured file, and the list is already in asset order */
/** The ratio of an ink on an opaque, measurable color, by the shared measure */
export const ratioOnColor =
  (bg: NonNullable<ReturnType<typeof parseColor>>) =>
  (ink: string): number | undefined => {
    const fg = parseColor(ink);
    return fg ? contrastBetween(fg, bg) : undefined;
  };

export function bestOf<T extends { ratio: number; configured: boolean }>(list: readonly T[]): T | undefined {
  return list.reduce<T | undefined>((top, c) => (!top || c.ratio > top.ratio || (c.ratio === top.ratio && c.configured && !top.configured) ? c : top), undefined);
}

/** Where a candidate's file is, as the caller needs it: a project path for the CLI, the URL or data URI the viewer shows */
export interface LogoFiles {
  /** The file of a configured variant, or undefined when it has none */
  variant: (variant: 'onLight' | 'onDark') => string | undefined;
  /** The file of a `logos` asset id */
  asset: (id: string) => string | undefined;
}

/** The configured logo files and the other `logos` assets that state an ink, as candidates; a configured file is judged as its sidecar's ink, else black on light and white on dark. `declared` marks a candidate whose sidecar states an `ink` */
export function logoCandidatesOf(data: BlazonData, files: LogoFiles): { configured: Candidate[]; others: Candidate[] } {
  const logo = data.logo;
  const configured = (['onLight', 'onDark'] as const).flatMap((variant): Candidate[] => {
    const file = files.variant(variant);
    const found = variant === 'onLight' ? logo?.onLight : logo?.onDark;
    if (!file || !found) return [];
    const asset = variant === 'onLight' ? logo?.onLightAsset : logo?.onDarkAsset;
    const declared = variant === 'onLight' ? logo?.onLightInk : logo?.onDarkInk;
    const ink = declared ?? (variant === 'onLight' ? '#000000' : '#ffffff');
    return [{ file, asset, names: asset ? [variant, asset] : [variant], ink, configured: true, declared: Boolean(declared) }];
  });
  const taken = new Set(configured.flatMap((c) => (c.asset ? [c.asset] : [])));
  const others = [...new Set(data.assets.logos.map((a) => a.id))].sort().flatMap((id): Candidate[] => {
    const record: Asset | undefined = data.assets.logos.find((a) => a.id === id);
    const ink = record && inkOf(record);
    const file = files.asset(id);
    return taken.has(id) || !ink || !file ? [] : [{ file, asset: id, names: [id], ink, configured: false, declared: Boolean(record?.meta?.ink) }];
  });
  return { configured, others };
}

/** Of the plain configured files that reached the bar, `onDark` if it did, else `onLight` */
function darkSurfaceFirst<T extends { file: string }>(reached: readonly T[], configured: readonly Candidate[]): T | undefined {
  const fileOf = (variant: string) => configured.find((c) => c.names[0] === variant)?.file;
  return reached.find((c) => c.file === fileOf('onDark')) ?? reached.find((c) => c.file === fileOf('onLight'));
}

export interface Selection {
  winner: LogoChosen | undefined;
  denied: Judged['denied'];
  weak: string[];
}

/**
 * The one choice of a logo for a surface, which `pickLogo` makes for a background token and the viewer makes for a paint. `logo.deny`, the
 * colorways' bars and the shared contrast measure decide. Without a lockup, the candidates that declare an ink (an asset's sidecar `ink`,
 * a configured file's included) come first and the highest ratio wins, a tie to the configured file; only when none reaches the bar are the
 * configured files with no declared ink are judged, as white (`onDark`) and black (`onLight`): `onDark` is used wherever it reaches the bar, else
 * `onLight` if it does, so the dark-surface variant wins over a higher ratio. With a lockup, the assets of that lockup compete together.
 */
export function selectLogo(data: BlazonData, input: SelectInput): Selection {
  return select(data, input, true);
}

/**
 * Rule 1 of `selectLogo` on its own, for a caller that states the plain files' choice itself (the viewer's `dark` flag): only the candidates
 * that declare an ink compete, under `logo.deny` and the colorways' bars, the highest ratio winning and a tie going to the configured file.
 * A lockup is not read here; `selectLogo` handles it.
 */
export function selectInkedLogo(data: BlazonData, input: Omit<SelectInput, 'lockup'>): Selection {
  return select(data, input, false);
}

interface SelectInput {
  background: TokenItem | undefined;
  ratioOn: (ink: string) => number | undefined;
  files: LogoFiles;
  lockup?: string;
}

function select(data: BlazonData, input: SelectInput, plain: boolean): Selection {
  const { background, ratioOn, files, lockup } = input;
  const { configured, others } = logoCandidatesOf(data, files);
  const lockupOf = (id: string) => data.assets.logos.find((a) => a.id === id)?.meta?.lockup;
  const colorways: BarColorway[] = data.assets.logos.flatMap((owner) => (owner.meta?.colorways ?? []).map((cw) => ({ ...cw, asset: cw.variant ?? owner.id })));
  return chooseLogo({ background, items: data.tokens.items, ratioOn, configured, others, colorways, lockupOf, ...(lockup !== undefined && { lockup }), plain });
}

export interface ChooseInput {
  background: LogoBackground | undefined;
  items: readonly LogoRuleItem[];
  ratioOn: (ink: string) => number | undefined;
  /** The configured files (`logo.onLight`, `logo.onDark`) as candidates, and the other `logos` assets that state an ink */
  configured: Candidate[];
  others: Candidate[];
  colorways: readonly BarColorway[];
  /** The lockup of an asset id, and the lockup that is asked for: then the assets of that lockup compete together */
  lockupOf?: (id: string) => string | undefined;
  lockup?: string;
  /** Whether the plain configured files are judged when no declared ink reaches the bar */
  plain: boolean;
}

/**
 * The order itself, on candidates the caller has built: `selectLogo` builds them from core's data, and a plugin that reads brand.json builds them from
 * what it holds. Declared inks first (the highest ratio, a tie to the configured file), then, when `plain`, the dark-surface file wherever it reaches
 * the bar, else the light-surface one. With a lockup, the assets of that lockup compete together.
 */
export function chooseLogo(input: ChooseInput): Selection {
  const { background, items, ratioOn, configured, others, colorways, lockupOf, lockup, plain } = input;
  const withLockup = (list: Candidate[]) => (lockup === undefined ? list : list.filter((c) => c.asset !== undefined && lockupOf?.(c.asset) === lockup));
  const denied: Judged['denied'] = [];
  const weak: string[] = [];
  const judge = (list: Candidate[]): Judged['chosen'] => {
    const result = judgeLogos({ background, items, ratioOn, candidates: list, colorways });
    denied.push(...result.denied);
    weak.push(...result.weak);
    return result.chosen;
  };
  const winner =
    lockup !== undefined
      ? bestOf(judge([...withLockup(configured), ...withLockup(others)]))
      : (bestOf(judge([...configured, ...others].filter((c) => c.declared))) ?? (plain ? darkSurfaceFirst(judge(configured.filter((c) => !c.declared)), configured) : undefined));
  if (!winner) return { winner: undefined, denied, weak };
  const { configured: _configured, ...rest } = winner;
  return { winner: rest, denied, weak };
}

/**
 * Whether a background is one the dark-surface artwork (`onDark`, white) is made for: white reaches the bar there. The bar is the level of a colorway that
 * names this background for the `onDark` asset, else 3:1: the same bar `selectLogo` holds the plain `onDark` file to, so a viewer that states a surface as
 * dark and `blazon logo --on` agree. It does not read `logo.deny`: a surface is dark or light whether or not the brand allows a logo on it.
 */
export function darkSurfaceOn(
  data: Pick<BlazonData, 'logo' | 'assets'>,
  input: { background: Pick<TokenItem, 'path'> | undefined; ratioOn: (ink: string) => number | undefined },
): boolean {
  const colorways: BarColorway[] = data.assets.logos.flatMap((owner) => (owner.meta?.colorways ?? []).map((cw) => ({ ...cw, asset: cw.variant ?? owner.id })));
  const { min } = barOf(data.logo?.onDarkAsset, input.background?.path, colorways);
  const ratio = input.ratioOn('#ffffff');
  return ratio !== undefined && ratio >= min;
}
