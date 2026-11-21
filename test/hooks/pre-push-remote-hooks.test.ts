import { describe, it, expect } from 'vitest';
import { git, counterFile, commit, push, suiteArgs, seeded } from '../support/hook-push';

// The pre-push hook on a remote that already holds the branch (part 2 of 2; part 1 is pre-push-remote): when the tests of the hooks themselves are in the whole suite.

describe('the pre-push hook', () => {
  describe('on a remote that already holds the branch', () => {
    describe('the tests of the hooks themselves, which take about a third of the suite', () => {
      // test/hooks reads .githooks/ and the install script by path. The suite re-runs them only when what they read, or they, changed.
      const HOOKS_EXCLUDED = '--exclude=test/hooks/**';

      it('are left out of the whole suite when no hook, script, test of theirs or dependency changed', () => {
        const counter = counterFile();
        const { dir } = seeded(counter);
        commit(dir, { 'examples/x/blazon.json': '// a brand\n' });
        const result = push(dir);
        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain('✓ tests: full suite');
        expect(suiteArgs(counter).join('\n')).toContain(HOOKS_EXCLUDED);
      }, 120_000);

      it.each([
        ['a hook', { 'examples/x/blazon.json': '// a brand\n', '.githooks/note.sh': '#!/bin/sh\necho hi\n' }],
        ['the install script', { 'examples/x/blazon.json': '// a brand\n', 'scripts/install-hooks.mjs': '// install\n' }],
        ['a test of the hooks', { 'examples/x/blazon.json': '// a brand\n', 'test/hooks/x.test.ts': '// t\n' }],
        ['package.json, which can change the tools they run', { 'examples/x/blazon.json': '// a brand\n', 'package-lock.json': '{}\n' }],
      ])(
        'are in the whole suite when %s changed',
        (_what, files) => {
          const counter = counterFile();
          const { dir } = seeded(counter);
          commit(dir, files);
          const result = push(dir);
          expect(result.status, result.out).toBe(0);
          expect(result.out).toContain('✓ tests: full suite');
          expect(suiteArgs(counter).join('\n')).not.toContain(HOOKS_EXCLUDED);
        },
        120_000,
      );

      it('are in the whole suite that BLAZON_PUSH_FULL asks for', () => {
        const counter = counterFile();
        const { dir } = seeded(counter);
        commit(dir, { 'src/a.ts': 'export const a: number = 21;\n' });
        const result = git(dir, ['push', 'origin', 'main'], { BLAZON_PUSH_FULL: '1' });
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(suiteArgs(counter).join('\n')).not.toContain(HOOKS_EXCLUDED);
      }, 120_000);
    });
  });
});
