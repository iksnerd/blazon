import { describe, it, expect } from 'vitest';
import { commit, repo, stage, which } from '../support/hook-commit';

// Which tests a commit runs, part 1 of 2 (the other half is pre-commit-which-deleted): the full-suite notice, hook and script changes,
// the lock and the plugin build, and vite.config.ts.

describe('the pre-commit hook', () => {
  describe('which tests a commit runs, by what is staged', () => {
    it('says the full suite waits for the push, for a path that asks for it', () => {
      const dir = repo();
      stage(dir, { 'examples/x/blazon.json': '// config\n' });
      const result = commit(dir);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain('the full suite runs at push, not at commit');
    }, 120_000);

    it('runs only the tests that read a hook or a script by name', () => {
      const hooks = repo({ 'test/hooks/keep.txt': 'x\n' });
      stage(hooks, { '.githooks/note.sh': '#!/bin/sh\necho hi\n' });
      expect(which(commit(hooks).out)).toEqual(['files']);
      const lock = repo({ 'test/scripts/shipped-lock.test.ts': '// t\n' });
      stage(lock, { 'scripts/shipped-lock.mjs': '// lock\n' });
      expect(which(commit(lock).out)).toEqual(['files']);
    }, 240_000);

    it.each([
      ['a README in a plugin folder', { 'plugins/blazon.x/README.md': '# changed\n' }],
      ['a package.json in a plugin folder', { 'plugins/blazon.x/package.json': '{"type":"commonjs"}\n' }],
    ])(
      'runs the tests that check the lock against the plugin folders, for %s, and not the manual tests',
      (_what, files) => {
        // The lock holds a digest of each plugin folder, so a changed README alters it. A README there is not a page of the manual.
        const dir = repo({ 'test/plugins/shipped/shipped.test.ts': '// t\n', 'test/plugins/shipped/conformance.test.ts': '// t\n' });
        stage(dir, files);
        expect(which(commit(dir).out)).toEqual(['files']);
      },
      240_000,
    );

    it('asks for the whole suite when a commit changes vite.config.ts, which builds every bundle of the package but the plugins', () => {
      const dir = repo({ 'vite.config.ts': "export default { external: ['vite'] };\n" });
      stage(dir, { 'vite.config.ts': "export default { external: ['vite', 'cac'] };\n" });
      expect(which(commit(dir).out)).toEqual([]);
    }, 240_000);

    it('runs the tests that read the plugin build, and not the whole suite, when a commit changes it', () => {
      const dir = repo({
        'test/scripts/shipped-lock.test.ts': '// t\n',
        'test/plugins/shipped/conformance.test.ts': '// t\n',
        'test/plugins/shipped/print-book.test.ts': '// t\n',
      });
      stage(dir, { 'scripts/build-plugins.mjs': '// build\n' });
      expect(which(commit(dir).out)).toEqual(['files']);
    }, 240_000);
  });
});
