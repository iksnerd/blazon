import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKS, finding, isPinFinding, type CheckCode } from '../../src/core/checker/catalogue.js';
import { brandErrors } from '../../src/core/checker/index.js';
import { REPO } from '../support/paths.js';

// The pin family is the findings that pair the blazon build with the book (blazon.lock). They are not an error in any token or value, so
// `brandHasErrors` leaves them out. The family is read from the catalogue, so these tests fail when a code is added and the rule misses it.

const codes = Object.keys(CHECKS) as CheckCode[];

describe('the pin family of findings', () => {
  it('has codes, and they are the ones blazon-pin.ts raises', () => {
    const pin = codes.filter(isPinFinding);
    expect(pin.length).toBeGreaterThan(0);
    const raised = [...fs.readFileSync(path.join(REPO, 'src/core/blazon-pin.ts'), 'utf8').matchAll(/finding\('([a-z-]+)'/g)].map((m) => m[1]);
    expect([...new Set(raised)].sort()).toEqual([...pin].sort());
  });

  it('covers every code the catalogue has about blazon.lock, whatever it is called', () => {
    const aboutLock = codes.filter((code) => /blazon\.lock/.test(`${CHECKS[code].summary} ${(CHECKS[code] as { fix?: string }).fix ?? ''}`));
    expect(aboutLock.length).toBeGreaterThan(0);
    for (const code of aboutLock) expect(isPinFinding(code), `${code} is about blazon.lock, so it must be in the pin family`).toBe(true);
  });

  it('is left out of brandErrors, and nothing else is', () => {
    for (const code of codes) {
      const asError = { ...finding(code, { path: 'x', message: 'x' }), severity: 'error' as const };
      expect(brandErrors([asError]).length, code).toBe(isPinFinding(code) ? 0 : 1);
    }
  });
});
