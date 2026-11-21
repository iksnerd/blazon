import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as pushing from '../support/hook-push';
import { SKIPPED, marker, ranCount, touch, failWhile, newFlag } from '../support/hook-cheap-first';

// The pre-push hook runs its cheap steps first (part 2 of 2; the pre-commit hook is in cheap-first).
// The cheap steps (secret scan, typecheck, lint, format, syntax, whole-tree guards) all run, so the person sees every error at once. When one
// failed, the test steps are skipped and the hook says so: they would cost a full run for a commit or push that is refused anyway. A skipped
// test is not a passed one, so a later attempt on the same tree runs it. The stubs below stand for the suites: each appends to a marker file.

describe('the pre-push hook: cheap steps first', () => {
  /** A clone whose remote holds the base, with stub suites that append to the marker; the format check fails while `flag` exists. */
  function seeded(ran: string, flag: string, full: boolean, relatedExit = 0) {
    const counter = pushing.counterFile();
    const made = pushing.clone(counter);
    const manifest = JSON.parse(pushing.manifest(counter));
    manifest.scripts['format:check'] = failWhile(flag);
    manifest.scripts['test:related'] = touch(ran, relatedExit);
    manifest.scripts['test:docs'] = touch(ran);
    manifest.scripts.test = touch(ran);
    pushing.commit(made.dir, { 'package.json': JSON.stringify(manifest) });
    const sent = pushing.git(made.dir, ['push', '--no-verify', '-q', 'origin', 'main']);
    expect(sent.status, sent.stderr).toBe(0);
    pushing.commit(made.dir, full ? { 'examples/x/blazon.json': '// a brand\n' } : { 'src/a.ts': 'export const a: number = 9;\n' });
    return made;
  }

  it.each([
    ['a push that runs only the suites the changed files ask for', false],
    ['a push that runs the whole suite', true],
  ])(
    'skips the tests of %s after a failed cheap step, and runs them once it is fixed',
    (_what, full) => {
      const ran = marker();
      const flag = newFlag(true);
      const { dir, remote } = seeded(ran, flag, full);
      const refused = pushing.push(dir);
      expect(refused.status).not.toBe(0);
      expect(refused.out).toContain('✗ format');
      expect(refused.out).toContain(`${SKIPPED}: format failed; fix those first`);
      expect(ranCount(ran)).toBe(0);
      expect(pushing.remoteHead(remote)).not.toBe(pushing.git(dir, ['rev-parse', 'HEAD']).stdout.trim());

      fs.rmSync(flag);
      const again = pushing.push(dir);
      expect(again.status, again.out).toBe(0);
      expect(again.out).not.toContain(SKIPPED);
      expect(ranCount(ran)).toBeGreaterThan(0);
    },
    240_000,
  );

  it('reports a failed typecheck and a failed format check together', () => {
    const ran = marker();
    const { dir } = seeded(ran, newFlag(true), false);
    pushing.commit(dir, { 'src/a.ts': 'export const a: number = "broken";\n' });
    const result = pushing.push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ typecheck');
    expect(result.out).toContain('✗ format');
    expect(result.out).toContain(`${SKIPPED}: typecheck, format failed; fix those first`);
    expect(ranCount(ran)).toBe(0);
  }, 120_000);

  it('still runs the tests and refuses on their failure when every cheap step passes', () => {
    const ran = marker();
    const { dir, remote } = seeded(ran, newFlag(false), false, 1);
    const result = pushing.push(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ tests: related to the changed files');
    expect(result.out).not.toContain(SKIPPED);
    expect(ranCount(ran)).toBeGreaterThan(0);
    expect(pushing.remoteHead(remote)).not.toBe(pushing.git(dir, ['rev-parse', 'HEAD']).stdout.trim());
  }, 120_000);
});
