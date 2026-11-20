import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from '../support/project';
import { compareVersions, releaseChangelog, readFragments, assembleSection, previewChangelog } from '../../scripts/release.mjs';

// scripts/release.mjs cuts a release in the git repository of the current folder. These tests run it in throwaway repositories, whose
// own `check` script stands in for `npm run check`. It never pushes, and none of these has a remote.

const SCRIPT = path.join(ROOT_DIR, 'scripts/release.mjs');

const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf-8' });

/**
 * A repository on `branch` with one commit: a package at 0.1.0 whose check script is `check`, a changelog with notes and a docs/stats.json
 * that records the version. The `docs:stats` script rewrites that file from package.json and `test:docs` (the script `testDocs` when given)
 * fails when the file's version is not the package's, as the real ones do.
 */
function repo(options: { branch?: string; check?: string; testDocs?: string; changelog?: string; fragments?: Record<string, string> } = {}): string {
  const dir = tempDir('blazon-release-');
  const run = (...args: string[]) => {
    const result = git(dir, ...args);
    expect(result.status, result.stderr).toBe(0);
  };
  run('init', '-q', '-b', options.branch ?? 'main');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  run('config', 'commit.gpgsign', 'false');
  run('config', 'tag.gpgsign', 'false');
  const statsJs = "const fs=require('fs');const v=require('./package.json').version;";
  const scripts = {
    check: options.check ?? 'true',
    'docs:stats': `node -e "${statsJs}fs.writeFileSync('docs/stats.json',JSON.stringify({version:v})+'\\n')"`,
    'test:docs': options.testDocs ?? `node -e "${statsJs}if(require('./docs/stats.json').version!==v){console.error('stale');process.exit(1)}"`,
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.1.0', scripts }, null, 2) + '\n');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs/stats.json'), '{"version":"0.1.0"}\n');
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), options.changelog ?? '# Changelog\n\n## Unreleased\n\n### Added\n\n- a thing\n');
  if (options.fragments) {
    fs.mkdirSync(path.join(dir, 'changelog.d'));
    for (const [name, body] of Object.entries(options.fragments)) fs.writeFileSync(path.join(dir, 'changelog.d', name), body);
  }
  run('add', '.');
  run('commit', '-q', '-m', 'start');
  return dir;
}

const release = (dir: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf-8' });

describe('ordering versions', () => {
  it('orders numbers, not strings, and puts a prerelease before its release', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
  });
});

describe('the changelog', () => {
  it('keeps an empty Unreleased above the new heading', () => {
    expect(releaseChangelog('# C\n\n## Unreleased\n\n- a\n', '0.2.0', '2026-11-15')).toBe('# C\n\n## Unreleased\n\n## 0.2.0 (2026-11-15)\n\n- a\n');
  });
});

describe('refusing to release', () => {
  it('without a version, and with one that is not a semantic version', () => {
    const dir = repo();
    expect(release(dir).status).toBe(1);
    const bad = release(dir, 'v0.2.0');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('not a semantic version');
  });

  it('on a branch other than main', () => {
    const result = release(repo({ branch: 'topic' }), '0.2.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('on main');
  });

  it('with a modified file or an untracked one', () => {
    const modified = repo();
    fs.appendFileSync(path.join(modified, 'CHANGELOG.md'), 'more\n');
    expect(release(modified, '0.2.0').stderr).toContain('not clean');
    const untracked = repo();
    fs.writeFileSync(path.join(untracked, 'new.txt'), 'x');
    expect(release(untracked, '0.2.0').stderr).toContain('not clean');
  });

  it('for a version that is not greater', () => {
    const dir = repo();
    expect(release(dir, '0.1.0').stderr).toContain('not greater');
    expect(release(dir, '0.0.9').stderr).toContain('not greater');
  });

  it('for a tag that exists', () => {
    const dir = repo();
    git(dir, 'tag', 'v0.2.0');
    const result = release(dir, '0.2.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists');
  });

  it('when the changelog has no Unreleased heading, and changes nothing', () => {
    const dir = repo();
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n');
    git(dir, 'commit', '-qam', 'no heading');
    expect(release(dir, '0.2.0').stderr).toContain('Unreleased');
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
    expect(git(dir, 'tag', '--list').stdout).toBe('');
  });

  it('when the check fails, and changes nothing', () => {
    const dir = repo({ check: 'false' });
    const result = release(dir, '0.2.0');
    expect(result.status).not.toBe(0);
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
    expect(git(dir, 'tag', '--list').stdout).toBe('');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).version).toBe('0.1.0');
  });
});

