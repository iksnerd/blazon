import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { BASE, commit, head, repo, stage } from '../support/hook-commit';
import * as pushing from '../support/hook-push';

// The cheap steps (secret scan, typecheck, lint, format, syntax, whole-tree guards) all run, so the person sees every error at once. When one
// failed, the test steps are skipped and the hook says so: they would cost a full run for a commit or push that is refused anyway. A skipped
// test is not a passed one, so a later attempt on the same tree runs it. The stubs below stand for the suites: each appends to a marker file.

const WORD = 'Zorblax';
const SKIPPED = 'tests not run';

/** A marker file a stub suite appends to, and how often it has run. */
const marker = () => path.join(tempDir('blazon-marker-'), 'ran');
const ranCount = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').length : 0);
const touch = (file: string, exit = 0) => `node -e "require('fs').appendFileSync('${file}', 'x'); process.exit(${exit})" --`;
/** A step that fails while the flag file exists: its verdict changes with no change to the tree. */
const failWhile = (flag: string) => `node -e "process.exit(require('fs').existsSync('${flag}') ? 1 : 0)"`;
const newFlag = (present: boolean) => {
  const flag = path.join(tempDir('blazon-flag-'), 'fail');
  if (present) fs.writeFileSync(flag, '');
  return flag;
};

const commitManifest = (suite: string, scripts: Record<string, string> = {}) => {
  const base = JSON.parse(BASE['package.json']!);
  const stubs = Object.fromEntries(['test:related', 'test:deck', 'test:docs', 'test:files'].map((name) => [name, suite]));
  return JSON.stringify({ ...base, scripts: { ...base.scripts, ...stubs, ...scripts } });
};

describe('the pre-commit hook: cheap steps first', () => {
  it('reports a failed format step, says the tests were not run, and never starts them', () => {
    const ran = marker();
    const dir = repo({ 'package.json': commitManifest(touch(ran)) });
    const before = head(dir);
    stage(dir, { 'src/a.ts': 'export const a: number = 2; // FORMAT_ERROR\n' });
    const result = commit(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ format');
    expect(result.out).toContain(`${SKIPPED}: format failed; fix those first`);
    expect(ranCount(ran)).toBe(0);
    expect(head(dir)).toBe(before);
  }, 120_000);

  it('reports a failed lint and a failed typecheck together, and the tests not run', () => {
    const ran = marker();
    const dir = repo({ 'package.json': commitManifest(touch(ran)) });
    stage(dir, { 'src/a.ts': 'export const a: number = "x"; // LINT_ERROR\n' });
    const result = commit(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ typecheck');
    expect(result.out).toContain('✗ lint');
    expect(result.out).toContain(`${SKIPPED}: typecheck, lint failed; fix those first`);
    expect(ranCount(ran)).toBe(0);
  }, 120_000);

  it('still runs the tests and refuses on their failure when every cheap step passes', () => {
    const ran = marker();
    const dir = repo({ 'package.json': commitManifest(touch(ran, 1)) });
    stage(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
    const result = commit(dir);
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ tests: related to the staged files');
    expect(result.out).not.toContain(SKIPPED);
    expect(ranCount(ran)).toBeGreaterThan(0);
  }, 120_000);

  it('does not remember skipped tests as passed: the same tree, once the cheap step passes, runs them', () => {
    const ran = marker();
    const flag = newFlag(true);
    const dir = repo({ 'package.json': commitManifest(touch(ran), { lint: failWhile(flag) }) });
    stage(dir, { 'src/a.ts': 'export const a: number = 2;\n' });
    const refused = commit(dir);
    expect(refused.status).not.toBe(0);
    expect(refused.out).toContain(`${SKIPPED}: lint failed`);
    expect(ranCount(ran)).toBe(0);
    fs.rmSync(flag);
    const again = commit(dir);
    expect(again.status, again.out).toBe(0);
    expect(again.out).not.toContain(SKIPPED);
    expect(again.out).not.toMatch(/tests: related[^\n]*passed before/);
    expect(ranCount(ran)).toBeGreaterThan(0);
  }, 240_000);

  it('reports a private marker together with a format error', () => {
    const ran = marker();
    const copy = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf-8');
    const markers = path.join(tempDir('blazon-markers-'), 'private-markers.json');
    fs.writeFileSync(markers, JSON.stringify([{ what: 'a made-up marker', pattern: WORD, flags: 'i' }]));
    const manifest = JSON.parse(commitManifest(touch(ran)));
    manifest.scripts['test:guards'] = 'vitest run test/core/no-private-markers.test.ts';
    const dir = repo({
      'package.json': JSON.stringify(manifest),
      'test/core/no-private-markers.test.ts': copy('test/core/no-private-markers.test.ts'),
      'test/plugins/support/spec.ts': copy('test/plugins/support/spec.ts'),
      'test/support/spawn.ts': copy('test/support/spawn.ts'),
    });
    stage(dir, { 'src/a.ts': 'export const a: number = 2; // FORMAT_ERROR\n', 'plugins/x/README.md': `# x\n\nMade for ${WORD} Inc.\n` });
    const result = commit(dir, { BLAZON_PRIVATE_MARKERS: markers });
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('✗ format');
    expect(result.out).toContain('✗ tests: whole-tree guards');
    expect(result.out).toContain('plugins/x/README.md:3 a made-up marker');
    expect(result.out).toContain(`${SKIPPED}: format, tests: whole-tree guards failed; fix those first`);
    expect(ranCount(ran)).toBe(0);
  }, 120_000);
});

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
