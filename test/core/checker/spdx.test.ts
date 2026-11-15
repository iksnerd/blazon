import { describe, it, expect } from 'vitest';
import { spdxNote } from '../../../src/core/checker/spdx.js';

// A font's `license` is an SPDX identifier or a name (RFC 0001 §2). Only a value that is trying to be an identifier is judged.

describe('spdxNote', () => {
  it.each([
    'OFL-1.1',
    'MIT',
    'Apache-2.0',
    'Apache-2.0+',
    'OFL-1.1 OR MIT',
    '(MIT OR Apache-2.0)',
    'GPL-2.0-only WITH Classpath-exception-2.0',
    'LicenseRef-acme-font',
    'DocumentRef-acme:LicenseRef-font-eula',
  ])('accepts the identifier or expression %s', (license) => {
    expect(spdxNote(license)).toBeUndefined();
  });

  it.each(['Proprietary', 'Commercial', 'SIL Open Font License 1.1', 'OFL 1.1', 'Commercial desktop and web license, 5 seats', 'ofl or mit', 'Licensed to Acme Ltd'])(
    'leaves the name %s alone',
    (license) => {
      expect(spdxNote(license)).toBeUndefined();
    },
  );

  it('names the closest listed ids for an identifier that is not on the list', () => {
    expect(spdxNote('OFL-1.2')).toMatch(/^"OFL-1\.2" is not an SPDX license identifier \(SPDX license list of \d{4}-\d{2}-\d{2}\); did you mean .*OFL-1\.1/);
    expect(spdxNote('Apache2')).toContain('Apache-2.0');
  });

  it('says how SPDX spells an id that has the wrong case', () => {
    expect(spdxNote('mit')).toBe('"mit" is not spelled as SPDX spells it: use MIT');
    expect(spdxNote('ofl-1.1')).toBe('"ofl-1.1" is not spelled as SPDX spells it: use OFL-1.1');
  });

  it('judges each id in an expression, and an exception only after WITH', () => {
    expect(spdxNote('OFL-1.1 OR Nonesuch-9.0')).toContain('"Nonesuch-9.0" is not an SPDX license identifier');
    expect(spdxNote('GPL-2.0-only WITH nope-1')).toContain('"nope-1"');
    // MIT is a license, not an exception
    expect(spdxNote('GPL-2.0-only WITH MIT')).toContain('"MIT"');
  });
});
