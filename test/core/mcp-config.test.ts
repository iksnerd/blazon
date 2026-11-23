import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../support/project';
import { allMcpConfigs, buildMcpConfig, isMcpClient, isMcpName, MCP_CLIENTS, mcpServerName, resolveMcpLaunch, type McpLaunch } from '../../src/core/mcp-config.js';

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

describe('mcpServerName', () => {
  it('names the server after the brand: its title as a slug, with -brand unless the title already says brand', () => {
    expect(mcpServerName('Acme')).toBe('acme-brand');
    expect(mcpServerName('Acme Corp')).toBe('acme-corp-brand');
    expect(mcpServerName('Acme Brand Guidelines')).toBe('acme-brand-guidelines');
    expect(mcpServerName('Café Müller')).toBe('cafe-muller-brand');
    // the title a new project gets is `<name> Brand Book`: the book is not part of the name
    expect(mcpServerName('Acme Brand Book')).toBe('acme-brand');
    expect(mcpServerName('acme-corp Brand Book')).toBe('acme-corp-brand');
  });

  it('is blazon when there is no brand title to use: none, empty, only symbols, or the title blazon gives a new book', () => {
    for (const title of [undefined, '', '   ', '***', 'Blazon Brand Book', 'Brand Book', 'Brand']) expect(mcpServerName(title), String(title)).toBe('blazon');
  });

  it('is always a name a client accepts, however long or odd the title is', () => {
    const long = mcpServerName(`${'Very long company name '.repeat(10)}`);
    expect(long.length).toBeLessThanOrEqual(48);
    for (const title of ['Acme', '../../etc', 'a b/c', '日本語', 'x'.repeat(200)]) expect(isMcpName(mcpServerName(title)), title).toBe(true);
  });

  it('isMcpName takes letters, digits, hyphens and underscores, starting with a letter or digit, and nothing else', () => {
    for (const ok of ['blazon', 'acme-brand', 'Acme_1', '9lives']) expect(isMcpName(ok), ok).toBe(true);
    for (const bad of ['', '-x', 'a b', 'a/b', 'a.b', 'é', 'x'.repeat(65)]) expect(isMcpName(bad), bad).toBe(false);
  });
});

describe('buildMcpConfig with a server name', () => {
  it('registers every client under the name it is given, and under blazon when it is given none', () => {
    const named = (client: (typeof MCP_CLIENTS)[number], key: 'mcpServers' | 'servers') =>
      Object.keys(JSON.parse(buildMcpConfig(client, BUILT, '/b', 'acme-brand').snippets.find((s) => s.kind === 'json')!.text)[key]);
    expect(named('claude-code', 'mcpServers')).toEqual(['acme-brand']);
    expect(named('claude-desktop', 'mcpServers')).toEqual(['acme-brand']);
    expect(named('cursor', 'mcpServers')).toEqual(['acme-brand']);
    expect(named('vscode', 'servers')).toEqual(['acme-brand']);
    expect(Object.keys(jsonOf('cursor', BUILT, '/b').mcpServers)).toEqual(['blazon']);
  });

  it('puts the name in the Claude Code command and in the VS Code --add-mcp JSON', () => {
    expect(buildMcpConfig('claude-code', BUILT, '/b', 'acme-brand').snippets[0]!.text).toContain('--transport stdio acme-brand -- ');
    const add = buildMcpConfig('vscode', BUILT, '/b', 'acme-brand').snippets[0]!.text;
    expect(JSON.parse(add.replace(/^code --add-mcp '/, '').replace(/'$/, '')).name).toBe('acme-brand');
  });

  it('allMcpConfigs passes the name to every client', () => {
    for (const config of allMcpConfigs(BUILT, '/b', 'acme-brand')) expect(JSON.stringify(config.snippets), config.client).toContain('acme-brand');
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
