import fs from 'node:fs';
import type { Asset, Finding, ParsedTokens } from '../../types/index.js';
import { aliasTarget } from '../tokens/alias.js';
import { assetSourcePath } from '../assets/categories.js';
import { fileNameOf } from '../assets/representations.js';
import { assetSetFingerprint, reviewProblem, staleFindings, tokenFingerprint, type Approval } from './review.js';

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
  // One approval per id: an id with several files is one asset, and its sidecar holds one fingerprint for all of them
  const ids = new Map<string, Asset[]>();
  for (const asset of assets) ids.set(asset.id, [...(ids.get(asset.id) ?? []), asset]);
  const fromAssets = [...ids.values()].flatMap((records): Approval[] => {
    // the files in byte order of their names: the order the fingerprint hashes them in
    const named = [...records].sort((x, y) => Buffer.compare(Buffer.from(fileNameOf(x)), Buffer.from(fileNameOf(y))));
    const review = named[0]!.meta?.review;
    if (review?.status !== 'ok' || reviewProblem(review) !== undefined) return [];
    let current: string | undefined;
    try {
      current = assetSetFingerprint(named.map((asset) => ({ name: fileNameOf(asset), bytes: fs.readFileSync(assetSourcePath(asset, files.assetsDir, files.dirs)) })));
    } catch {
      // a file that cannot be read has no fingerprint to compare
    }
    return [{ path: named[0]!.id, review, current, files: named.map(fileNameOf) }];
  });
  return [...fromTokens, ...fromAssets];
}

/** The `approval-stale` warnings of a project. */
export const staleApprovals = (tokens: Pick<ParsedTokens, 'items'>, assets: readonly Asset[], files: AssetFiles): Finding[] => staleFindings(approvals(tokens, assets, files));

/**
 * A sidecar belongs to an id, and the scanner reads it once for each file of the id, so `review-pending` and `asset-review-missing`
 * come once for each file. This keeps one of each per id, and an `asset-review-missing` names the files the review has to cover.
 */
export function onePerAssetId(problems: readonly Finding[], assets: readonly Asset[]): Finding[] {
  const filesOf = new Map<string, string[]>();
  for (const asset of assets) filesOf.set(asset.id, [...(filesOf.get(asset.id) ?? []), fileNameOf(asset)]);
  const seen = new Set<string>();
  return problems.flatMap((problem): Finding[] => {
    if (problem.code !== 'review-pending' && problem.code !== 'asset-review-missing') return [problem];
    const files = filesOf.get(problem.path);
    if (!files || files.length < 2) return [problem];
    const key = `${problem.code}\0${problem.path}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const named = files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).join(', ');
    return [
      problem.code === 'asset-review-missing'
        ? { ...problem, message: problem.message.replace(`${problem.path} was generated`, `${problem.path} (${named}) was generated`) }
        : problem,
    ];
  });
}
