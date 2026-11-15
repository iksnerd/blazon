import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';
import { loadConfig } from '../../src/core/config/index.js';
import { findShipped, shippedDirectory, shippedProblem, type Shipped } from '../../src/plugins/pins/shipped.js';

// Each example turns on the deck as its build plugin, by name alone: blazon.brand-deck ships with blazon, so there is nothing to pin
// and no link to a program in .blazon/plugins, and `blazon build` writes a PDF for every example brand.
const EXAMPLES = ['auth0', 'slack', 'blazon'];
/** The folder of an example: blazon's own is in the repository, the others are reference material. */
const exampleDir = (name: string) => (name === 'blazon' ? path.join(REPO, 'examples', name) : referencePath('examples', name));
const has = (name: string) => name === 'blazon' || hasReference('examples', name);

describe('the example brands draw a deck', () => {
  for (const name of EXAMPLES) {
    it.skipIf(!has(name))(`${name} lists blazon.brand-deck among its plugins`, async () => {
      const config = await loadConfig(exampleDir(name));
      expect(config.plugins).toContainEqual(expect.objectContaining({ name: 'blazon.brand-deck' }));
    });
  }

  it.skipIf(!has('auth0'))('auth0 also prints its brand book, as a PDF and a PowerPoint file, with blazon.print-book', async () => {
    const config = await loadConfig(exampleDir('auth0'));
    expect(config.plugins).toEqual([expect.objectContaining({ name: 'blazon.brand-deck' }), expect.objectContaining({ name: 'blazon.print-book' })]);
    // by name alone, as a company would: blazon ships it, so the example has no link to it in .blazon/plugins
    expect(fs.existsSync(path.join(exampleDir('auth0'), '.blazon/plugins/blazon-blazon.print-book'))).toBe(false);
    const shipped = findShipped(shippedDirectory(), 'blazon.print-book');
    expect(shipped).toEqual(expect.objectContaining({ entry: path.join(REPO, 'plugins/blazon.print-book/bin/blazon-blazon.print-book.🔌') }));
    expect(shippedProblem(shipped as Shipped)).toBeUndefined();
  });

  for (const name of EXAMPLES) {
    it.skipIf(!has(name))(`${name} has no link to a program in .blazon/plugins: blazon.brand-deck is found as a shipped plugin`, () => {
      expect(fs.existsSync(path.join(exampleDir(name), '.blazon/plugins/blazon-blazon.brand-deck'))).toBe(false);
    });
  }

  it('is found where blazon ships it, and passes the check blazon makes of an install before it runs a program', () => {
    const shipped = findShipped(shippedDirectory(), 'blazon.brand-deck');
    expect(shipped).toEqual(expect.objectContaining({ entry: path.join(REPO, 'plugins/blazon.brand-deck/bin/blazon-blazon.brand-deck.🔌') }));
    expect(shippedProblem(shipped as Shipped)).toBeUndefined();
  });

  it('is gone from scripts/: the Python deck and its launcher are not shipped any more', () => {
    for (const file of ['brand-deck.py', 'blazon-blazon.brand-deck']) expect(fs.existsSync(path.join(REPO, 'scripts', file))).toBe(false);
  });
});
