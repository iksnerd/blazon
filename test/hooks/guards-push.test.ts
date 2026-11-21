import { describe, it, expect } from 'vitest';
import * as pushing from '../support/hook-push';
import { LABEL, WORD, markersFile, guardFiles, withGuardScript } from '../support/hook-guards';

// The whole-tree guards in the pre-push hook (part 2 of 2; the pre-commit hook is in guards).
// The whole-tree guards (test/core/no-private-markers.test.ts, test/core/layers.test.ts) read every file of the tree, so `vitest related` never
// selects them for a README or a plugin test. Both hooks run them on every commit, and on every push that does not run the whole suite,
// whatever the paths. These tests run the real guard in a throwaway repo, on the export the hook makes (no .git), with a made-up marker.
// Never the maintainer's own markers file: BLAZON_PRIVATE_MARKERS points to a file made here.

describe('the whole-tree guards in the hooks', () => {
  describe('pre-push', () => {
    /** A clone whose remote holds the base, with the guard files in it, so a push of a README change has a base to compare with. */
    function seeded() {
      const counter = pushing.counterFile();
      const made = pushing.clone(counter);
      pushing.commit(made.dir, { ...guardFiles(), 'package.json': withGuardScript(pushing.manifest(counter)) });
      const sent = pushing.git(made.dir, ['push', '--no-verify', '-q', 'origin', 'main']);
      expect(sent.status, sent.stderr).toBe(0);
      return { ...made, counter };
    }

    it('blocks a push that changes only a plugin README and carries a private marker, and sends nothing', () => {
      const { dir, remote } = seeded();
      pushing.commit(dir, { 'plugins/x/README.md': `# x\n\nMade for ${WORD} Inc.\n` });
      const result = pushing.git(dir, ['push', 'origin', 'main'], { BLAZON_PRIVATE_MARKERS: markersFile() });
      const out = result.stdout + result.stderr;
      expect(result.status, out).not.toBe(0);
      expect(out).not.toContain('the whole suite runs');
      expect(out).toContain(`✗ ${LABEL}`);
      expect(out).toContain('plugins/x/README.md:3 a made-up marker');
      expect(pushing.remoteHead(remote)).not.toBe(pushing.git(dir, ['rev-parse', 'HEAD']).stdout.trim());
    }, 120_000);

    it('blocks a push that changes only a test of a plugin and carries a private marker', () => {
      const { dir } = seeded();
      pushing.commit(dir, { 'test/plugins/x.test.ts': `// ${WORD}\n` });
      const result = pushing.git(dir, ['push', 'origin', 'main'], { BLAZON_PRIVATE_MARKERS: markersFile() });
      const out = result.stdout + result.stderr;
      expect(result.status, out).not.toBe(0);
      expect(out).toContain(`✗ ${LABEL}`);
    }, 120_000);

    it('lets a push with no marker through, and prints the step', () => {
      const { dir, remote } = seeded();
      const sha = pushing.commit(dir, { 'plugins/x/README.md': '# x\n\nNothing private here.\n' });
      const result = pushing.git(dir, ['push', 'origin', 'main'], { BLAZON_PRIVATE_MARKERS: markersFile() });
      const out = result.stdout + result.stderr;
      expect(result.status, out).toBe(0);
      expect(out).toContain(`✓ ${LABEL}`);
      expect(pushing.remoteHead(remote)).toBe(sha);
    }, 120_000);

    it('does not run as a step of its own when the push runs the whole suite, which holds both guards', () => {
      const { dir, counter } = seeded();
      pushing.commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
      const result = pushing.push(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('✓ tests: full suite');
      expect(result.out).not.toContain(LABEL);
      expect(pushing.count(counter)).toBe(1);
    }, 120_000);
  });
});
