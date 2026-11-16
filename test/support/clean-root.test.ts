import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dirtyPaths, leftBehind } from './clean-root';
import { spawnSync } from './spawn';
import { tempDir } from './project';

describe('the check that a run leaves the repository root as it found it', () => {
  const repo = () => {
    const dir = fs.realpathSync(tempDir('blazon-root-'));
    const git = (...args: string[]) =>
      spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf-8',
        env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
      });
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(dir, 'tracked'), 'one');
    git('add', '-A');
    expect(git('commit', '-q', '-m', 'base').status).toBe(0);
    return dir;
  };

  it('names a new file and a changed tracked file, and ignores what was already dirty', () => {
    const dir = repo();
    fs.writeFileSync(path.join(dir, 'already'), 'x');
    const before = dirtyPaths(dir)!;
    fs.writeFileSync(path.join(dir, 'stray'), 'y');
    fs.writeFileSync(path.join(dir, 'tracked'), 'two');
    expect(leftBehind(before, dirtyPaths(dir)!)).toEqual([' M tracked', '?? stray']);
  });

  it('reports nothing for a clean run, and has no answer outside the top of a checkout', () => {
    const dir = repo();
    expect(leftBehind(dirtyPaths(dir)!, dirtyPaths(dir)!)).toEqual([]);
    fs.mkdirSync(path.join(dir, 'sub'));
    expect(dirtyPaths(path.join(dir, 'sub'))).toBeUndefined();
    expect(dirtyPaths(tempDir('blazon-nogit-'))).toBeUndefined();
  });
});
