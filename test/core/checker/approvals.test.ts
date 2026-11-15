import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { assetFingerprint, isIsoDate, reviewProblem, tokenFingerprint } from '../../../src/core/checker/review.js';
import { BRAND_SCHEMA } from '../../../src/core/brand/schema.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { tempProject } from '../../support/project';

// Structured approval (`by`, `at`) and stale approval (`value`): RFC 0001 §2 (the `review` field), §4 and §7.

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const compile = (root: string) => compileBlazonData(logoConfig(root), root);
const blazon = (review: unknown) => ({ $extensions: { 'dev.blazon': { review } } });
const tokens = (review?: unknown, value = '#112233') => ({ color: { $type: 'color', ink: { $value: value, ...(review !== undefined && blazon(review)) } } });
const codes = (data: { findings: { code: string; path: string }[] }) => data.findings.map((f) => `${f.path}:${f.code}`);

/** The fingerprint of color.ink as the project holds it now */
async function fingerprintOf(root: string, at = 'color.ink'): Promise<string> {
  return tokenFingerprint((await compile(root)).tokens.byPath.get(at)!);
}

describe('review.by and review.at', () => {
  it('are carried on a token, a group and an asset sidecar, and bring no finding', async () => {
    const review = { status: 'ok', note: 'Checked against the guide', by: 'Dana Whitfield', at: '2026-10-29' };
    const root = tempProject({
      'tokens/a.json': {
        color: { $type: 'color', $extensions: { 'dev.blazon': { review: { status: 'ok', by: 'Sam', at: '2026-01-02' } } }, ink: { $value: '#112233', ...blazon(review) } },
      },
      'assets/logos/mark.svg': SVG,
      'assets/logos/mark.json': { review },
    });
    const data = await compile(root);

    expect(data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(data.tokens.byPath.get('color.ink')!.blazon.review).toEqual(review);
    expect(data.tokens.groupMeta.find((g) => g.path === 'color')!.blazon.review).toEqual({ status: 'ok', by: 'Sam', at: '2026-01-02' });
    expect(data.assets.logos[0]!.meta!.review).toEqual(review);
  });

  it('leave a review with only a note working as it did', async () => {
    const root = tempProject({
      'tokens/a.json': tokens({ status: 'ok', note: 'Dana, October 2026' }),
      'assets/logos/mark.svg': SVG,
      'assets/logos/mark.json': { review: { status: 'ok', note: 'Checked' } },
    });
    const data = await compile(root);

    expect(data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(data.tokens.byPath.get('color.ink')!.blazon.review).toEqual({ status: 'ok', note: 'Dana, October 2026' });
    expect(data.assets.logos[0]!.meta!.review).toEqual({ status: 'ok', note: 'Checked' });
  });

  it.each([
    ['by that is not a string', { status: 'ok', by: 7 }, /by is not a string/],
    ['at that is not a string', { status: 'ok', at: 20261029 }, /at must be a real date/],
    ['at that is not a date', { status: 'ok', at: '29/10/2026' }, /at must be a real date written YYYY-MM-DD/],
    ['at that is a day the calendar lacks', { status: 'ok', at: '2026-02-30' }, /at must be a real date/],
    ['a note that is not a string', { status: 'ok', note: 3 }, /note is not a string/],
    ['a status blazon does not know', { status: 'approved' }, /review must be/],
    ['a review that is not an object', 'ok', /review must be/],
  ])('make a token with %s a review-invalid error', async (_name, review, message) => {
    const data = await compile(tempProject({ 'tokens/a.json': tokens(review) }));
    const found = data.findings.filter((f) => f.code === 'review-invalid');

    expect(found).toEqual([
      expect.objectContaining({ severity: 'error', path: 'color.ink', file: 'tokens/a.json', line: expect.any(Number), message: expect.stringMatching(message) }),
    ]);
  });

  it('make a group with a bad date a review-invalid error at the group', async () => {
    const data = await compile(tempProject({ 'tokens/a.json': { color: { $type: 'color', ...blazon({ status: 'ok', at: 'yesterday' }), ink: { $value: '#112233' } } } }));
    expect(codes(data)).toContain('color:review-invalid');
  });

  it('make a sidecar with a bad by or at an asset-sidecar-invalid error with the file named', async () => {
    const root = tempProject({ 'assets/logos/mark.svg': SVG, 'assets/logos/mark.json': { review: { status: 'ok', by: ['Dana'], at: '2026-13-01' } } });
    const data = await compile(root);
    const found = data.findings.filter((f) => f.code === 'asset-sidecar-invalid');

    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'logos/mark.json' });
    expect(data.assets.logos[0]!.meta).toBeUndefined();
  });

  it('are in brand.json, whose schema allows them and rejects a bad date', async () => {
    const root = tempProject({ 'tokens/a.json': tokens({ status: 'ok', by: 'Dana', at: '2026-10-29' }) });
    const out = buildBrandExport(await compile(root), { ...DEFAULT_CONFIG }, root);

    expect(out.tokens.find((t) => t.path === 'color.ink')!.blazon!.review).toEqual({ status: 'ok', by: 'Dana', at: '2026-10-29' });
    const review = (BRAND_SCHEMA as { $defs: { review: { properties: Record<string, { pattern?: string }> } } }).$defs.review;
    expect(Object.keys(review.properties)).toEqual(['status', 'note', 'by', 'at', 'value']);
    expect(new RegExp(review.properties.at!.pattern!).test('2026-10-29')).toBe(true);
    expect(new RegExp(review.properties.at!.pattern!).test('29 Oct 2026')).toBe(false);
  });

  it('isIsoDate accepts real days only', () => {
    expect(['2026-10-29', '2024-02-29'].every(isIsoDate)).toBe(true);
    expect(['2026-02-29', '2026-10-32', '2026-1-1', '', 5, null].some(isIsoDate)).toBe(false);
  });
});

