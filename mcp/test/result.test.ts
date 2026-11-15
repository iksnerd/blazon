import { describe, expect, it } from 'vitest';
import { answerWith, limitItems, MAX_TEXT, NARROW_FINDINGS } from '../src/result.js';

/** A check document with `n` findings of about `pad` characters each. */
const check = (n: number, pad = 0) => ({
  passed: false,
  counts: { errors: n, warnings: 0, info: 0 },
  findings: Array.from({ length: n }, (_, i) => ({ code: 'x', path: `p.${i}`, message: 'm'.repeat(pad) })),
});

/** The size of the answer that keeps `n` of the document's findings, as answerWith builds it. */
const sizeOf = (document: ReturnType<typeof check>, n: number) =>
  JSON.stringify({
    ...document,
    findings: document.findings.slice(0, n),
    findingsTotal: document.findings.length,
    truncated: true,
    notice: `Showing ${n} of ${document.findings.length} findings; ${NARROW_FINDINGS}, or raise limit.`,
    warnings: [],
    brandHasErrors: true,
  }).length;

describe('limitItems', () => {
  it('keeps the most findings that fit, not a power-of-two fraction', () => {
    const document = check(500, 280);
    const shaped = limitItems(document, 'findings', 500, NARROW_FINDINGS);
    const kept = (shaped.findings as unknown[]).length;
    expect(sizeOf(document, kept)).toBeLessThanOrEqual(MAX_TEXT);
    expect(sizeOf(document, kept + 1)).toBeGreaterThan(MAX_TEXT);
    expect(shaped.notice).toBe(`Showing ${kept} of 500 findings; ${NARROW_FINDINGS}, or raise limit.`);
  });

  it('leaves room for the warnings answerWith adds', () => {
    const warnings = Array.from({ length: 5 }, () => 'w'.repeat(503));
    // a limit that lands the findings just under the old 2000 characters of headroom
    for (let limit = 100; limit <= 130; limit++) {
      const shaped = limitItems(check(limit, 280), 'findings', limit, NARROW_FINDINGS, warnings);
      const result = answerWith(shaped, warnings, NARROW_FINDINGS);
      const text = result.content.at(-1)?.text ?? '';
      expect(() => JSON.parse(text), `limit ${limit}`).not.toThrow();
      expect(result.structuredContent?.findings, `limit ${limit}`).toBeDefined();
    }
  });
});

describe('answerWith over the size limit', () => {
  it('keeps counts and passed in the structured result', () => {
    const result = answerWith(check(2, MAX_TEXT), [], NARROW_FINDINGS);
    expect(result.structuredContent).toMatchObject({
      truncated: true,
      passed: false,
      counts: { errors: 2, warnings: 0, info: 0 },
      warnings: [],
      brandHasErrors: false,
    });
  });

  it('cuts the text on a code point, never inside a surrogate pair', () => {
    const result = answerWith({ entries: ['😀'.repeat(MAX_TEXT)] }, [], NARROW_FINDINGS);
    const text = result.content.at(-1)?.text ?? '';
    expect(text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(result.structuredContent?.notice).toMatch(/code points/);
  });
});
