import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect, afterAll } from 'vitest';
import { REPO } from '../support/paths';

// classify_paths keeps a mapped test path when it names a file, a folder or the start of a split file's name, and drops one that matches nothing.

const roots: string[] = [];
afterAll(() => roots.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const classify = (root: string, staged: string): string[] => {
  const ran = spawnSync('bash', ['-c', `. .githooks/lib.sh; classify_paths "$1" <<< "$2"; echo "extra=$extra_tests"`, 'bash', root, staged], { cwd: REPO, encoding: 'utf-8' });
  expect(ran.status, ran.stderr).toBe(0);
  return (/^extra=(.*)$/m.exec(ran.stdout)?.[1] ?? '').split(' ').filter(Boolean);
};

const tree = (files: string[]): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-classify-'));
  roots.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  return root;
};

describe('the test paths a commit selects', () => {
  it('keeps the name prefix of a split test file', () => {
    const root = tree(['test/plugins/shipped/conformance-a.test.ts', 'test/plugins/shipped/conformance-b.test.ts', 'test/plugins/shipped/shipped.test.ts']);
    expect(classify(root, 'plugins/x/README.md')).toEqual(['test/plugins/shipped/conformance', 'test/plugins/shipped/shipped.test.ts']);
  });

  it('drops a path that matches no file, so a renamed test is not listed', () => {
    const root = tree(['test/plugins/shipped/shipped.test.ts']);
    expect(classify(root, 'plugins/x/README.md')).toEqual(['test/plugins/shipped/shipped.test.ts']);
  });

  it('keeps a folder', () => {
    const root = tree(['mcp/test/server.test.ts']);
    expect(classify(root, 'mcp/src/server.ts')).toEqual(['mcp/test']);
  });

  it('selects the split conformance files in the real tree', () => {
    expect(classify(REPO, 'scripts/build-plugins.mjs')).toContain('test/plugins/shipped/conformance');
  });
});
