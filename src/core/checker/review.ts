import { createHash } from 'node:crypto';
import type { Finding, GroupMeta, Review, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

const needsReview = (path: string, note?: string): Finding => finding('needs-review', { path, message: note ?? 'Marked needs-review' });

const FIELDS = ['status', 'note', 'by', 'at', 'value'] as const;
/** What a `review.value` holds: exactly 12 lowercase hex digits, the fingerprint `blazon approvals` prints (RFC 0001 section 2). */
const FINGERPRINT = /^[0-9a-f]{12}$/;

/** Whether a text is a real calendar day written YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(text: unknown): text is string {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
}

/** Why a `review` is not valid, or undefined when it is. `fingerprint: false` for a group, which has no value of its own to fingerprint. */
export function reviewProblem(raw: unknown, options: { fingerprint?: boolean } = {}): string | undefined {
  const shape = `review must be {"status": "ok" | "needs-review", "note"?: string, "by"?: string, "at"?: "YYYY-MM-DD"${options.fingerprint === false ? '' : ', "value"?: string'}}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return shape;
  const review = raw as Record<string, unknown>;
  if (review.status !== 'ok' && review.status !== 'needs-review') return shape;
  for (const key of ['note', 'by'] as const) if (review[key] !== undefined && typeof review[key] !== 'string') return `${shape}: ${key} is not a string`;
  if (review.at !== undefined && !isIsoDate(review.at)) return `${shape}: at must be a real date written YYYY-MM-DD, not ${JSON.stringify(review.at)}`;
  if (review.value !== undefined) {
    if (options.fingerprint === false) return 'review.value fingerprints a value, and a group has none: put the review on its tokens';
    if (typeof review.value !== 'string' || !FINGERPRINT.test(review.value))
      return `review.value must be the 12 hex digits \`blazon approvals\` prints, not ${JSON.stringify(review.value)}`;
  }
  return undefined;
}

/** The review as it is carried on: the known fields only, in a fixed order. Call it on a review `reviewProblem` accepted. */
export function cleanReview(raw: Review): Review {
  return Object.fromEntries(FIELDS.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]])) as unknown as Review;
}

const noteOf = (review: { note?: unknown } | undefined): string | undefined => (typeof review?.note === 'string' ? review.note : undefined);

/**
 * `needs-review` on groups and tokens. A flagged group reports once, and its tokens do not repeat it
 * (a group's `review` is not inherited, see walk.ts). A token's own `needs-review` reports on its own;
 * its `ok` reports nothing. A `review` of the wrong shape is an `invalid-review` error.
 */
export function reviewFindings(items: readonly TokenItem[], groups: readonly GroupMeta[]): Finding[] {
  const invalid = (path: string, review: unknown, fingerprint: boolean): Finding[] => {
    const problem = review === undefined ? undefined : reviewProblem(review, { fingerprint });
    return problem ? [finding('invalid-review', { path, message: problem })] : [];
  };
  return [
    ...groups.flatMap((g) => invalid(g.path, g.blazon.review, false)),
    ...items.flatMap((t) => invalid(t.path, t.blazon.review, true)),
    ...groups.filter((g) => g.blazon.review?.status === 'needs-review').map((g) => needsReview(g.path, noteOf(g.blazon.review))),
    ...items.filter((t) => t.blazon.review?.status === 'needs-review').map((t) => needsReview(t.path, noteOf(t.blazon.review))),
  ];
}

/** JSON with the keys of every object in order, so two equal values give one text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The text that is hashed for a token (fingerprint v1, RFC 0001 section 2): the JSON array [`$type` or null, resolved value]
 * with the keys of every object sorted by UTF-16 code unit and no whitespace. A member whose value is undefined is left out.
 */
export const fingerprintInput = (item: Pick<TokenItem, 'type' | 'resolvedValue'>): string => canonical([item.type ?? null, item.resolvedValue]);

const digest = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 12);

/**
 * The fingerprint of what a person confirms on a token: its `$type` and its resolved value, with every alias replaced, in
 * the default context. An approval therefore goes stale when the value changes, including through the token it aliases.
 */
export function tokenFingerprint(item: Pick<TokenItem, 'type' | 'resolvedValue'>): string {
  return digest(fingerprintInput(item));
}

/** The fingerprint of an asset: its file's bytes. The sidecar is where the approval is written, so editing it does not void it. */
export const assetFingerprint = (bytes: Uint8Array): string => digest(bytes);

/** One approval to compare: a recorded fingerprint against the current one. */
export interface Approval {
  path: string;
  review: Review;
  /** Undefined when the value cannot be read (an unresolved alias, a missing file): nothing to compare */
  current: string | undefined;
}

/**
 * `approval-stale`: a `review.status: ok` that recorded a `value` fingerprint, and the value is no longer that one. An
 * approval with no fingerprint is never stale.
 */
export function staleFindings(approvals: readonly Approval[]): Finding[] {
  return approvals
    .filter((a) => a.review.status === 'ok' && typeof a.review.value === 'string' && a.current !== undefined && a.current !== a.review.value)
    .map((a): Finding =>
      finding('approval-stale', {
        path: a.path,
        message: `The value changed after review.status was set to ok${a.review.by ? ` by ${a.review.by}` : ''}${a.review.at ? ` on ${a.review.at}` : ''} (fingerprint ${a.review.value}, now ${a.current}): confirm it again, then set review.value to ${a.current}`,
      }),
    );
}
