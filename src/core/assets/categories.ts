import fs from 'node:fs';
import path from 'node:path';
import type { Asset, AssetCatalog, AssetCategoryConfig, AssetCategoryInfo, AssetFormat, AssetRules, Finding } from '../../types/index.js';
import { isObject, isSource, isStringList, listMessage, SOURCE_MESSAGE } from './fields.js';
import { artworkSize } from './measure.js';
import { finding } from '../checker/catalogue.js';
import { compareText } from '../order.js';
import { inProjectOrApproved, notApprovedMessage } from '../confine.js';

// The `assets` block of blazon.json (RFC 0001 §11): settings for asset categories. A category is still
// a folder of `assets/`; the block adds a label, an order, a description, an extra folder and rules.

const FIELDS = ['label', 'order', 'description', 'dir', 'rules', 'notSpecified', 'source', 'local', 'experimental', 'reference'];
const RULE_FIELDS = ['formats', 'minPixels', 'aspectRatios'];
const FORMATS: readonly AssetFormat[] = ['svg', 'png', 'jpg', 'gif', 'webp', 'avif'];
const RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
/** A file matches a ratio within this relative difference. */
const RATIO_TOLERANCE = 0.01;
/** A key with a `dir` becomes a URL segment, so it is written like a slug. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** An extra folder a category is scanned from: where it is, and how the config wrote it. */
export interface CategoryRoot {
  dir: string;
  /** The path as written in the config, for messages: a real path would leak the machine into the data */
  label: string;
}

export interface ResolvedCategories {
  /** The valid entries; an invalid one is left out whole, so nothing is half applied */
  configs: Record<string, AssetCategoryConfig>;
  /** Absolute, symlink-resolved folders, by category key */
  roots: Record<string, CategoryRoot>;
  problems: Finding[];
}

/**
 * Reads and checks the `assets` block. Each problem is a finding on its key. The folders are resolved
 * against the project and may sit outside it (a shared folder in a monorepo) only when the person running blazon approved that folder
 * (`--allow-dir`, BLAZON_ALLOW_DIRS; confine.ts); the config cannot approve it. This is the one place that decides: the scanner, the
 * builder, the dev server and the MCP tools all get their folders through it (categoryDirs). Only image files inside the folder are ever
 * served or copied, never through a link that leaves it.
 */
export function resolveCategories(block: Record<string, unknown> | undefined, cwd: string): ResolvedCategories {
  const result: ResolvedCategories = { configs: Object.create(null), roots: Object.create(null), problems: [] };

  for (const [key, raw] of Object.entries(block ?? {})) {
    const errors: string[] = [];
    if (!isObject(raw)) {
      result.problems.push(finding('asset-config-invalid', { path: key, message: 'must be an object' }));
      continue;
    }
    for (const field of Object.keys(raw)) if (!FIELDS.includes(field)) errors.push(`unknown field "${field}"; known: ${FIELDS.join(', ')}`);
    if (raw.label !== undefined && typeof raw.label !== 'string') errors.push('label must be a string');
    if (raw.order !== undefined && (typeof raw.order !== 'number' || !Number.isFinite(raw.order))) errors.push('order must be a number');
    if (raw.description !== undefined && typeof raw.description !== 'string') errors.push('description must be a string');

    if (raw.rules !== undefined) errors.push(...ruleErrors(raw.rules));
    if (raw.notSpecified !== undefined && !isStringList(raw.notSpecified)) errors.push(listMessage('notSpecified'));
    if (raw.source !== undefined && !isSource(raw.source)) errors.push(SOURCE_MESSAGE);
    if (raw.local !== undefined && (typeof raw.local !== 'string' || raw.local.trim() === '')) errors.push('local must be a sentence saying how to make the files');

    if (raw.experimental !== undefined && typeof raw.experimental !== 'boolean') errors.push('experimental must be true or false');
    if (raw.reference !== undefined && typeof raw.reference !== 'boolean') errors.push('reference must be true or false');
    if (raw.experimental === true && raw.reference === true) errors.push('a category cannot be both experimental and reference');

    let root: CategoryRoot | undefined;
    let refused = false;
    if (raw.dir !== undefined) {
      if (typeof raw.dir !== 'string' || raw.dir.trim() === '') {
        errors.push('dir must be a path');
      } else {
        if (!SLUG.test(key)) errors.push(`key "${key}" has a dir, so it must be lowercase letters, digits and hyphens: it is a URL segment`);
        const full = path.resolve(cwd, raw.dir);
        // Decided before the disk is asked anything, so that the refusal cannot say whether the folder is there
        if (!inProjectOrApproved(cwd, full)) {
          result.problems.push(finding('config-path-outside', { path: `assets.${key}.dir`, message: notApprovedMessage(`assets.${key}.dir`, raw.dir) }));
          refused = true;
        } else if (!fs.existsSync(full)) errors.push(`dir ${raw.dir} does not exist`);
        else if (!fs.statSync(full).isDirectory()) errors.push(`dir ${raw.dir} is not a folder`);
        else root = { dir: fs.realpathSync(full), label: raw.dir };
      }
    }

    if (refused || errors.length > 0) {
      for (const message of errors) result.problems.push(finding('asset-config-invalid', { path: key, message }));
      continue;
    }
    result.configs[key] = raw as AssetCategoryConfig;
    if (root) result.roots[key] = root;
  }
  return result;
}

