import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runMcp } from '../../src/cli/commands/mcp';
import { checkBuilt } from '../../src/cli/commands/mcp-check';
import { mcpInPackage } from '../../src/core/mcp-config';
import { tempDir } from '../support/project';

// An npm install of blazon holds no mcp/ (mcp/ is a private workspace of the repository). `blazon mcp` must say that, and give the
// clone steps, instead of "is not built" or an npx command for a package that is not on npm.

/** A package root as npm installs it: no mcp/ in it. */
const installed = (): string => {
  const root = tempDir('blazon-installed-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@iksnerd/blazon"}');
  return root;
};

const capture = () => {
  const out: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  return out;
};
afterEach(() => vi.restoreAllMocks());

describe('blazon mcp from an install without mcp/', () => {
  it('knows whether mcp/ came with the package', () => {
    const root = installed();
    expect(mcpInPackage(root)).toBe(false);
    fs.mkdirSync(path.join(root, 'mcp'));
    fs.writeFileSync(path.join(root, 'mcp/package.json'), '{}');
    expect(mcpInPackage(root)).toBe(true);
  });

  it('the built check names the cause and the clone steps, not "is not built"', () => {
    const check = checkBuilt(installed());
    expect(check.passed).toBe(false);
    expect(check.detail).toContain('not part of the npm package');
    expect(check.detail).not.toContain('is not built');
    expect(check.fix).toContain('git clone https://github.com/iksnerd/blazon');
    expect(check.fix).not.toMatch(/^cd /);
  });

  it('--print-config prints no command, says to use a clone, and exits 1', async () => {
    const out = capture();
    const status = await runMcp({ printConfig: true, root: installed() });
    const text = out.join('\n');
    expect(status).toBe(1);
    expect(text).toContain('not part of the npm package');
    expect(text).toContain('npm run build -w mcp');
    expect(text).not.toContain('npx -y');
  });

  it('--print-config --json reports passed: false with the note and no snippet', async () => {
    const out = capture();
    const status = await runMcp({ printConfig: true, json: true, root: installed() });
    const doc = JSON.parse(out.join(''));
    expect(status).toBe(1);
    expect(doc).toMatchObject({ command: 'mcp', passed: false, built: false, snippets: [] });
    expect(doc.note).toContain('run it from a clone');
  });

  it('--check exits 1 and prints the clone steps as the fix', async () => {
    const out = capture();
    const status = await runMcp({ check: true, root: installed(), brand: tempDir('blazon-brand-') });
    const text = out.join('\n');
    expect(status).toBe(1);
    expect(text).toContain('not part of the npm package');
    expect(text).toContain('git clone https://github.com/iksnerd/blazon');
    expect(text).toContain('not part of this install');
    expect(text).not.toContain('is not built');
  });
});
