import { describe, it, expect } from 'vitest';
import { read } from '../support/spec-helpers.js';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { FRAGMENT_KINDS, readFragments, unreleasedText } from '../../scripts/release.mjs';

// A fragment that the release would refuse must fail the commit hook, not the release day. This uses the release script's own reader.
// The CHANGELOG's Unreleased stays an empty heading: a change adds a file under changelog.d/ and never text there.

describe('changelog.d', () => {
  it('holds only fragments the release script accepts', () => {
    expect(() => readFragments(ROOT_DIR)).not.toThrow();
  });

  it('README.md names every kind the script accepts', () => {
    const readme = read('changelog.d/README.md');
    for (const kind of FRAGMENT_KINDS) expect(readme, `kind "${kind}"`).toContain(`\`${kind}\``);
  });

  it('leaves no hand-written text under Unreleased in CHANGELOG.md', () => {
    expect(unreleasedText(read('CHANGELOG.md')), 'add a fragment under changelog.d/ instead').toBe('');
  });
});
