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
    const cw = c.asset === undefined ? undefined : colorways.find((w) => w.on === background?.path && w.asset === c.asset);
    const min = CONTRAST_MINIMUM[cw?.min ?? DEFAULT_COLORWAY_LEVEL];
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

/** The configured logo files and the other `logos` assets that state an ink, as candidates; a configured file is judged as its sidecar's ink, else black on light and white on dark */
export function logoCandidatesOf(data: BlazonData, files: LogoFiles): { configured: Candidate[]; others: Candidate[] } {
  const logo = data.logo;
  const configured = (['onLight', 'onDark'] as const).flatMap((variant): Candidate[] => {
    const file = files.variant(variant);
    const found = variant === 'onLight' ? logo?.onLight : logo?.onDark;
    if (!file || !found) return [];
    const asset = variant === 'onLight' ? logo?.onLightAsset : logo?.onDarkAsset;
    const ink = (variant === 'onLight' ? logo?.onLightInk : logo?.onDarkInk) ?? (variant === 'onLight' ? '#000000' : '#ffffff');
    return [{ file, asset, names: asset ? [variant, asset] : [variant], ink, configured: true }];
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

export interface Selection {
  winner: LogoChosen | undefined;
  denied: Judged['denied'];
  weak: string[];
}

/**
 * The one choice of a logo for a surface, which `pickLogo` makes for a background token and the viewer makes for a paint: the configured files
 * first, with a lockup both compete with the other assets, without one the assets that declare an ink are a second try. `logo.deny`, the
 * colorways' bars and the shared contrast measure decide, and the highest ratio wins, a tie to the configured file.
 */
export function selectLogo(
  data: BlazonData,
  input: { background: TokenItem | undefined; ratioOn: (ink: string) => number | undefined; files: LogoFiles; lockup?: string },
): Selection {
  const { background, ratioOn, files, lockup } = input;
  const { configured, others } = logoCandidatesOf(data, files);
  const lockupOf = (id: string) => data.assets.logos.find((a) => a.id === id)?.meta?.lockup;
  const withLockup = (list: Candidate[]) => (lockup === undefined ? list : list.filter((c) => c.asset !== undefined && lockupOf(c.asset) === lockup));
  const colorways: BarColorway[] = data.assets.logos.flatMap((owner) => (owner.meta?.colorways ?? []).map((cw) => ({ ...cw, asset: cw.variant ?? owner.id })));
  const denied: Judged['denied'] = [];
  const weak: string[] = [];
  const judge = (list: Candidate[]): Judged['chosen'] => {
    const result = judgeLogos({ background, items: data.tokens.items, ratioOn, candidates: list, colorways });
    denied.push(...result.denied);
    weak.push(...result.weak);
    return result.chosen;
  };
  const pool = lockup === undefined ? judge(configured) : judge([...withLockup(configured), ...withLockup(others)]);
  const winner = bestOf(pool.length > 0 || lockup !== undefined ? pool : judge(others.filter((c) => c.declared)));
  if (!winner) return { winner: undefined, denied, weak };
  const { configured: _configured, ...rest } = winner;
  return { winner: rest, denied, weak };
}
