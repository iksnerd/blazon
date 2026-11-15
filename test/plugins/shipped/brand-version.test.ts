import { describe, it, expect } from 'vitest';
import { readBrand as logoGeometry } from '../../../src/shipped/logo-geometry/brand.js';
import { readBrand as logoKit } from '../../../src/shipped/logo-kit/brand.js';
import { readBrand as officeTemplate } from '../../../src/shipped/office-template/brand.js';
import { readBrand as platformTokens } from '../../../src/shipped/platform-tokens/brand.js';
import { readBrand as pressKit } from '../../../src/shipped/press-kit/brand.js';
import { readBrand as socialCards } from '../../../src/shipped/social-cards/brand.js';
import { readBrand as brandDeck } from '../../../src/shipped/brand-deck/brand.js';
import { requestFrom } from '../../../src/shipped/favicons/request.js';

// RFC 0001: a reader checks the format and the version before it interprets anything.

const readers = { logoGeometry, logoKit, officeTemplate, platformTokens, pressKit, socialCards, brandDeck } as Record<string, (raw: unknown) => unknown>;

describe.each(Object.entries(readers))('%s reads brand.json', (_name, read) => {
  it.each([
    ['another format', { format: 'something-else', version: 1 }],
    ['no format', { version: 1 }],
    ['a version it does not know', { format: 'blazon-brand', version: 999 }],
    ['no version', { format: 'blazon-brand' }],
    ['a value that is not an object', 'blazon-brand'],
  ])('refuses %s', (_what, brand) => {
    expect(() => read(brand)).toThrow();
  });

  it('accepts version 1 of blazon-brand', () => {
    expect(() => read({ format: 'blazon-brand', version: 1 })).not.toThrow();
  });
});

// The favicons plugin reads the brand from the request, not from a file.
describe('favicons reads the brand in the request', () => {
  const request = (brand: unknown) => JSON.stringify({ v: 1, type: 'check', options: {}, brand });

  it.each([
    ['another format', { format: 'something-else', version: 1 }, /format is "something-else"/],
    ['no format', { version: 1 }, /format is nothing/],
    ['a version it does not know', { format: 'blazon-brand', version: 9 }, /is version 9/],
    ['no version', { format: 'blazon-brand' }, /is version nothing/],
    ['no brand', undefined, /not a blazon brand/],
  ])('refuses %s', (_what, brand, reason) => {
    expect(() => requestFrom(request(brand))).toThrow(reason);
  });

  it('accepts version 1 of blazon-brand', () => {
    expect(() => requestFrom(request({ format: 'blazon-brand', version: 1 }))).not.toThrow();
  });
});
