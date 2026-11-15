import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundFindings, FINDINGS_BUDGET } from '../../../src/shipped/shared/bound.js';
import { runPlugin } from '../../../src/shipped/shared/plugin.js';
import { STDOUT_LIMIT } from '../../../src/plugins/wire/limits.js';

// The findings of every shipped plugin against the 64 KB a build call may print (RFC 0005 section 6). The host cannot shrink an answer that
// was printed, so runPlugin bounds the findings of whatever a plugin's build answers; this is the seam for press-kit, logo-kit, favicons,
// office-template and print-book, which had no bound of their own. social-cards' own cases are in social-cards/bound.test.ts.

const NAME = 'blazon.example';
type Severity = 'error' | 'warning' | 'info';
const finding = (n: number, severity: Severity) => ({ code: `${NAME}/x`, severity, path: `item-${n}`, message: `item ${n}: ${'y'.repeat(200)}` });

describe('boundFindings', () => {
  it('returns the findings untouched when they fit', () => {
    const few = [finding(1, 'info'), finding(2, 'error')];
    expect(boundFindings(few, NAME)).toBe(few);
  });

  it('drops notes before warnings before errors, keeps the order found within a group, and names the plugin in the summary', () => {
    const all = [
      ...Array.from({ length: 150 }, (_, n) => finding(n, 'info')),
      ...Array.from({ length: 150 }, (_, n) => finding(1000 + n, 'warning')),
      ...Array.from({ length: 150 }, (_, n) => finding(2000 + n, 'error')),
    ];
    const bound = boundFindings(all, NAME);
    const summary = bound[bound.length - 1]!;
    const shown = bound.slice(0, -1);
    expect(summary).toMatchObject({ code: `${NAME}/findings-left-out`, severity: 'warning' });
    expect(summary.message).toMatch(new RegExp(`^${all.length - shown.length} more findings are not shown`));
    expect(shown.slice(0, 150).every((f) => f.severity === 'error')).toBe(true);
    expect(shown.slice(0, 150).map((f) => f.path)).toEqual(all.slice(300).map((f) => f.path));
    expect(shown.some((f) => f.severity === 'info')).toBe(false);
  });

  it('keeps the whole answer under the cap even when one finding is as long as a message can be', () => {
    const long = Array.from({ length: 80 }, (_, n) => ({ ...finding(n, 'error'), message: 'z'.repeat(5000) }));
    const bound = boundFindings(long, NAME);
    expect(Buffer.byteLength(JSON.stringify({ findings: bound }) + '\n')).toBeLessThanOrEqual(STDOUT_LIMIT);
    expect(Buffer.byteLength(JSON.stringify(bound))).toBeLessThanOrEqual(FINDINGS_BUDGET + 1000);
  });
});

describe('runPlugin', () => {
  afterEach(() => vi.restoreAllMocks());

  const print = async (answer: unknown): Promise<string> => {
    let out = '';
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => ((out += String(chunk)), true));
    expect(await runPlugin([], {}, async () => answer, 'failed', NAME)).toBe(0);
    return out;
  };

  it('prints findings that would not fit the cap as a bounded list, so the call is not plugin-failed', async () => {
    const out = await print({ findings: Array.from({ length: 1000 }, (_, n) => finding(n, n % 2 ? 'error' : 'warning')) });
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(STDOUT_LIMIT);
    const { findings } = JSON.parse(out) as { findings: { code: string; severity: string }[] };
    expect(findings[findings.length - 1]!.code).toBe(`${NAME}/findings-left-out`);
    expect(findings[0]!.severity).toBe('error');
  });

  it('prints an answer that fits, and an answer with no findings, as it is', async () => {
    expect(JSON.parse(await print({ findings: [finding(1, 'info')] }))).toEqual({ findings: [finding(1, 'info')] });
    expect(JSON.parse(await print({ ok: true }))).toEqual({ ok: true });
  });
});
