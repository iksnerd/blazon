import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from '../support/project';
import { compareVersions, releaseChangelog } from '../../scripts/release.mjs';

// scripts/release.mjs cuts a release in the git repository of the current folder. These tests run it in throwaway repositories, whose
// own `check` script stands in for `npm run check`. It never pushes, and none of these has a remote.

const SCRIPT = path.join(ROOT_DIR, 'scripts/release.mjs');

const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf-8' });

/** A repository on `branch` with one commit: a package at 0.1.0 whose check script is `check`, and a changelog with notes. */
function repo(options: { branch?: string; check?: string } = {}): string {
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
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.1.0', scripts: { check: options.check ?? 'true' } }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n### Added\n\n- a thing\n');
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