describe('the docs stats', () => {
  it('are regenerated and recorded in the release commit', () => {
    const dir = repo();
    const result = release(dir, '0.2.0');
    expect(result.status, result.stderr).toBe(0);
    const files = git(dir, 'show', '--name-only', '--format=', 'HEAD').stdout.split('\n').filter(Boolean).sort();
    expect(files).toEqual(['CHANGELOG.md', 'docs/stats.json', 'package.json']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'docs/stats.json'), 'utf-8')).version).toBe('0.2.0');
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
  }, 60_000);

  it('stop the release, with no commit and no tag, when the docs tests fail', () => {
    const dir = repo({ testDocs: 'false' });
    const before = git(dir, 'rev-parse', 'HEAD').stdout;
    const result = release(dir, '0.2.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs tests failed');
    expect(git(dir, 'rev-parse', 'HEAD').stdout).toBe(before);
    expect(git(dir, 'tag', '--list').stdout).toBe('');
  }, 60_000);
});

describe('releasing', () => {
  it('bumps the version, dates the changelog, commits and tags, and prints the push', () => {
    const dir = repo();
    const result = release(dir, '0.2.0');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('git push origin main v0.2.0');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).version).toBe('0.2.0');
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toMatch(/## Unreleased\n\n## 0\.2\.0 \(\d{4}-\d{2}-\d{2}\)\n\n### Added/);
    expect(git(dir, 'log', '-1', '--format=%s').stdout.trim()).toBe('release v0.2.0');
    expect(git(dir, 'cat-file', '-t', 'v0.2.0').stdout.trim()).toBe('tag');
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
    expect(git(dir, 'remote').stdout).toBe('');
  }, 60_000);
});

// Change fragments: one file per change under changelog.d/, assembled by the release (changelog.d/README.md).
const EMPTY = '# Changelog\n\n## Unreleased\n\n## 0.1.0 (2026-01-01)\n\n### Added\n\n- old\n';

