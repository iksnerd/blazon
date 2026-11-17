import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runMcp } from '../../src/cli/commands/mcp';
import { checkBuilt } from '../../src/cli/commands/mcp-check';
import { isSourceCheckout } from '../../src/core/mcp-config';
import { buildMcp } from '../../scripts/build-mcp.mjs';
import { tempDir } from '../support/project';

// The MCP server ships in the package as mcp/dist/index.js. An install without that file is incomplete (a stale or broken install):
// `blazon mcp` must say so and say to reinstall, and never print an npx command for a package that is not on npm. A good install
// is found the way a source checkout is, from its own bundled file.

/** A package root as npm installs it, minus the server file: a broken install. */
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

describe('blazon mcp from an install without the server file', () => {
  it('knows a source checkout from an install by mcp/package.json', () => {
    const root = installed();
    expect(isSourceCheckout(root)).toBe(false);
    fs.mkdirSync(path.join(root, 'mcp'));
    fs.writeFileSync(path.join(root, 'mcp/package.json'), '{}');
    expect(isSourceCheckout(root)).toBe(true);
  });

  it('the built check says the install is incomplete and to reinstall, not "is not built"', () => {
    const check = checkBuilt(installed());
    expect(check.passed).toBe(false);
    expect(check.detail).toContain('install is incomplete');
    expect(check.detail).not.toContain('is not built');
    expect(check.fix).toContain('npm install @iksnerd/blazon');
    expect(check.fix).not.toContain('git clone');
  });

  it('--print-config prints no command, says to reinstall, and exits 1', async () => {
    const out = capture();
    const status = await runMcp({ printConfig: true, root: installed() });
    const text = out.join('\n');
    expect(status).toBe(1);
    expect(text).toContain('install is incomplete');
    expect(text).toContain('reinstall');
    expect(text).not.toContain('npx -y');
    expect(text).not.toContain('not published');
  });

  it('--print-config --json reports passed: false with the note and no snippet', async () => {
    const out = capture();
    const status = await runMcp({ printConfig: true, json: true, root: installed() });
    const doc = JSON.parse(out.join(''));
    expect(status).toBe(1);
    expect(doc).toMatchObject({ command: 'mcp', passed: false, built: false, snippets: [] });
    expect(doc.note).toContain('reinstall');
  });

  it('--check exits 1 and prints the reinstall as the fix', async () => {
    const out = capture();
    const status = await runMcp({ check: true, root: installed(), brand: tempDir('blazon-brand-') });
    const text = out.join('\n');
    expect(status).toBe(1);
    expect(text).toContain('install is incomplete');
    expect(text).toContain('npm install @iksnerd/blazon');
    expect(text).toContain('not run: the install is incomplete');
    expect(text).not.toContain('is not built');
  });
});

describe('blazon mcp from a complete install', () => {
  it('finds the bundled file, passes the built check and prints node, the file, --brand and BLAZON_BIN', async () => {
    const root = installed();
    await buildMcp(path.join(root, 'mcp/dist'));
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'bin/blazon.js'), '#!/usr/bin/env node\n', { mode: 0o755 });
    expect(checkBuilt(root)).toMatchObject({ passed: true });
    const out = capture();
    const status = await runMcp({ printConfig: true, client: 'cursor', brand: '/b', root });
    const text = out.join('\n');
    expect(status).toBe(0);
    expect(text).toContain(path.join(root, 'mcp/dist/index.js'));
    expect(text).toContain('"--brand"');
    expect(text).toContain(`"BLAZON_BIN": "${path.join(root, 'bin/blazon.js')}"`);
    expect(text).not.toMatch(/npx|not published|incomplete/);
  }, 60_000);
});
