import { describe, it, expect } from 'vitest';
import { boundFindings, FINDINGS_BUDGET } from '../../../../src/shipped/social-cards/bound.js';
import type { Finding } from '../../../../src/shipped/social-cards/checks.js';
import { NAME } from '../../../../src/shipped/social-cards/request.js';
import { cardOf, run, world } from './helpers.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: the findings against the 64 KB a build call may print (RFC 0005 section 6). Over it, the call fails; so the answer is bounded.

const LIMIT = 65536;
const finding = (n: number, severity: Finding['severity']): Finding => ({
  code: `${NAME}/${severity === 'error' ? 'card-text-overflow' : 'card-background-small'}`,
  severity,
  path: `card-${n}.png`,
  message: `card "card-${n}": ${'x'.repeat(200)}`,
});

describe('bounding the findings', () => {
  it('returns the findings untouched when they fit', () => {
    const few = [finding(1, 'warning'), finding(2, 'error')];
    expect(boundFindings(few)).toBe(few);
  });

  it('keeps errors before warnings, each group in the order found, and says exactly how many it left out', () => {
    const all = Array.from({ length: 600 }, (_, n) => finding(n, n % 2 === 0 ? 'warning' : 'error'));
    const total = all.length;
    const bound = boundFindings(all);
    const summary = bound[bound.length - 1]!;
    const shown = bound.slice(0, -1);
    expect(summary.code).toBe(`${NAME}/findings-left-out`);
    expect(summary.severity).toBe('warning');
    expect(summary.message).toMatch(new RegExp(`^${total - shown.length} more findings are not shown`));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(total);
    // 300 errors fit in the budget? then every shown one before the first warning is an error, in the order found
    const firstWarning = shown.findIndex((f) => f.severity === 'warning');
    expect(shown.slice(0, firstWarning === -1 ? undefined : firstWarning).every((f) => f.severity === 'error')).toBe(true);
    if (firstWarning !== -1) expect(shown.slice(firstWarning).every((f) => f.severity === 'warning')).toBe(true);
    const errors = shown.filter((f) => f.severity === 'error').map((f) => f.path);
    expect(errors).toEqual(all.filter((f) => f.severity === 'error').slice(0, errors.length).map((f) => f.path));
    expect(Buffer.byteLength(JSON.stringify({ findings: bound }) + '\n')).toBeLessThanOrEqual(LIMIT);
  });

  it('drops a warning before an error when it has to drop either', () => {
    const warnings = Array.from({ length: 300 }, (_, n) => finding(n, 'warning'));
    const errors = Array.from({ length: 100 }, (_, n) => finding(1000 + n, 'error'));
    const bound = boundFindings([...warnings, ...errors]);
    expect(bound.filter((f) => f.severity === 'error')).toHaveLength(100);
    expect(bound.slice(0, 100).every((f) => f.severity === 'error')).toBe(true);
  });

  it('keeps the whole answer under the cap when the entry runs, with more findings than 64 KB holds', () => {
    const cards = Array.from({ length: 1000 }, (_, n) => cardOf({ id: `card-${n}`, format: 'nope' }));
    const { ran, findings } = run(world(), { cards }, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status, ran.out.slice(0, 300) + ran.err).toBe(0);
    expect(Buffer.byteLength(ran.out)).toBeLessThanOrEqual(LIMIT);
    expect(Buffer.byteLength(ran.out)).toBeLessThanOrEqual(FINDINGS_BUDGET + 1000);
    const shown = findings.slice(0, -1);
    const summary = findings[findings.length - 1]!;
    expect(shown.every((f) => f.code === `${NAME}/card-option-invalid` && f.severity === 'error')).toBe(true);
    expect(shown[0]!.path).toBe('card-0');
    expect(summary.code).toBe(`${NAME}/findings-left-out`);
    expect(summary.message.startsWith(`${1000 - shown.length} more findings are not shown`)).toBe(true);
  });
});
