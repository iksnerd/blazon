import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../support/project';
import { allMcpConfigs, buildMcpConfig, isMcpClient, MCP_CLIENTS, resolveMcpLaunch, type McpLaunch } from '../../src/core/mcp-config.js';

const BUILT: McpLaunch = { command: '/usr/bin/node', args: ['/f/mcp/dist/index.js'], env: { BLAZON_BIN: '/f/bin/blazon.js' }, built: true };
const UNBUILT: McpLaunch = { command: '/usr/bin/node', args: ['/f/mcp/dist/index.js'], env: {}, built: false, problem: 'the server file is missing' };
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

  it('finds the server of an installed package the same way: node, the bundled file, and the bin beside it', async () => {
    const root = await tempDir();
    fs.mkdirSync(path.join(root, 'mcp/dist'), { recursive: true });
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@iksnerd/blazon"}');
    fs.writeFileSync(path.join(root, 'mcp/dist/index.js'), '');
    fs.writeFileSync(path.join(root, 'bin/blazon.js'), '');
    const launch = resolveMcpLaunch(root, '/n/node');
    expect(launch.built).toBe(true);
    expect(launch.problem).toBeUndefined();
    expect(launch.args).toEqual([path.join(root, 'mcp/dist/index.js')]);
  });

  it('still names the file, marked built: false with the cause, when it is missing; never an npx command', async () => {
    const root = await tempDir();
    const launch = resolveMcpLaunch(root, '/n/node');
    expect(launch).toMatchObject({ command: '/n/node', args: [path.join(root, 'mcp/dist/index.js')], built: false });
    expect(launch.problem).toMatch(/reinstall/i);
    fs.mkdirSync(path.join(root, 'mcp'));
    fs.writeFileSync(path.join(root, 'mcp/package.json'), '{}');
    expect(resolveMcpLaunch(root, '/n/node').problem).toContain('npm run build -w mcp');
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
    const text = buildMcpConfig('vscode', UNBUILT, '/b').snippets[0]!.text;
    expect(text.startsWith("code --add-mcp '")).toBe(true);
    expect(JSON.parse(text.slice("code --add-mcp '".length, -1))).toEqual({
      name: 'blazon',
      type: 'stdio',
      command: '/usr/bin/node',
      args: ['/f/mcp/dist/index.js', '--brand', '/b'],
    });
  });

  it('leaves --brand out when no brand is given, and omits env when empty', () => {
    expect(jsonOf('cursor', UNBUILT).mcpServers.blazon).toEqual({ type: 'stdio', command: '/usr/bin/node', args: ['/f/mcp/dist/index.js'] });
  });

  it('carries the cause as the note when the server file is missing, and no note for a built one', () => {
    expect(buildMcpConfig('claude-code', UNBUILT).note).toBe('the server file is missing');
    expect(buildMcpConfig('claude-code', BUILT).note).toBeUndefined();
  });

  it('allMcpConfigs lists every client once, and isMcpClient knows them', () => {
    expect(allMcpConfigs(BUILT, '/b').map((c) => c.client)).toEqual([...MCP_CLIENTS]);
    expect(isMcpClient('cursor')).toBe(true);
    expect(isMcpClient('emacs')).toBe(false);
  });
});
