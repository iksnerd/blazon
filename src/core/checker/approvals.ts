import fs from 'node:fs';
import type { Asset, Finding, ParsedTokens } from '../../types/index.js';
import { assetSourcePath } from '../assets/categories.js';
import { assetFingerprint, reviewProblem, staleFindings, tokenFingerprint, type Approval } from './review.js';

/** Where an asset's file is, for the fingerprint: its folder, and the folders of categories that have one of their own. */
export interface AssetFiles {
  assetsDir: string;
  dirs: Record<string, string>;
}

/**
 * Every token and asset whose review is valid and says `ok`, with the fingerprint of its value today. Tokens are read in
 * the default context only: a resolver context changes the value a reader sees, not the one that was confirmed.
 */
export function approvals(tokens: Pick<ParsedTokens, 'items'>, assets: readonly Asset[], files: AssetFiles): Approval[] {
  const fromTokens = tokens.items.flatMap((item): Approval[] => {
    const review = item.blazon.review;
    if (review?.status !== 'ok' || reviewProblem(review) !== undefined) return [];
    return [{ path: item.path, review, current: item.resolvedValue === undefined ? undefined : tokenFingerprint(item) }];
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
