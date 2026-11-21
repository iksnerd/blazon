import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import * as c from '../support/hook-commit';
import * as p from '../support/hook-push';

// The tests that start Chrome are listed in test/browser-tests.txt. pre-commit leaves them out of its related run, and pre-push and
// `npm test` run them. The throwaway repos below have the real hooks and a stand-in for each vitest script that writes down its arguments.

const LIST = '# the browser tests\ntest/plugins/shipped/print-book*.test.ts\ntest/plugins/shipped/favicons.test.ts\n';
const EXCLUDES = ['--exclude=test/plugins/shipped/print-book*.test.ts', '--exclude=test/plugins/shipped/favicons.test.ts'];

/** A stand-in for `vitest related` that appends the arguments it was given, one line a run, to `file`. */
const recorder = (file: string) => `node -e "require('fs').appendFileSync('${file}', process.argv.slice(1).join(' ') + '\\n')" --`;
const lines = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').trim().split('\n') : []);

describe('the tests that start Chrome, in the hooks', () => {
  it('pre-commit leaves them out of the related run, whatever is staged', () => {
    const record = path.join(tempDir('blazon-related-'), 'args');
    const manifest = JSON.parse(c.BASE['package.json']!);
    manifest.scripts['test:related'] = recorder(record);
    const dir = c.repo({ 'package.json': JSON.stringify(manifest), 'test/browser-tests.txt': LIST });
    c.stage(dir, { 'src/a.ts': 'export const a: number = 5;\n', 'test/plugins/shipped/print-book-x.test.ts': '// a browser test\n' });
    const result = c.commit(dir);
    expect(result.status, result.out).toBe(0);
    expect(c.which(result.out)).toContain('related');
    const [run, ...more] = lines(record);
    expect(more).toEqual([]);
    for (const exclude of EXCLUDES) expect(run).toContain(exclude);
    // The staged files are still handed over: the exclusion is the only difference
    expect(run).toContain('src/a.ts');
    expect(run).toContain('test/plugins/shipped/print-book-x.test.ts');
  }, 120_000);

  it('pre-commit runs the related tests as before when there is no list', () => {
    const record = path.join(tempDir('blazon-related-'), 'args');
    const manifest = JSON.parse(c.BASE['package.json']!);
    manifest.scripts['test:related'] = recorder(record);
    const dir = c.repo({ 'package.json': JSON.stringify(manifest) });
    c.stage(dir, { 'src/a.ts': 'export const a: number = 5;\n' });
    expect(c.commit(dir).status).toBe(0);
    expect(lines(record).join('\n')).not.toContain('--exclude');
  }, 120_000);

  it('pre-push does not leave them out: neither its related run nor its full suite', () => {
    const counter = p.counterFile();
    const record = path.join(tempDir('blazon-related-'), 'args');
    const { dir } = p.clone(counter);
    const manifest = JSON.parse(p.manifest(counter));
    manifest.scripts['test:related'] = recorder(record);
    p.write(dir, { 'package.json': JSON.stringify(manifest), 'test/browser-tests.txt': LIST });
    p.git(dir, ['add', '-A']);
    expect(p.git(dir, ['commit', '-q', '--no-verify', '-m', 'list']).status).toBe(0);
    expect(p.git(dir, ['push', '--no-verify', '-q', 'origin', 'main']).status).toBe(0);
    p.commit(dir, { 'src/a.ts': 'export const a: number = 6;\n' });
    const related = p.push(dir);
    expect(related.status, related.out).toBe(0);
    expect(related.out).toContain('✓ tests: related to the changed files');
    expect(lines(record)).toHaveLength(1);
    expect(lines(record)[0]).toContain('src/a.ts');
    expect(lines(record)[0]).not.toContain('--exclude');
    // A change that asks for the whole suite: it runs, with no exclusion
    p.commit(dir, { 'mystery.bin': 'x\n' });
    const full = p.push(dir);
    expect(full.status, full.out).toBe(0);
    expect(full.out).toContain('✓ tests: full suite');
    // (the full suite leaves out test/hooks by itself when the base is known: that is the only exclusion it has)
    expect(p.suiteArgs(counter).join('\n')).not.toMatch(/print-book|favicons/);
  }, 120_000);

  // The shell half above proves the arguments; this proves what vitest does with them on the real list, without starting a Chrome
  describe('the arguments of the real list, given to vitest', () => {
    const excludes = spawnSync('bash', ['-c', `. "${path.join(REPO, '.githooks/lib.sh')}"; browser_excludes "${REPO}"`], { encoding: 'utf-8' })
      .stdout.split('\n')
      .filter(Boolean);
    const listed = (args: string[]) => spawnSync('npx', ['vitest', 'list', '--filesOnly', ...args, 'print-book-load'], { cwd: REPO, encoding: 'utf-8' }).stdout;

    it('turn every line of the list into one --exclude', () => {
      expect(excludes).toEqual(
        fs
          .readFileSync(path.join(REPO, 'test/browser-tests.txt'), 'utf-8')
          .split('\n')
          .filter((line) => line !== '' && !line.startsWith('#'))
          .map((line) => `--exclude=${line}`),
      );
    });

    it('take a browser test out of vitest, which otherwise selects it', () => {
      expect(listed([])).toContain('print-book-load.test.ts');
      expect(listed(excludes)).not.toContain('print-book-load.test.ts');
    }, 120_000);
  });
});
