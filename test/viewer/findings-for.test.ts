import { describe, it, expect } from 'vitest';
import type { BlazonData } from '../../src/types/index.js';
import { findingsFor } from '../../src/viewer/lib/brand';

// findingsFor lists the findings on a token, plus a `review-pending` on a group above it.

const token = (path: string, review?: { status: 'ok' | 'needs-review' }) => ({ path, blazon: review ? { review } : {} });
const flag = (path: string) => ({ code: 'review-pending', severity: 'warning' as const, path, message: 'Marked needs-review' });

function brand(tokens: ReturnType<typeof token>[], findings: ReturnType<typeof flag>[]): BlazonData {
  return { tokens: { items: tokens }, findings } as unknown as BlazonData;
}

describe('findingsFor', () => {
  it('keeps the review-pending of a group on a token inside it, at any depth', () => {
    const data = brand([token('color.brand.primary'), token('color.other.x')], [flag('color.brand')]);
    expect(findingsFor(data, 'color.brand.primary')).toEqual([flag('color.brand')]);
    expect(findingsFor(data, 'color.other.x')).toEqual([]);
    const deep = brand([token('color.brand.dark.deep')], [flag('color')]);
    expect(findingsFor(deep, 'color.brand.dark.deep')).toEqual([flag('color')]);
  });

  it('leaves out the group flag for a token with a review of its own, even ok', () => {
    const own = flag('color.brand.primary');
    const data = brand(
      [token('color.brand.primary', { status: 'ok' }), token('color.brand.accent', { status: 'needs-review' })],
      [flag('color.brand'), own, flag('color.brand.accent')],
    );
    expect(findingsFor(data, 'color.brand.primary')).toEqual([own]);
    expect(findingsFor(data, 'color.brand.accent')).toEqual([flag('color.brand.accent')]);
  });

  it('passes only review-pending down from a group, not other findings', () => {
    const other = { ...flag('color.brand'), code: 'token-value-duplicate' };
    const data = brand([token('color.brand.primary')], [other]);
    expect(findingsFor(data, 'color.brand.primary')).toEqual([]);
  });
});
