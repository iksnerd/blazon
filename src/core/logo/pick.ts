import path from 'node:path';
import type { BlazonConfig, BlazonData } from '../../types/index.js';
import { assetSourcePath, categoryDirs } from '../assets/categories.js';
import { representationsOf } from '../assets/representations.js';
import { logoDenialUnder } from '../checker/logo-rules.js';
import { CONTRAST_MINIMUM, contrastBetween, parseColor, ratioMessage } from '../checker/contrast.js';
import { logoPaths } from '../logo.js';
import { LookupError, findToken } from '../read/lookup.js';
import { DEFAULT_COLORWAY_LEVEL, inkOf } from './colorways.js';

// The one rule that picks a logo for a surface. The viewer, the checker, the CLI and the MCP ask here, so a `logo.deny` is honoured wherever
// a logo is chosen, and the ratio is the shared measure (`contrastBetween`) that `blazon check` and `blazon can` use.

export interface LogoChosen {
  /** The file, from the project root */
  file: string;
  /** The logo asset's id */
  asset: string;
  /** The contrast of the logo's ink on the background, two decimals (floored) */
  ratio: number;
  /** The ratio the pick had to reach: the colorway's level, else AA-large (3:1) */
  min: number;
  /** The colorway that named this background for this logo, when one did */
  colorway?: string;
}

export interface LogoRefused {
  refused: {
    /** `deny`: the brand forbids every logo that would read. `contrast`: none reaches the bar. `unknown`: the background cannot be measured */
    rule: 'deny' | 'contrast' | 'unknown';
    /** The token the reason is about: the one that states the deny rule, else the background */
    from: string;
    reason: string;
  };
}

export type LogoPick = LogoChosen | LogoRefused;

export interface PickOptions {
  /** The background token path */
  on: string;
  /** Only the logo assets whose sidecar `lockup` is this one */
  lockup?: string;
}

interface Candidate {
  file: string;
  asset: string | undefined;
  /** Every name a `logo.deny` may call it */
  names: string[];
  ink: string;
  configured: boolean;
  /** The sidecar states an `ink` (and not only the background it is made for) */
  declared?: boolean;
}

