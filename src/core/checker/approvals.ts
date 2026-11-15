import fs from 'node:fs';
import type { Asset, Finding, ParsedTokens } from '../../types/index.js';
import { aliasTarget } from '../tokens/alias.js';
import { assetSourcePath } from '../assets/categories.js';
import { assetFingerprint, reviewProblem, staleFindings, tokenFingerprint, type Approval } from './review.js';

/** Where an asset's file is, for the fingerprint: its folder, and the folders of categories that have one of their own. */
export interface AssetFiles {
  assetsDir: string;
  dirs: Record<string, string>;
}

/**
 * The resolver leaves an alias it cannot follow (no such token, a loop) as its own "{path}" text, so a value that still holds one
 * is not a value: fingerprinting it would tell the user to record the fingerprint of a broken string.
 */
function isUnresolved(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(isUnresolved);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(isUnresolved);
  return aliasTarget(value) !== undefined;
}

/**
 * Every token and asset whose review is valid and says `ok`, with the fingerprint of its value today. Tokens are read in
 * the default context only: a resolver context changes the value a reader sees, not the one that was confirmed.
 */
export function approvals(tokens: Pick<ParsedTokens, 'items'>, assets: readonly Asset[], files: AssetFiles): Approval[] {
  const fromTokens = tokens.items.flatMap((item): Approval[] => {
    const review = item.blazon.review;
    if (review?.status !== 'ok' || reviewProblem(review) !== undefined) return [];
    return [{ path: item.path, review, current: isUnresolved(item.resolvedValue) ? undefined : tokenFingerprint(item) }];
  });
  const fromAssets = assets.flatMap((asset): Approval[] => {
    const review = asset.meta?.review;
    if (review?.status !== 'ok' || reviewProblem(review) !== undefined) return [];
    let current: string | undefined;
    try {
      current = assetFingerprint(fs.readFileSync(assetSourcePath(asset, files.assetsDir, files.dirs)));
    } catch {
      // a file that cannot be read has no fingerprint to compare
    }
    return [{ path: asset.id, review, current }];
  });
  return [...fromTokens, ...fromAssets];
}

/** The `approval-stale` warnings of a project. */
export const staleApprovals = (tokens: Pick<ParsedTokens, 'items'>, assets: readonly Asset[], files: AssetFiles): Finding[] => staleFindings(approvals(tokens, assets, files));