describe('approval-stale (review.value)', () => {
  it('stays quiet when the value is what was approved', async () => {
    const root = tempProject({ 'tokens/a.json': tokens() });
    const value = await fingerprintOf(root);
    const approved = tempProject({ 'tokens/a.json': tokens({ status: 'ok', by: 'Dana', at: '2026-10-29', value }) });

    expect((await compile(approved)).findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('warns when the value changed after the approval, naming who and when, with the fingerprint to set', async () => {
    const before = await fingerprintOf(tempProject({ 'tokens/a.json': tokens() }));
    const root = tempProject({ 'tokens/a.json': tokens({ status: 'ok', by: 'Dana', at: '2026-10-29', value: before }, '#445566') });
    const now = await fingerprintOf(root);
    const found = (await compile(root)).findings.filter((f) => f.code === 'approval-stale');

    expect(now).not.toBe(before);
    expect(found).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: 'color.ink',
        file: 'tokens/a.json',
        message: `The value changed after review.status was set to ok by Dana on 2026-10-29 (fingerprint ${before}, now ${now}): confirm it again, then set review.value to ${now}`,
      }),
    ]);
  });

  it('never warns about an approval with no fingerprint, so older data is untouched', async () => {
    const root = tempProject({
      'tokens/a.json': tokens({ status: 'ok', note: 'Dana, October' }, '#445566'),
      'assets/logos/mark.svg': SVG,
      'assets/logos/mark.json': { review: { status: 'ok' } },
    });
    expect(codes(await compile(root))).not.toContain('color.ink:approval-stale');
    expect((await compile(root)).findings.some((f) => f.code === 'approval-stale')).toBe(false);
  });

  it('does not warn about a token marked needs-review, which already warns', async () => {
    const root = tempProject({ 'tokens/a.json': tokens({ status: 'needs-review', value: '000000000000' }) });
    expect(codes(await compile(root)).filter((c) => c.startsWith('color.'))).toEqual(['color.ink:review-pending']);
  });

  it('is a review-invalid error when the fingerprint is not 12 hex digits, or sits on a group', async () => {
    const bad = await compile(tempProject({ 'tokens/a.json': tokens({ status: 'ok', value: 'abc' }) }));
    expect(codes(bad)).toContain('color.ink:review-invalid');
    expect(bad.findings.some((f) => f.code === 'approval-stale')).toBe(false);

    const group = await compile(tempProject({ 'tokens/a.json': { color: { $type: 'color', ...blazon({ status: 'ok', value: '0123456789ab' }), ink: { $value: '#112233' } } } }));
    expect(codes(group)).toContain('color:review-invalid');
  });

  it('says nothing about an alias that does not resolve, or loops: there is no value to compare', async () => {
    const approval = { status: 'ok', by: 'Dana', at: '2026-10-29', value: '0123456789ab' };
    for (const target of ['{color.nope}', '{color.loop}']) {
      const root = tempProject({ 'tokens/a.json': { color: { $type: 'color', loop: { $value: '{color.text}' }, text: { $value: target, ...blazon(approval) } } } });
      expect((await compile(root)).findings.filter((f) => f.code === 'approval-stale')).toEqual([]);
    }
  });

  it('follows an alias: the approval is of the value shown, so a change to the aliased token makes it stale', async () => {
    const files = (primary: string, review?: unknown) => ({
      'tokens/a.json': { color: { $type: 'color', brand: { $value: primary }, text: { $value: '{color.brand}', ...(review !== undefined && blazon(review)) } } },
    });
    const value = await fingerprintOf(tempProject(files('#112233')), 'color.text');
    const approval = { status: 'ok', by: 'Dana', at: '2026-10-29', value };

    expect(codes(await compile(tempProject(files('#112233', approval))))).not.toContain('color.text:approval-stale');
    expect(codes(await compile(tempProject(files('#aabbcc', approval))))).toContain('color.text:approval-stale');
  });

  it('does not warn when only another resolver context changes the value: the default context is what was approved', async () => {
    const resolver = {
      version: '2025.10',
      sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
      modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/dark.json' }] }, default: 'light' } },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    };
    const files = (review?: unknown) => ({
      'blazon.resolver.json': resolver,
      'tokens/base.json': tokens(review),
      'tokens/dark.json': { color: { ink: { $value: '#ffffff' } } },
    });
    const value = await fingerprintOf(tempProject(files()));
    const data = await compile(tempProject(files({ status: 'ok', value })));

    expect(data.tokens.contexts?.length).toBeGreaterThan(0);
    expect(data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('fingerprints an asset by its file: the same bytes keep the approval, new bytes make it stale', async () => {
    const value = assetFingerprint(Buffer.from(SVG));
    const root = tempProject({ 'assets/logos/mark.svg': SVG, 'assets/logos/mark.json': { review: { status: 'ok', by: 'Dana', at: '2026-10-29', value } } });
    expect((await compile(root)).findings.some((f) => f.code === 'approval-stale')).toBe(false);

    fs.writeFileSync(path.join(root, 'assets/logos/mark.svg'), SVG.replace('10"/>', '12"/>'));
    const stale = (await compile(root)).findings.filter((f) => f.code === 'approval-stale');
    expect(stale).toEqual([expect.objectContaining({ severity: 'warning', path: 'logos/mark', message: expect.stringContaining(`fingerprint ${value}`) })]);
  });

  it('is the same fingerprint for the same value however the keys are ordered', () => {
    const a = tokenFingerprint({ type: 'shadow', resolvedValue: { color: '#000', offsetX: { value: 1, unit: 'px' } } });
    const b = tokenFingerprint({ type: 'shadow', resolvedValue: { offsetX: { unit: 'px', value: 1 }, color: '#000' } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(tokenFingerprint({ type: 'color', resolvedValue: '#000' })).not.toBe(tokenFingerprint({ type: 'dimension', resolvedValue: '#000' }));
  });

  it('reviewProblem says nothing about a good review', () => {
    expect(reviewProblem({ status: 'ok', note: 'n', by: 'b', at: '2026-10-29', value: '0123456789ab' })).toBeUndefined();
    expect(reviewProblem({ status: 'needs-review' })).toBeUndefined();
  });
});

describe('review.value', () => {
  it('is the 12 lowercase hex digits blazon approvals prints, and nothing else', () => {
    expect(reviewProblem({ status: 'ok', value: '0123456789ab' })).toBeUndefined();
    for (const bad of ['abc', '0123456789AB', 'v1:0123456789ab', 'v2:0123456789abcdef', '0123456789abc', 7])
      expect(reviewProblem({ status: 'ok', value: bad }), String(bad)).toMatch(/review.value must be the 12 hex digits/);
  });

  it('is stale when the value moved and current when it did not', async () => {
    const tokensAt = (value: string, color: string) => tempProject({ 'tokens/a.json': tokens({ status: 'ok', by: 'Dana', at: '2026-10-29', value }, color) });
    const value = await fingerprintOf(tempProject({ 'tokens/a.json': tokens() }));
    expect((await compile(tokensAt(value, '#112233'))).findings.some((f) => f.code.startsWith('approval-'))).toBe(false);
    expect((await compile(tokensAt(value, '#445566'))).findings.map((f) => f.code)).toContain('approval-stale');
  });
});

describe('approvals() on an asset', () => {
  it('leaves out an invalid review, as it does for a token', async () => {
    const { approvals } = await import('../../../src/core/checker/approvals.js');
    const root = tempProject({ 'assets/logos/mark.svg': SVG });
    const asset = (await compile(root)).assets.logos[0]!;
    const files = { assetsDir: path.join(root, 'assets'), dirs: {} };
    expect(approvals({ items: [] }, [{ ...asset, meta: { review: { status: 'ok', value: 'not-a-fingerprint' } } }] as never, files)).toEqual([]);
    expect(approvals({ items: [] }, [{ ...asset, meta: { review: { status: 'ok' } } }] as never, files)).toHaveLength(1);
  });
});
