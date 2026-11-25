import path from 'node:path';
import type { BlazonConfig, BlazonData } from '../../types/index.js';
import { assetSourcePath, categoryDirs } from '../assets/categories.js';
import { representationsOf } from '../assets/representations.js';
import { contrastBetween, parseColor, ratioMessage } from '../checker/contrast.js';
import { logoPaths } from '../logo.js';
import { LookupError, findToken } from '../read/lookup.js';
import { ratioOnColor, selectLogo, type LogoFiles } from './judge.js';

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
  const paths = logoPaths(config);
  const files: LogoFiles = {
    variant: (variant) => {
      const file = paths[variant];
      return file ? path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/') : undefined;
    },
    asset: (id) => {
      const first = representationsOf(data.assets.logos, id)[0];
      return (
        first &&
        path
          .relative(cwd, assetSourcePath(first, assetsDir, dirs))
          .split(path.sep)
          .join('/')
      );
    },
  };
  const { winner, denied, weak } = selectLogo(data, { background, ratioOn: ratioOnColor(bg), files, lockup });
  if (winner) return { ...winner, ratio: Number(ratioMessage(winner.ratio)) };
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