/** One message per mistake in a `rules` object. */
function ruleErrors(rules: unknown): string[] {
  if (!isObject(rules)) return ['rules must be an object'];
  const errors: string[] = [];
  for (const field of Object.keys(rules)) if (!RULE_FIELDS.includes(field)) errors.push(`rules has unknown field "${field}"; known: ${RULE_FIELDS.join(', ')}`);

  if (rules.formats !== undefined) {
    const { formats } = rules;
    if (!Array.isArray(formats) || formats.length === 0 || !formats.every((f) => FORMATS.includes(f as AssetFormat))) {
      errors.push(`formats must be a non-empty list of ${FORMATS.join(', ')}`);
    }
  }
  if (rules.minPixels !== undefined) {
    const { minPixels } = rules;
    if (!isObject(minPixels) || (minPixels.width === undefined && minPixels.height === undefined)) {
      errors.push('minPixels needs a width, a height or both');
    } else {
      for (const side of Object.keys(minPixels)) {
        if (side !== 'width' && side !== 'height') errors.push(`minPixels has unknown field "${side}"; known: width, height`);
        else if (typeof minPixels[side] !== 'number' || !((minPixels[side] as number) > 0)) errors.push(`minPixels.${side} must be a number above 0`);
      }
    }
  }
  if (rules.aspectRatios !== undefined) {
    const { aspectRatios } = rules;
    const valid = Array.isArray(aspectRatios) && aspectRatios.length > 0 && aspectRatios.every((r) => typeof r === 'string' && ratioOf(r) !== undefined);
    if (!valid) errors.push('aspectRatios must be a non-empty list of ratios written like 16:9');
  }
  return errors;
}

