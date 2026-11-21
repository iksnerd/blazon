import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { repo, stage, commit, git, BASE } from '../support/hook-commit';
import { LABEL, WORD, markersFile, guardFiles, withGuardScript } from '../support/hook-guards';

// The whole-tree guards in the pre-commit hook (part 1 of 2; the pre-push hook is in guards-push).
// The whole-tree guards (test/core/no-private-markers.test.ts, test/core/layers.test.ts) read every file of the tree, so `vitest related` never
// selects them for a README or a plugin test. Both hooks run them on every commit, and on every push that does not run the whole suite,
// whatever the paths. These tests run the real guard in a throwaway repo, on the export the hook makes (no .git), with a made-up marker.
// Never the maintainer's own markers file: BLAZON_PRIVATE_MARKERS points to a file made here.

describe('the whole-tree guards in the hooks', () => {
  it('names both guards in the test:guards script the hooks run', () => {
    const script: string = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')).scripts['test:guards'];
    expect(script).toContain('test/core/no-private-markers.test.ts');
    expect(script).toContain('test/core/layers.test.ts');
  });

  describe('pre-commit', () => {
    it('blocks a commit that stages only a README line with a private marker, and names the guard step', () => {
      const dir = repo({ ...guardFiles(), 'package.json': withGuardScript(BASE['package.json']!) });
      stage(dir, { 'plugins/x/README.md': `# x\n\nMade for ${WORD} Inc.\n` });
      const result = commit(dir, { BLAZON_PRIVATE_MARKERS: markersFile() });
      expect(result.status, result.out).not.toBe(0);
      expect(result.out).toContain(`✗ ${LABEL}`);
      expect(result.out).toContain('plugins/x/README.md:3 a made-up marker');
    }, 120_000);

    it('lets a commit with no marker through, and prints the step', () => {
      const dir = repo({ ...guardFiles(), 'package.json': withGuardScript(BASE['package.json']!) });
      stage(dir, { 'plugins/x/README.md': '# x\n\nNothing private here.\n' });
      const result = commit(dir, { BLAZON_PRIVATE_MARKERS: markersFile() });
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain(`✓ ${LABEL}`);
    }, 120_000);

    it('runs on a commit whose path asks for no test at all', () => {
      const dir = repo();
      stage(dir, { 'prettier.config.js': 'export default {};\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain(`✓ ${LABEL}`);
    }, 120_000);

    it('is not skipped by the memory of a tree that passed, when the markers file has changed since', () => {
      const dir = repo({ ...guardFiles(), 'package.json': withGuardScript(BASE['package.json']!) });
      stage(dir, { 'plugins/x/README.md': `# x\n\n${WORD}\n` });
      const clean = tempDir('blazon-markers-');
      const none = path.join(clean, 'none.json');
      fs.writeFileSync(none, '[]');
      const first = commit(dir, { BLAZON_PRIVATE_MARKERS: none });
      expect(first.status, first.out).toBe(0);
      expect(git(dir, ['reset', '--soft', 'HEAD~1']).status).toBe(0);
      // Passed once on this tree with no marker; a hook run now with the marker named must still run the guard and fail
      const result = commit(dir, { BLAZON_PRIVATE_MARKERS: markersFile() });
      expect(result.status, result.out).not.toBe(0);
      expect(result.out).toContain(`✗ ${LABEL}`);
    }, 120_000);
  });
});
