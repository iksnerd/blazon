import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import fs from 'node:fs';
import { tempDir } from '../support/project';

// `blazon mcp --print-config` prints what registers blazon-mcp in a client and writes nothing.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

describe('blazon mcp', () => {
  it('prints the Claude Code command and the .mcp.json form by default, with the absolute brand folder', () => {
    const ran = blazon('mcp', '--print-config', '--brand', 'examples/blazon');
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toMatch(/claude mcp add --scope project .*--transport stdio blazon -- /);
    expect(ran.stdout).toContain(path.join(REPO, 'examples/blazon'));
    expect(ran.stdout).toContain('"mcpServers"');
  }, 60_000);

  it('prints one client as JSON, command and passed first', () => {
    const ran = blazon('mcp', '--print-config', '--client', 'vscode', '--json');
    expect(ran.status, ran.stderr).toBe(0);
    const out = JSON.parse(ran.stdout);
    expect(Object.keys(out).slice(0, 2)).toEqual(['command', 'passed']);
    expect(out).toMatchObject({ command: 'mcp', passed: true, client: 'vscode' });
    expect(out.snippets.map((s: { kind: string }) => s.kind)).toEqual(['command', 'json']);
    expect(JSON.parse(out.snippets[1].text).servers.blazon.type).toBe('stdio');
  }, 60_000);

  const brandWith = (config: string | undefined) => {
    const dir = tempDir('blazon-brand-');
    if (config !== undefined) fs.writeFileSync(path.join(dir, 'blazon.json'), config);
    return dir;
  };

  it('registers the server under the brand name: the title as a slug, in every form it prints', () => {
    const dir = brandWith('{ "title": "Acme" }');
    const ran = blazon('mcp', '--print-config', '--brand', dir);
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain('--transport stdio acme-brand -- ');
    expect(JSON.parse(ran.stdout.slice(ran.stdout.indexOf('{'), ran.stdout.lastIndexOf('}') + 1)).mcpServers['acme-brand']).toBeDefined();
    const json = JSON.parse(blazon('mcp', '--print-config', '--client', 'vscode', '--brand', dir, '--json').stdout);
    expect(json.name).toBe('acme-brand');
    expect(Object.keys(JSON.parse(json.snippets[1].text).servers)).toEqual(['acme-brand']);
  }, 60_000);

  it('--name chooses the name, and refuses one a client would not take', () => {
    const dir = brandWith('{ "title": "Acme" }');
    const named = blazon('mcp', '--print-config', '--brand', dir, '--name', 'acme-tokens', '--json');
    expect(JSON.parse(named.stdout).name).toBe('acme-tokens');
    const bad = blazon('mcp', '--print-config', '--brand', dir, '--name', 'two words', '--json');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('--name');
  }, 60_000);

  it('keeps the name blazon for a brand with no title of its own, no config, or a config that does not load', () => {
    for (const config of [undefined, '{}', '{ "title": "Blazon Brand Book" }', '{ not json']) {
      const out = JSON.parse(blazon('mcp', '--print-config', '--brand', brandWith(config), '--json').stdout);
      expect(out.name, String(config)).toBe('blazon');
    }
  }, 120_000);

  it('exits 2 for an unknown client, with the list of clients, and for no --print-config', () => {
    const bad = blazon('mcp', '--print-config', '--client', 'emacs', '--json');
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('claude-code, claude-desktop, cursor, vscode');
    expect(JSON.parse(bad.stdout)).toMatchObject({ command: 'mcp', passed: false });
    expect(blazon('mcp').status).toBe(2);
  }, 60_000);
});
