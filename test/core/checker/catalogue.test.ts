import { describe, it, expect } from 'vitest';
import { CHECKS, finding, type CheckCode } from '../../../src/core/checker/catalogue.js';
import { fixFor } from '../../../src/core/checker/fixes.js';
import { read, walk } from '../../support/spec-helpers.js';

const codes = Object.keys(CHECKS) as CheckCode[];

// Notes that may stay without a fix, each with the reason. Every error and every warning has one.
const NOTES_WITHOUT_FIX: Record<string, string> = {
  'asset-local-absent': "the message already carries the category's own `local` sentence, which says how to make the files",
};

describe('check catalogue', () => {
  it('lists its codes sorted and unique', () => {
    expect(codes).toEqual([...new Set(codes)].sort());
  });

  it.each(codes)('%s has a summary, a place and a severity', (code) => {
    const check = CHECKS[code];
    expect(check.summary).toMatch(/^\S.*\.$/);
    expect(['error', 'warning', 'info']).toContain(check.severity);
    expect(check.appliesTo.length).toBeGreaterThan(0);
    for (const place of check.appliesTo) expect(['token', 'group', 'asset', 'page', 'config', 'project']).toContain(place);
    expect(check.rfc).toMatch(/^\d+#\d+$/);
    expect(check.manual).toMatch(/^\d\d-[a-z-]+$/);
  });

  it.each(codes.filter((code) => CHECKS[code].severity === 'error'))('error %s has a fix line', (code) => {
    expect((CHECKS[code] as { fix?: string }).fix, `${code} needs a fix`).toMatch(/^\S.*[.]$/);
  });

  it.each(codes.filter((code) => CHECKS[code].severity === 'warning'))('warning %s has a fix line', (code) => {
    expect((CHECKS[code] as { fix?: string }).fix, `${code} needs a fix`).toMatch(/^\S.*[.]$/);
  });

  it('lets a note go without a fix only when it is listed with a reason', () => {
    const bare = codes.filter((code) => CHECKS[code].severity === 'info' && !('fix' in CHECKS[code]));
    expect(bare).toEqual(Object.keys(NOTES_WITHOUT_FIX).sort());
    for (const reason of Object.values(NOTES_WITHOUT_FIX)) expect(reason.length).toBeGreaterThan(10);
  });

  it('gives fixFor the catalogue text, and nothing for a code with none or an unknown one', () => {
    for (const code of codes) expect(fixFor(code)).toBe((CHECKS[code] as { fix?: string }).fix);
    expect(fixFor('asset-local-absent')).toBeUndefined();
    expect(fixFor('not-a-code')).toBeUndefined();
    expect(fixFor('toString')).toBeUndefined();
  });

  it('takes the severity from the catalogue and keeps only the fields it is given', () => {
    expect(finding('contrast', { path: 'a.b', message: 'm' })).toStrictEqual({ code: 'contrast', severity: 'error', path: 'a.b', message: 'm' });
    expect(finding('theme-missing', { path: 'theme', message: 'm', context: 'locale=ja', file: 'f.json', line: 3 })).toStrictEqual({
      code: 'theme-missing',
      severity: 'info',
      path: 'theme',
      message: 'm',
      context: 'locale=ja',
      file: 'f.json',
      line: 3,
    });
  });

  it('lists every kind of place a check emits at: needs-review, approval-stale and invalid-font-meta', () => {
    expect(CHECKS['needs-review'].appliesTo).toEqual(['token', 'asset', 'group']);
    expect(CHECKS['approval-stale'].appliesTo).toEqual(['token', 'asset']);
    expect(CHECKS['invalid-font-meta'].appliesTo).toEqual(['token', 'group']);
    // what the code points at: a group's pairs, a group or token $type, a section id, a token file's name
    expect(CHECKS['invalid-pair'].appliesTo).toEqual(['group']);
    expect(CHECKS['unknown-type'].appliesTo).toEqual(['token', 'group']);
    expect(CHECKS['section-missing'].appliesTo).toEqual(['project']);
    expect(CHECKS['invalid-json'].appliesTo).toEqual(['project']);
  });

  it('has no dead code: every code is named in an emitter under src', () => {
    const sources = walk('src')
      .filter((file) => file.endsWith('.ts') && !file.endsWith('catalogue.ts') && !file.endsWith('fixes.ts'))
      .map(read)
      .join('\n');
    const dead = codes.filter((code) => !sources.includes(`'${code}'`));
    expect(dead).toEqual([]);
  });
});
