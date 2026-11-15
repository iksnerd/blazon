import { describe, it, expect } from 'vitest';
import { fixFor } from '../../../src/core/checker/fixes.js';

// A finding says what is wrong; its fix says what to do about it, in one sentence an agent can act on without the manual.

describe('fixFor', () => {
  it.each([
    ['invalid-json', 'JSON'],
    ['unresolved-alias', 'alias'],
    ['circular-alias', 'loop'],
    ['invalid-value', '$type'],
    ['contrast', 'colors'],
    ['directive-invalid', 'directive'],
    ['config-invalid', 'blazon.json'],
    ['invalid-frontmatter', 'YAML'],
    ['plugin-failed', 'manual'],
  ])('gives %s a one-sentence fix that mentions %s', (code, word) => {
    const fix = fixFor(code)!;
    expect(fix).toContain(word);
    expect(fix.split('\n')).toHaveLength(1);
    expect(fix.endsWith('.')).toBe(true);
  });

  it('gives nothing for a code with no fix to give', () => {
    expect(fixFor('asset-local-absent')).toBeUndefined();
    expect(fixFor('no-such-code')).toBeUndefined();
  });
});
