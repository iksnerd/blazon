import { describe, it, expect } from 'vitest';
import { scrub, REDACTED } from '../../../src/plugins/host/scrub.js';

// The forms a leaked value takes (RFC 0005 section 3.5) beyond the plain, base64 and uppercase percent-encoded ones: lowercase
// percent escapes, base64 of a larger string the value sits inside at any of the three alignments, and JSON string escapes.

const VALUE = 'hidden-value-0042-xyz';

describe('percent-encoding in lowercase', () => {
  it('is scrubbed like the uppercase form', () => {
    expect(scrub('GET /x?k=a%2fb%3dc', ['a/b=c'])).toBe(`GET /x?k=${REDACTED}`);
    expect(scrub('GET /x?k=a%2Fb%3Dc', ['a/b=c'])).toBe(`GET /x?k=${REDACTED}`);
  });
});

describe('base64 of a string the value sits inside', () => {
  // The prefix decides where the value starts among the three-byte groups: 3 bytes is aligned, 4 is one past, 2 is two before
  it.each(['abc:', 'api:', 'a:', 'user-name:'])('is scrubbed from Basic auth built as base64("%s" + value)', (prefix) => {
    const standard = Buffer.from(prefix + VALUE).toString('base64');
    const url = Buffer.from(prefix + VALUE).toString('base64url');
    for (const form of [standard, url]) {
      const out = scrub(`Authorization: Basic ${form} end`, [VALUE]);
      expect(out).toContain(REDACTED);
      // the middle of the encoded value, which the plain forms never matched, is gone
      expect(out).not.toContain(form.slice(18, 28));
    }
  });

  it.each(['', ':tail', ':more-data-after'])('is scrubbed when more bytes follow the value ("%s")', (suffix) => {
    for (const prefix of ['abc:', 'api:', 'a:']) {
      const form = Buffer.from(prefix + VALUE + suffix).toString('base64');
      expect(scrub(`x ${form}`, [VALUE])).toContain(REDACTED);
    }
  });

  it('does not touch unrelated base64', () => {
    const other = Buffer.from('api:something-else-entirely').toString('base64');
    expect(scrub(other, [VALUE])).toBe(other);
  });
});

describe('JSON string escapes', () => {
  it('scrubs a non-ASCII value written as \\u escapes, in either case of hex', () => {
    expect(scrub('{"m":"caf\\u00e9-tok"}', ['café-tok'])).toBe(`{"m":"${REDACTED}"}`);
    expect(scrub('{"m":"caf\\u00E9-tok"}', ['café-tok'])).toBe(`{"m":"${REDACTED}"}`);
  });

  it('scrubs the escapes Go adds for < > &', () => {
    expect(scrub('{"m":"a\\u003cb\\u0026c\\u003e"}', ['a<b&c>'])).toBe(`{"m":"${REDACTED}"}`);
  });

  it('scrubs a value with a quote or backslash as JSON writes it', () => {
    expect(scrub('{"m":"a\\"b\\\\c"}', ['a"b\\c'])).toBe(`{"m":"${REDACTED}"}`);
  });
});