/** "16:9" as a number, or undefined when it is not W:H with both sides above 0. */
function ratioOf(text: string): number | undefined {
  const match = text.match(RATIO);
  if (!match) return undefined;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width > 0 && height > 0 ? width / height : undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The folder each category with its own folder is scanned from, by key: what the server and the build read files from. */
export function categoryDirs(block: Record<string, unknown> | undefined, cwd: string): Record<string, string> {
  return Object.fromEntries(Object.entries(resolveCategories(block, cwd).roots).map(([key, root]) => [key, root.dir]));
}

/**
 * Where an asset's file is on disk. An asset's `filePath` reads as if it sat in `assets/`; for a category with
 * a folder of its own, the file is in that folder when it is there.
 */
export function assetSourcePath(asset: Asset, assetsDir: string, dirs: Record<string, string>): string {
  const own = Object.hasOwn(dirs, asset.category) ? path.join(dirs[asset.category]!, asset.filePath.slice(asset.category.length + 1)) : undefined;
  return own && fs.existsSync(own) ? own : path.join(assetsDir, asset.filePath);
}

/** "photography" becomes "Photography", "iconUsage" becomes "Icon usage". */
export function humanize(segment: string): string {
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The categories that have assets, as the brand book shows them: configured `order` first, then logos, icons, the rest by name. */
export function assetCategoryInfo(catalog: AssetCatalog, configs: Record<string, AssetCategoryConfig>): AssetCategoryInfo[] {
  const keys = [
    ...(catalog.logos.length ? ['logos'] : []),
    ...(catalog.icons.length ? ['icons'] : []),
    ...Object.keys(catalog.custom)
      .filter((key) => catalog.custom[key]!.length > 0)
      .sort(),
  ];
  const info = keys.map((category): AssetCategoryInfo => {
    const config = configs[category];
    return {
      category,
      label: config?.label ?? humanize(category),
      ...(config?.order !== undefined && { order: config.order }),
      ...(config?.description !== undefined && { description: config.description }),
      ...(config?.rules !== undefined && { rules: config.rules }),
      ...(config?.notSpecified !== undefined && { notSpecified: config.notSpecified }),
      ...(config?.source !== undefined && { source: config.source }),
      ...(config?.local !== undefined && { local: config.local }),
      ...(config?.experimental === true && { experimental: true as const }),
      ...(config?.reference === true && { reference: true as const }),
    };
  });
  const ordered = info.filter((c) => c.order !== undefined).sort((a, b) => a.order! - b.order! || compareText(a.category, b.category));
  return [...ordered, ...info.filter((c) => c.order === undefined)];
}

const hasAssets = (catalog: AssetCatalog, key: string) => (key === 'logos' ? catalog.logos : key === 'icons' ? catalog.icons : (catalog.custom[key] ?? [])).length > 0;

/** The asset ids in experimental or reference categories: neither is the live identity, so their `review` is data and does not gate the book. */
export function ungatedAssetIds(catalog: AssetCatalog, configs: Record<string, AssetCategoryConfig>): Set<string> {
  return new Set(catalog.all.filter((asset) => configs[asset.category]?.experimental === true || configs[asset.category]?.reference === true).map((asset) => asset.id));
}

/** The local categories (`local`) with no image here: their images were not made in this checkout. */
export function absentLocalCategories(catalog: AssetCatalog, configs: Record<string, AssetCategoryConfig>): Set<string> {
  return new Set(Object.keys(configs).filter((key) => configs[key]!.local !== undefined && !hasAssets(catalog, key)));
}

/** One note per absent local category, which stands in for the findings its absence would cause. */
export function absentLocalFindings(absent: ReadonlySet<string>, configs: Record<string, AssetCategoryConfig>): Finding[] {
  return [...absent].map((key): Finding =>
    finding('asset-local-missing', { path: key, message: `The images are kept out of git and are not here. ${configs[key]!.local} Until then the brand book leaves them out.` }),
  );
}

/** A configured key with no assets is usually a typo of a folder name. A local category says why it has none. */
export function unusedFindings(catalog: AssetCatalog, configs: Record<string, AssetCategoryConfig>): Finding[] {
  return Object.keys(configs)
    .filter((key) => !hasAssets(catalog, key) && configs[key]!.local === undefined)
    .map((key): Finding => finding('asset-config-unused', { path: key, message: 'There is no asset in this category. Check the key against the folder name' }));
}

/** A raster image's pixel size; undefined for a vector file or when the file's header did not say. */
function pixelSize(asset: Asset): { width: number; height: number } | undefined {
  return asset.format !== 'svg' && typeof asset.width === 'number' && typeof asset.height === 'number' ? { width: asset.width, height: asset.height } : undefined;
}

/**
 * Tests each file against the rules of its category: its format, the pixel size of a raster image, and its
 * aspect ratio. Each broken rule is an error on the file's id, as a broken contrast pair is on its tokens.
 */
export function ruleFindings(catalog: AssetCatalog, configs: Record<string, AssetCategoryConfig>): Finding[] {
  const findings: Finding[] = [];
  const violation = (asset: Asset, message: string) => findings.push(finding('asset-rule-violated', { path: asset.id, message }));

  for (const asset of catalog.all) {
    const rules: AssetRules | undefined = configs[asset.category]?.rules;
    if (!rules) continue;
    const { category } = asset;

    if (rules.formats && !rules.formats.includes(asset.format)) {
      violation(asset, `${asset.id} is ${asset.format}; ${category} allows ${rules.formats.join(', ')}`);
    }

    const pixels = pixelSize(asset);
    if (rules.minPixels && pixels) {
      const { width, height } = rules.minPixels;
      const short = (width !== undefined && pixels.width < width) || (height !== undefined && pixels.height < height);
      if (short) {
        const stated = [width !== undefined && `${width}px wide`, height !== undefined && `${height}px high`].filter(Boolean);
        violation(asset, `${asset.id} is ${pixels.width}×${pixels.height}px; ${category} needs at least ${stated.join(' and ')}`);
      }
    }

    const size = artworkSize(asset);
    if (rules.aspectRatios && size) {
      const actual = size.width / size.height;
      if (!rules.aspectRatios.some((text) => Math.abs(actual / ratioOf(text)! - 1) <= RATIO_TOLERANCE)) {
        const divisor = Number.isInteger(size.width) && Number.isInteger(size.height) ? gcd(size.width, size.height) : 1;
        violation(asset, `${asset.id} is ${size.width}×${size.height} (${size.width / divisor}:${size.height / divisor}); ${category} allows ${rules.aspectRatios.join(', ')}`);
      }
    }
  }
  return findings;
}
