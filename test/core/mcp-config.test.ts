import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../support/project';
import { allMcpConfigs, buildMcpConfig, isMcpClient, MCP_CLIENTS, resolveMcpLaunch, type McpLaunch } from '../../src/core/mcp-config.js';

const BUILT: McpLaunch = { command: '/usr/bin/node', args: ['/f/mcp/dist/index.js'], env: { BLAZON_BIN: '/f/bin/blazon.js' }, built: true };
const NPX: McpLaunch = { command: 'npx', args: ['-y', '@iksnerd/blazon-mcp'], env: {}, built: false };
const jsonOf = (client: (typeof MCP_CLIENTS)[number], launch: McpLaunch, brand?: string) =>
  JSON.parse(buildMcpConfig(client, launch, brand).snippets.find((s) => s.kind === 'json')!.text);

describe('resolveMcpLaunch', () => {
  it('starts a built mcp/ with node and names the blazon to run', async () => {
    const root = await tempDir();
    fs.mkdirSync(path.join(root, 'mcp/dist'), { recursive: true });
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'mcp/dist/index.js'), '');
    fs.writeFileSync(path.join(root, 'bin/blazon.js'), '');
    expect(resolveMcpLaunch(root, '/n/node')).toEqual({
      command: '/n/node',
      args: [path.join(root, 'mcp/dist/index.js')],
      env: { BLAZON_BIN: path.join(root, 'bin/blazon.js') },
      built: true,
    });
  });

  it('falls back to the npx form, marked as built: false, when there is no build', async () => {
    expect(resolveMcpLaunch(await tempDir())).toEqual(NPX);
  });
});

describe('buildMcpConfig', () => {
  it('Claude Code: claude mcp add with --transport between --env and the name, and .mcp.json without type', () => {
    const config = buildMcpConfig('claude-code', BUILT, '/my brand');
    expect(config.snippets[0]!.text).toBe(
      "claude mcp add --scope project --env BLAZON_BIN=/f/bin/blazon.js --transport stdio blazon -- /usr/bin/node /f/mcp/dist/index.js --brand '/my brand'",
    );
    expect(jsonOf('claude-code', BUILT, '/b')).toEqual({
      mcpServers: { blazon: { command: '/usr/bin/node', args: ['/f/mcp/dist/index.js', '--brand', '/b'], env: { BLAZON_BIN: '/f/bin/blazon.js' } } },
    });
  });

  it('Claude Desktop and Cursor use mcpServers; Cursor adds type; VS Code uses servers with type', () => {
    expect(Object.keys(jsonOf('claude-desktop', BUILT, '/b'))).toEqual(['mcpServers']);
    expect(jsonOf('claude-desktop', BUILT, '/b').mcpServers.blazon.type).toBeUndefined();
    expect(jsonOf('cursor', BUILT, '/b').mcpServers.blazon.type).toBe('stdio');
    const vscode = jsonOf('vscode', BUILT, '/b');
    expect(Object.keys(vscode)).toEqual(['servers']);
    expect(vscode.servers.blazon.type).toBe('stdio');
  });

  it('VS Code also gets a code --add-mcp command whose JSON carries the name', () => {
    const text = buildMcpConfig('vscode', NPX, '/b').snippets[0]!.text;
    expect(text.startsWith("code --add-mcp '")).toBe(true);
    expect(JSON.parse(text.slice("code --add-mcp '".length, -1))).toEqual({ name: 'blazon', type: 'stdio', command: 'npx', args: ['-y', '@iksnerd/blazon-mcp', '--brand', '/b'] });
  });

  it('leaves --brand out when no brand is given, and omits env when empty', () => {
    expect(jsonOf('cursor', NPX).mcpServers.blazon).toEqual({ type: 'stdio', command: 'npx', args: ['-y', '@iksnerd/blazon-mcp'] });
  });

  it('says the npx form is not published, and says nothing of the kind for a built one', () => {
    expect(buildMcpConfig('claude-code', NPX).note).toMatch(/not published to npm yet/);
    expect(buildMcpConfig('claude-code', BUILT).note).toBeUndefined();
  });

  it('allMcpConfigs lists every client once, and isMcpClient knows them', () => {
    expect(allMcpConfigs(BUILT, '/b').map((c) => c.client)).toEqual([...MCP_CLIENTS]);
    expect(isMcpClient('cursor')).toBe(true);
    expect(isMcpClient('emacs')).toBe(false);
  });
});
