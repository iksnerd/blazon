import path from 'node:path';
import type { AssetMeta, BlazonConfig, BlazonData } from '../../types/index.js';
import { assetSourcePath, categoryDirs } from '../assets/categories.js';
import { representationsOf } from '../assets/representations.js';
import { logoPaths, sameFile } from '../logo.js';
import { ruleEntries } from './rules.js';

export interface LogoVariant {
  variant: 'onLight' | 'onDark';
  /** As the config names it, from the project root */
  file: string;
  /** Whether blazon could read the file */
  found: boolean;
  /** The `logos` asset this file is, when it is one */
  asset?: string;
  /** The color the asset's sidecar declares for it; without one a reader judges the file as black on light or white on dark */
  ink?: string;
}

export interface LogoAsset {
  id: string;
  /** Every file of the id, from the project root, in the default order of its representations (RFC 0001 section 12): the first is the one a reader without a preference takes */
  files: string[];
  /** The configured variants that use one of these files */
  variants: ('onLight' | 'onDark')[];
  /** What the sidecar says, as brand.json carries it: clearSpace, minSize, maxSize, replacedBelow, lockup, placement, partnership, initiative, unit, ink, background, do, dont */
  rules: AssetMeta;
}

export interface LogoDescription {
  variants: LogoVariant[];
  assets: LogoAsset[];
  /** Backgrounds that forbid a logo variant, whatever their contrast: the token or group, the variants and the reason */
  forbidden: { at: string; deny: string[]; reason?: string }[];
}

/** The configured logo variants, each logo asset with the rules of its sidecar, and the backgrounds that forbid a variant. */
export function describeLogo(data: BlazonData, config: BlazonConfig, cwd: string): LogoDescription {
  const paths = logoPaths(config);
  const assetsDir = path.resolve(cwd, config.assetsDir);
  const dirs = categoryDirs(config.assets, cwd);
  const fileOf = (asset: BlazonData['assets']['logos'][number]) =>
    path
      .relative(cwd, assetSourcePath(asset, assetsDir, dirs))
      .split(path.sep)
      .join('/');
  const variants = (['onLight', 'onDark'] as const).flatMap((variant): LogoVariant[] => {
    const file = paths[variant];
    if (!file) return [];
    const asset = variant === 'onLight' ? data.logo?.onLightAsset : data.logo?.onDarkAsset;
    const ink = variant === 'onLight' ? data.logo?.onLightInk : data.logo?.onDarkInk;
    return [{ variant, file, found: Boolean(variant === 'onLight' ? data.logo?.onLight : data.logo?.onDark), ...(asset && { asset }), ...(ink && { ink }) }];
  });
  // one entry for an id: its files are its representations, and its sidecar is one
  const ids = [...new Set(data.assets.logos.map((asset) => asset.id))];
  const assets = ids.map((id): LogoAsset => {
    const records = representationsOf(data.assets.logos, id);
    const sources = records.map((asset) => assetSourcePath(asset, assetsDir, dirs));
    return {
      id,
      files: records.map(fileOf),
      variants: variants.filter((v) => (paths[v.variant] ? sources.some((source) => sameFile(path.resolve(cwd, paths[v.variant]!), source)) : false)).map((v) => v.variant),
      rules: records[0]!.meta ?? {},
    };
  });
  const forbidden = ruleEntries(data, '').flatMap((entry) =>
    entry.logo ? [{ at: entry.at, deny: entry.logo.deny, ...(entry.logo.reason && { reason: entry.logo.reason }) }] : [],
  );
  return { variants, assets, forbidden };
}
