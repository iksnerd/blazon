import fs from 'node:fs';
import path from 'node:path';
import type { AssetCatalog, Finding, BlazonConfig, LogoSet } from '../types/index.js';
import { assetSourcePath, categoryDirs } from './assets/categories.js';
import { finding } from './checker/catalogue.js';
import { inProject, outsideMessage } from './confine.js';

const IMAGE_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const logoPaths = (config: BlazonConfig): { onLight?: string; onDark?: string } => (typeof config.logo === 'string' ? { onLight: config.logo } : (config.logo ?? {}));
export const logoFiles = (config: BlazonConfig): string[] => Object.values(logoPaths(config)).filter((file): file is string => Boolean(file));

/**
 * Reads the configured logo files into data URIs so the dev server and static build need no asset copying.
 * A file missing from a local category that was not made here is left out without a finding.
 */
export function loadLogo(config: BlazonConfig, cwd: string, inAbsentLocal: (file: string) => boolean): { set?: LogoSet; problems: Finding[] } {
  if (!config.logo) return { problems: [finding('logo-missing', { path: 'blazon.json', message: 'No logo is configured: set `logo` in blazon.json to an image in the project' })] };
  const paths = logoPaths(config);
  const problems: Finding[] = [];

  const read = (file: string | undefined): string | undefined => {
    if (!file) return undefined;
    const full = path.resolve(cwd, file);
    // Before the file is looked at, so that a path outside the project says nothing about what is there
    if (!inProject(cwd, full)) {
      problems.push(finding('config-path-outside', { path: file, message: outsideMessage('the logo', file) }));
      return undefined;
    }
    const type = IMAGE_TYPES[path.extname(full).toLowerCase()];
    if (!type || !fs.existsSync(full)) {
      if (!inAbsentLocal(file)) problems.push(finding('logo-missing', { path: file, message: `Logo ${file} is not an image file in the project` }));
      return undefined;
    }
    return `data:${type};base64,${fs.readFileSync(full).toString('base64')}`;
  };

  const onLight = read(paths.onLight);
  const onDark = read(paths.onDark);
  return { set: onLight ? { onLight, ...(onDark && { onDark }) } : undefined, problems };
}

/** The same file by its real path, so a logo named `./assets/../assets/x.png` still matches its asset. */
export function sameFile(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * The configured logos that are `logos` assets, matched by file, with the ink each sidecar declares. The
 * brand book judges a configured logo with no declared ink as black (`onLight`) or white (`onDark`), and one
 * with a declared ink as that color, so a brand whose `onLight` logo is blue is not measured as black.
 */
export function declareInks(set: LogoSet, config: BlazonConfig, cwd: string, assets: AssetCatalog): LogoSet {
  const paths = logoPaths(config);
  const assetsDir = path.resolve(cwd, config.assetsDir);
  const dirs = categoryDirs(config.assets, cwd);
  const match = (file: string | undefined) => {
    if (!file) return undefined;
    const full = path.resolve(cwd, file);
    return assets.logos.find((asset) => sameFile(assetSourcePath(asset, assetsDir, dirs), full));
  };
  const light = match(paths.onLight);
  const dark = set.onDark ? match(paths.onDark) : undefined;
  return {
    ...set,
    ...(light && { onLightAsset: light.id }),
    ...(light?.meta?.ink && { onLightInk: light.meta.ink }),
    ...(dark && { onDarkAsset: dark.id }),
    ...(dark?.meta?.ink && { onDarkInk: dark.meta.ink }),
  };
}
