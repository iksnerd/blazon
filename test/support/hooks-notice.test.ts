import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hooksNotice, hooksState } from './hooks-notice.js';

describe('hooksNotice', () => {
  it('says to run npm run hooks in a checkout without the hooks path', () => {
    expect(hooksNotice({ inCheckout: true, hooksPath: null })).toContain('npm run hooks');
    expect(hooksNotice({ inCheckout: true, hooksPath: '/elsewhere/hooks' })).toContain('npm run hooks');
  });

  it('is silent when the hooks path is .githooks', () => {
    expect(hooksNotice({ inCheckout: true, hooksPath: '.githooks' })).toBeNull();
    expect(hooksNotice({ inCheckout: true, hooksPath: '.githooks/' })).toBeNull();
  });

  it('is silent outside a checkout, whatever the hooks path', () => {
    expect(hooksNotice({ inCheckout: false, hooksPath: null })).toBeNull();
    expect(hooksNotice({ inCheckout: false, hooksPath: 'x' })).toBeNull();
  });
});

describe('hooksState', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

  it('counts a hooks path into the main checkout as installed in a worktree of the same repository, and not one into another repository', () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-hooks-state-')));
    try {
      const main = path.join(base, 'main');
      const other = path.join(base, 'other');
      for (const dir of [main, other]) {
        fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.githooks/pre-commit'), '#!/bin/sh\n');
        git(dir, 'init', '-q');
        git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
        git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
      }
      const tree = path.join(base, 'tree');
      git(main, 'worktree', 'add', '-q', tree);
      git(main, 'config', 'core.hooksPath', path.join(main, '.githooks'));
      expect(hooksState(tree)).toEqual({ inCheckout: true, hooksPath: '.githooks' });
      git(main, 'config', 'core.hooksPath', path.join(other, '.githooks'));
      expect(hooksState(tree).hooksPath).toBe(path.join(other, '.githooks'));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
