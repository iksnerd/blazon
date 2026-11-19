import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { repo, stage, commit, git, BASE } from '../support/hook-commit';
import * as pushing from '../support/hook-push';

// The whole-tree guards (test/core/no-private-markers.test.ts, test/core/layers.test.ts) read every file of the tree, so `vitest related` never
// selects them for a README or a plugin test. Both hooks run them on every commit, and on every push that does not run the whole suite,
// whatever the paths. These tests run the real guard in a throwaway repo, on the export the hook makes (no .git), with a made-up marker.
// Never the maintainer's own markers file: BLAZON_PRIVATE_MARKERS points to a file made here.

const LABEL = 'tests: whole-tree guards';
const WORD = 'Zorblax';

/** The marker file the guard reads, naming the made-up word. */
const markersFile = (): string => {
  const file = path.join(tempDir('blazon-markers-'), 'private-markers.json');
  fs.writeFileSync(file, JSON.stringify([{ what: 'a made-up marker', pattern: WORD, flags: 'i' }]));
  return file;
};

/** The real guard and what it imports, copied from this repository, and a `test:guards` script that runs only it (the other guard needs the layers of src/). */
const guardFiles = (): Record<string, string> => {
  const copy = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf-8');
  return {
    'test/core/no-private-markers.test.ts': copy('test/core/no-private-markers.test.ts'),
    'test/plugins/support/spec.ts': copy('test/plugins/support/spec.ts'),
    'test/support/spawn.ts': copy('test/support/spawn.ts'),
  };
};
const withGuardScript = (manifest: string): string => {
  const parsed = JSON.parse(manifest);
  parsed.scripts['test:guards'] = 'vitest run test/core/no-private-markers.test.ts';
  return JSON.stringify(parsed);
};

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