/** The logo for a background token. Throws a LookupError for a token that is not there or a lockup that is not in the vocabulary. */
export function pickLogo(data: BlazonData, config: BlazonConfig, cwd: string, { on, lockup }: PickOptions): LogoPick {
  const background = findToken(data, on);
  if (lockup !== undefined && !data.vocabulary.lockups.includes(lockup)) {
    throw new LookupError(`no lockup "${lockup}"; the lockups are ${data.vocabulary.lockups.join(', ')}`);
  }
  const bg = background.type === 'color' ? parseColor(String(background.value)) : undefined;
  const unknown = (why: string): LogoRefused => ({ refused: { rule: 'unknown', from: background.path, reason: `${background.path} ${why}, so no logo can be measured on it` } });
  if (!bg) return unknown(`is a ${background.type} and not a color`);
  if (contrastBetween(bg, bg) === undefined) return unknown('is translucent');

  const assetsDir = path.resolve(cwd, config.assetsDir);
  const dirs = categoryDirs(config.assets, cwd);
  const fileOf = (id: string): string | undefined => {
    const first = representationsOf(data.assets.logos, id)[0];
    return (
      first &&
      path
        .relative(cwd, assetSourcePath(first, assetsDir, dirs))
        .split(path.sep)
        .join('/')
    );
  };
  const lockupOf = (id: string) => data.assets.logos.find((a) => a.id === id)?.meta?.lockup;

  // The configured files, judged as the ink their sidecar declares, else as black on light and white on dark
  const paths = logoPaths(config);
  const logo = data.logo;
  const configured: Candidate[] = (['onLight', 'onDark'] as const).flatMap((variant): Candidate[] => {
    const file = paths[variant];
    const found = variant === 'onLight' ? logo?.onLight : logo?.onDark;
    if (!file || !found) return [];
    const asset = variant === 'onLight' ? logo?.onLightAsset : logo?.onDarkAsset;
    const ink = (variant === 'onLight' ? logo?.onLightInk : logo?.onDarkInk) ?? (variant === 'onLight' ? '#000000' : '#ffffff');
    return [{ file: path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/'), asset, names: asset ? [variant, asset] : [variant], ink, configured: true }];
  });
  const taken = new Set(configured.flatMap((c) => (c.asset ? [c.asset] : [])));
  const others: Candidate[] = [...new Set(data.assets.logos.map((a) => a.id))].sort().flatMap((id): Candidate[] => {
    const record = data.assets.logos.find((a) => a.id === id);
    const ink = record && inkOf(record);
    const file = fileOf(id);
    return taken.has(id) || !ink || !file ? [] : [{ file, asset: id, names: [id], ink, configured: false, declared: Boolean(record?.meta?.ink) }];
  });
  const withLockup = (list: Candidate[]) => (lockup === undefined ? list : list.filter((c) => c.asset !== undefined && lockupOf(c.asset) === lockup));

  // A colorway that names this background for a logo sets the bar for it: its own, or the variant it draws
  const colorways = data.assets.logos.flatMap((owner) => (owner.meta?.colorways ?? []).map((cw) => ({ ...cw, asset: cw.variant ?? owner.id })));
  const barOf = (c: Candidate) => {
    const cw = c.asset === undefined ? undefined : colorways.find((w) => w.on === background.path && w.asset === c.asset);
    return { min: CONTRAST_MINIMUM[cw?.min ?? DEFAULT_COLORWAY_LEVEL], ...(cw && { colorway: cw.name }) };
  };

  const denied: { name: string; from: string; reason?: string; file: string }[] = [];
  const weak: string[] = [];
  const judge = (list: Candidate[]): (LogoChosen & { configured: boolean })[] =>
    list.flatMap((c) => {
      const denial = logoDenialUnder(background, data.tokens.items, c.names);
      if (denial) {
        denied.push({ name: denial.name, from: denial.path, ...(denial.reason && { reason: denial.reason }), file: c.file });
        return [];
      }
      const fg = parseColor(c.ink);
      const ratio = fg ? contrastBetween(fg, bg) : undefined;
      const bar = barOf(c);
      if (ratio === undefined || ratio < bar.min) {
        weak.push(`${c.asset ?? c.file} ${ratio === undefined ? 'cannot be measured' : `${ratioMessage(ratio)}:1, below ${bar.min}:1`}`);
        return [];
      }
      return [{ file: c.file, asset: c.asset ?? c.file, ratio, min: bar.min, ...(bar.colorway && { colorway: bar.colorway }), configured: c.configured }];
    });
  const best = (list: (LogoChosen & { configured: boolean })[]) =>
    // the highest ratio, a tie to the configured file, the list is already in asset order
    list.reduce<(LogoChosen & { configured: boolean }) | undefined>(
      (top, c) => (!top || c.ratio > top.ratio || (c.ratio === top.ratio && c.configured && !top.configured) ? c : top),
      undefined,
    );

  // With a lockup the configured files and the other assets compete together; without one the others are a second try
  const pool = lockup === undefined ? judge(configured) : judge([...withLockup(configured), ...withLockup(others)]);
  const winner = best(pool.length > 0 || lockup !== undefined ? pool : judge(others.filter((c) => c.declared)));
  if (winner) {
    const { configured: _configured, ratio, ...rest } = winner;
    return { ...rest, ratio: Number(ratioMessage(ratio)) };
  }
  if (denied.length > 0) {
    const [first] = denied;
    const names = [...new Set(denied.map((d) => d.name))].join(', ');
    return {
      refused: {
        rule: 'deny',
        from: first!.from,
        reason: `${first!.from} forbids ${names}${first!.reason ? `: ${first!.reason}` : ''}${weak.length ? `; the others do not reach the bar (${weak.join('; ')})` : ''}`,
      },
    };
  }
  const why = weak.length > 0 ? weak.join('; ') : lockup === undefined ? 'no logo declares an ink to measure' : `no logo asset has the lockup ${lockup}`;
  return { refused: { rule: 'contrast', from: background.path, reason: `no logo reaches its bar on ${background.path}: ${why}` } };
}