describe('change fragments', () => {
  const fragments = {
    'b-fix.fixed.md': 'Acme logos no longer\nlose their margin.\n',
    'a-new.added.md': 'A new `acme` command.\n',
    'c-more.added.md': 'Another addition.\n',
    'd-change.changed.md': 'Changed a default.\n',
    'e-break.breaking.md': 'Removed a key.\n',
    'README.md': 'not a fragment\n',
  };

  it('are assembled in the CHANGELOG order of kinds and file-name order within a kind, wrapped lines indented', () => {
    const found = readFragments(repo({ changelog: EMPTY, fragments }));
    expect(found.map((f) => f.file)).toEqual(['a-new.added.md', 'b-fix.fixed.md', 'c-more.added.md', 'd-change.changed.md', 'e-break.breaking.md']);
    expect(assembleSection(found, '0.2.0', '2026-11-20')).toBe(
      [
        '## 0.2.0 (2026-11-20)',
        '### Breaking\n\n- Removed a key.',
        '### Added\n\n- A new `acme` command.\n- Another addition.',
        '### Changed\n\n- Changed a default.',
        '### Fixed\n\n- Acme logos no longer\n  lose their margin.',
      ].join('\n\n'),
    );
  });

  it('are refused by name: an unknown kind, no kind, a bad character', () => {
    const bad = (name: string) => () => readFragments(repo({ changelog: EMPTY, fragments: { [name]: 'text\n' } }));
    expect(bad('x.removed.md')).toThrow(/x\.removed\.md.*kind/);
    expect(bad('x.md')).toThrow(/x\.md/);
    expect(bad('Upper.added.md')).toThrow(/Upper\.added\.md.*\[a-z0-9\._-\]/);
    expect(bad('sp ace.added.md')).toThrow(/sp ace\.added\.md/);
    expect(bad('x.added.txt')).toThrow(/x\.added\.txt/);
  });

  it('are refused for an empty body and for an em-dash', () => {
    expect(() => readFragments(repo({ changelog: EMPTY, fragments: { 'e.added.md': ' \n\n' } }))).toThrow(/e\.added\.md.*empty/);
    expect(() => readFragments(repo({ changelog: EMPTY, fragments: { 'd.added.md': 'one — two\n' } }))).toThrow(/d\.added\.md.*em-dash/);
  });

  it('are the release: written as the new section, removed with git rm in the release commit', () => {
    const dir = repo({ changelog: EMPTY, fragments });
    const result = release(dir, '0.2.0');
    expect(result.status, result.stderr).toBe(0);
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toMatch(
      /## Unreleased\n\n## 0\.2\.0 \(\d{4}-\d{2}-\d{2}\)\n\n### Breaking\n\n- Removed a key\.\n\n### Added\n\n- A new `acme` command\.\n- Another addition\.\n\n### Changed[^]*### Fixed\n\n- Acme logos no longer\n {2}lose their margin\.\n\n## 0\.1\.0/,
    );
    const stat = git(dir, 'show', '--name-status', '--format=', 'HEAD').stdout;
    for (const name of Object.keys(fragments).filter((n) => n !== 'README.md')) expect(stat).toContain(`D\tchangelog.d/${name}`);
    expect(stat).not.toContain('README.md');
    expect(fs.readdirSync(path.join(dir, 'changelog.d'))).toEqual(['README.md']);
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
  }, 60_000);

  it('keep a comment under Unreleased and do not count it as text', () => {
    const text = '# C\n\n## Unreleased\n\n<!-- changelog.d/README.md -->\n\n## 0.1.0 (2026-01-01)\n';
    const out = releaseChangelog(text, '0.2.0', '2026-11-20', readFragments(repo({ changelog: text, fragments: { 'a.added.md': 'x\n' } })));
    expect(out).toBe('# C\n\n## Unreleased\n\n<!-- changelog.d/README.md -->\n\n## 0.2.0 (2026-11-20)\n\n### Added\n\n- x\n\n## 0.1.0 (2026-01-01)\n');
  });

  it('refuse a release with a bad fragment, with fragments next to hand-written text, and with nothing at all; nothing changes', () => {
    const cases: [Parameters<typeof repo>[0], RegExp][] = [
      [{ changelog: EMPTY, fragments: { 'x.removed.md': 'text\n' } }, /x\.removed\.md/],
      [{ fragments: { 'x.added.md': 'text\n' } }, /hand-written/],
      [{ changelog: EMPTY }, /nothing to release/],
    ];
    for (const [options, message] of cases) {
      const dir = repo(options);
      const result = release(dir, '0.2.0');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(message);
      expect(git(dir, 'status', '--porcelain').stdout).toBe('');
      expect(git(dir, 'tag', '--list').stdout).toBe('');
    }
  }, 60_000);

  it('are previewed without changing anything', () => {
    const dir = repo({ changelog: EMPTY, fragments });
    const out = previewChangelog(dir, new Date('2026-11-20T00:00:00Z'));
    expect(out).toContain('## <version> (2026-11-20)\n\n### Breaking');
    expect(git(dir, 'status', '--porcelain').stdout).toBe('');
  });
});
