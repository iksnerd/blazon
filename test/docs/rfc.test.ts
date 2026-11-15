import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { TokenType } from '../../src/types/index.js';
import { CHECKS, type CheckCode } from '../../src/core/checker/catalogue.js';
import { read, interfaceKeys, findingCodes, rfcSection } from '../support/spec-helpers.js';
import { assetFingerprint, fingerprintInput, tokenFingerprint } from '../../src/core/checker/review.js';

// RFC 0001 is the normative text. It must name every config key and every finding code the code has, so a reader
// who has only the RFC is not told less than the manual is. Expectations are read from the source; this does not
// judge the prose.

const rfc = read('docs/rfc/0001-data-model.md');

/** The text of one `### ` section of the RFC, from its heading to the next heading. */
function section(heading: string): string {
  const start = rfc.indexOf(`### ${heading}`);
  expect(start, `the RFC has a "### ${heading}" section`).toBeGreaterThan(-1);
  const rest = rfc.slice(start + 4);
  return rest.slice(0, rest.search(/\n##+ /));
}

describe('RFC 0001', () => {
  const configuration = () => section('14. Configuration');

  it.each(interfaceKeys('BlazonConfig'))('lists the config key `%s` in its Configuration section', (key) => {
    expect(configuration()).toContain(`| \`${key}\` |`);
  });

  // Each code is named in backticks in the RFC section its catalogue record names, not just somewhere in the RFC.
  it.each(findingCodes())('names the finding code `%s` in the section its record names', (code) => {
    const { rfc: pointer } = CHECKS[code as CheckCode];
    expect(rfcSection(pointer), `RFC ${pointer}`).toContain(`\`${code}\``);
  });

  // Section 12 says what becomes of each member of the data the viewer receives. A member added to one of these types without
  // a row (or a row for a member that is gone) fails here, so the table cannot fall behind the code. Whether a row tells the
  // truth about src/core/brand/export.ts is for the export tests and a reader; this checks that every member has been decided.
  describe('the BlazonData to brand.json table', () => {
    const mapped = ['BlazonData', 'ParsedTokens', 'TokenItem', 'LogoSet', 'DocItem', 'Asset'];
    const table = () => {
      const start = rfc.indexOf('#### From BlazonData to brand.json');
      expect(start, 'the RFC has the mapping section').toBeGreaterThan(-1);
      const rest = rfc.slice(start + 5);
      return rest.slice(0, rest.search(/\n##+ /));
    };
    /** The `Type.member` names in the first cell of each table row. */
    const rows = () =>
      table()
        .split('\n')
        .filter((line) => line.startsWith('| `'))
        .flatMap((line) => [...(line.split(' | ')[0] ?? '').matchAll(/`([A-Z][A-Za-z]+)\.([A-Za-z]+)`/g)].map((m) => `${m[1]}.${m[2]}`));

    it.each(mapped)('has a row for every member of %s', (name) => {
      const documented = new Set(rows());
      const missing = interfaceKeys(name).filter((key) => !documented.has(`${name}.${key}`));
      expect(missing, `members of ${name} that the table does not name`).toEqual([]);
    });

    it('names no member that the types no longer have', () => {
      const real = new Set(mapped.flatMap((name) => interfaceKeys(name).map((key) => `${name}.${key}`)));
      const stale = rows().filter((name) => !real.has(name));
      expect(stale).toEqual([]);
    });
  });

  it('shows a question that a later section answered as struck through, with the answer', () => {
    const open = rfc.slice(rfc.indexOf('## Open questions'), rfc.indexOf('## References'));
    expect(open).toMatch(/~~Asset metadata \(clear space, minimum size, logo variants\): this RFC or the next\?~~ Decided: this RFC, sections 7 and 10\./);
  });

  // The review fingerprint (section 2) is a contract between implementations: its test vectors are parsed out of the RFC and
  // computed again here, so neither the text nor the code can change without the other.
  describe('the review fingerprint vectors', () => {
    const cell = (text: string): string => text.trim().replace(/^`+|`+$/g, '');
    const rows = () => {
      const start = rfc.indexOf('Test vectors.');
      expect(start, 'the RFC has its test vectors').toBeGreaterThan(-1);
      const lines = rfc.slice(start).split('\n').slice(1);
      const first = lines.findIndex((line) => line.startsWith('|'));
      const table = lines.slice(first + 2);
      return table
        .slice(
          0,
          table.findIndex((line) => !line.startsWith('|')),
        )
        .map((line) => {
          const cells = line.split(/ \| /).map((c) => c.replace(/^\| /, '').replace(/ \|$/, ''));
          return { name: cell(cells[0]!), type: cell(cells[1]!), value: cell(cells[2]!), input: cell(cells[3]!), fingerprint: cell(cells[4]!) };
        });
    };
    const tokenRows = () => rows().filter((r) => !r.name.startsWith('asset'));
    const assetRows = () => rows().filter((r) => r.name.startsWith('asset'));

    it('has at least four token vectors, and the asset vectors', () => {
      expect(tokenRows().length).toBeGreaterThanOrEqual(4);
      expect(assetRows().length).toBeGreaterThanOrEqual(2);
      expect(tokenRows().map((r) => r.type)).toEqual(expect.arrayContaining(['color', 'dimension', 'shadow', 'typography']));
    });

    it('reproduces each token vector: the code writes the RFC text and the RFC text hashes to the digits', () => {
      for (const r of tokenRows()) {
        const item = { type: r.type === 'none' ? undefined : (r.type as TokenType), resolvedValue: JSON.parse(r.value) as unknown };
        expect(fingerprintInput(item), r.name).toBe(r.input);
        expect(tokenFingerprint(item), r.name).toBe(r.fingerprint);
        // the hash a second implementation would compute from the text alone
        expect(createHash('sha256').update(Buffer.from(r.input, 'utf-8')).digest('hex').slice(0, 12), r.name).toBe(r.fingerprint);
      }
    });

    it('reproduces each asset vector from its bytes', () => {
      for (const r of assetRows()) expect(assetFingerprint(Buffer.from(r.value, 'hex')), r.name).toBe(r.fingerprint);
    });
  });
});
