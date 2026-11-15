import path from 'node:path';
import type { AssetMeta, BlazonConfig, BlazonData } from '../../types/index.js';
import { assetSourcePath, categoryDirs } from '../assets/categories.js';
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
  /** From the project root */
  file: string;
  /** The configured variants that use this file */
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
  const assets = data.assets.logos.map((asset): LogoAsset => {
    const source = assetSourcePath(asset, assetsDir, dirs);
    return {
      id: asset.id,
      file: fileOf(asset),
      variants: variants.filter((v) => (paths[v.variant] ? sameFile(path.resolve(cwd, paths[v.variant]!), source) : false)).map((v) => v.variant),
      rules: asset.meta ?? {},
    };
  });
  const forbidden = ruleEntries(data, '').flatMap((entry) =>
    entry.logo ? [{ at: entry.at, deny: entry.logo.deny, ...(entry.logo.reason && { reason: entry.logo.reason }) }] : [],
  );
  return { variants, assets, forbidden };
}
