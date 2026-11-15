import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { ASSET_URL_BASE, type BlazonConfig, type BlazonData } from '../types/index.js';
import { compileBlazonData, emitTokenOutputs, planTokenOutputs } from '../core/index.js';
import { type WriteOptions } from '../core/preflight.js';
import { iconSetDir } from '../core/icons/icon-sets.js';
import { assetSourcePath, categoryDirs } from '../core/assets/categories.js';
import { formatBrandJson } from '../core/brand/export.js';
import { BRAND_SCHEMA_FILE, formatBrandSchema } from '../core/brand/schema.js';
import { resolvePrebuiltViewerDir } from '../server/dev-server.js';
import { injectBlazonData } from '../server/data-script.js';

export async function buildSite(
  config: BlazonConfig,
  cwd: string = process.cwd(),
  options: { data?: BlazonData } & WriteOptions = {},
): Promise<{ data: BlazonData; siteOutDir: string; tokensOutDir: string }> {
  console.log(pc.cyan(`\n[blazon] Compiling brand book & design tokens...`));

  // 1. Compile tokens, docs, and assets data; or take what the caller compiled and checked, plugin findings included
  const data = options.data ?? (await compileBlazonData(config, cwd));

  // 2. Static brand book site: the viewer compiled at publish time, plus this brand book's data
  const outDir = path.resolve(cwd, config.outDir);
  // outDir is emptied below, so everything that stops a write is checked first, here and not only in the commands: a caller of buildSite
  // may hand it data it compiled itself, and gets the refusals `blazon build` gives. The token outputs are written after the site, so
  // their refusals are asked for now too: a refusal must not come after the site was replaced.
  planTokenOutputs(data, config, cwd, options);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(resolvePrebuiltViewerDir(), outDir, { recursive: true });
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, injectBlazonData(fs.readFileSync(indexPath, 'utf-8'), data));

  // After the viewer copy, which replaces outDir. Only cataloged images are copied, not the whole folder.
  copyAssetFiles(data, path.resolve(cwd, config.assetsDir), path.join(outDir, ASSET_URL_BASE), categoryDirs(config.assets, cwd));

  copyIconSets(data, config, cwd, path.join(outDir, ASSET_URL_BASE, 'icon-sets'));

  // The whole brand in one file, with the files it names beside it: for tools in any language
  fs.writeFileSync(path.join(outDir, 'brand.json'), formatBrandJson(data, config, cwd));
  fs.writeFileSync(path.join(outDir, BRAND_SCHEMA_FILE), formatBrandSchema());

  console.log(`  ${pc.green('✔')} Wrote ${pc.bold(path.join(outDir, 'brand.json'))}`);
  console.log(`  ${pc.green('✔')} Built static brand book site to ${pc.bold(outDir)}`);

  // 3. Token artifacts (theme.css, tokens.ts, tokens.json), after the site folder was emptied: tokensOutDir may sit inside it
  const tokenPaths = await emitTokenOutputs(data, config, cwd, options);
  console.log(`  ${pc.green('✔')} Emitted ${pc.bold(tokenPaths.cssPath)}`);
  console.log(`  ${pc.green('✔')} Emitted ${pc.bold(tokenPaths.tsPath)}`);
  console.log(`  ${pc.green('✔')} Emitted ${pc.bold(tokenPaths.jsonPath)}\n`);

  return {
    data,
    siteOutDir: outDir,
    tokensOutDir: path.resolve(cwd, config.tokensOutDir),
  };
}

/** Copies every cataloged image to the URL it is served at. */
function copyAssetFiles(data: BlazonData, assetsDir: string, destDir: string, dirs: Record<string, string>): void {
  for (const asset of data.assets.all) {
    const dest = path.join(destDir, asset.filePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(assetSourcePath(asset, assetsDir, dirs), dest);
  }
}

/** Each icon set's SVGs from its package, under icon-sets/<name>/: the files the dev server route serves. */
function copyIconSets(data: BlazonData, config: BlazonConfig, cwd: string, destDir: string): void {
  for (const set of data.iconSets) {
    const source = config.iconSets?.find((candidate) => candidate.name === set.name);
    const dir = source && iconSetDir(source, cwd);
    // The set was read when the data was compiled: a package that cannot be found now has been removed since, and the site would list icons it does not have
    if (!dir)
      throw new Error(
        `[blazon] icon set "${set.name}": its package ${source ? `"${source.package}" ` : ''}is no longer where it was read from, so its icons cannot be copied into the site`,
      );
    fs.mkdirSync(path.join(destDir, set.name), { recursive: true });
    for (const icon of set.categories.flatMap((category) => category.icons)) {
      fs.copyFileSync(path.join(dir, `${icon}.svg`), path.join(destDir, set.name, `${icon}.svg`));
    }
  }
}
