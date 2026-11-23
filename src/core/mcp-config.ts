import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './config/defaults.js';
import { packageRoot } from './package-root.js';

export const MCP_CLIENTS = ['claude-code', 'claude-desktop', 'cursor', 'vscode'] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];

/** How a client is told to start blazon-mcp: one program, its arguments and the environment it needs. */
export interface McpLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** False when the server file is not there: the command then names the file it would have, and `problem` says why it fails. */
  built: boolean;
  /** Why the command does not work, said when `built` is false. */
  problem?: string;
}

/** One thing to paste: a shell command, or the JSON entry for a client's config file. */
export interface McpSnippet {
  kind: 'command' | 'json';
  /** What it is: "Command" or the file the JSON goes in. */
  label: string;
  text: string;
}

export interface McpConfig {
  client: McpClient;
  title: string;
  built: boolean;
  /** Said when the command is not one that works today. */
  note?: string;
  snippets: McpSnippet[];
}

/** True for a source checkout (it has `mcp/package.json`); the npm package ships only the built file `mcp/dist/index.js`. */
export const isSourceCheckout = (root: string = packageRoot()): boolean => fs.existsSync(path.join(root, 'mcp/package.json'));

/** What an install without the server file says: the package is meant to hold it, so the install is damaged or stale. */
export const INCOMPLETE_INSTALL =
  'The MCP server file mcp/dist/index.js is missing from this blazon, so the install is incomplete; reinstall it (npm install @iksnerd/blazon) and run blazon mcp --check again.';

/** The fix to print with {@link INCOMPLETE_INSTALL}. */
export const REINSTALL = 'npm install @iksnerd/blazon';

const NOT_BUILT =
  'mcp/dist/index.js does not exist, so this command fails until the server is built: from this blazon source checkout, run npm run build -w mcp and print the config again.';

/**
 * How to start blazon-mcp from this blazon: `node` and `mcp/dist/index.js` in the package root, with BLAZON_BIN naming this blazon's
 * `bin/blazon.js`. An npm install holds that file (it is built into the package) and a source checkout has it after `npm run build -w mcp`,
 * so one rule covers both. When the file is missing the launch still names it, with `built: false` and the reason in `problem`.
 */
export function resolveMcpLaunch(root: string = packageRoot(), node: string = process.execPath): McpLaunch {
  const entry = path.join(root, 'mcp/dist/index.js');
  const bin = path.join(root, 'bin/blazon.js');
  const env: Record<string, string> = fs.existsSync(bin) ? { BLAZON_BIN: bin } : {};
  if (fs.existsSync(entry)) return { command: node, args: [entry], env, built: true };
  return { command: node, args: [entry], env, built: false, problem: isSourceCheckout(root) ? NOT_BUILT : INCOMPLETE_INSTALL };
}

/** The name a client registers the server under when the brand gives it nothing better. */
export const DEFAULT_MCP_NAME = 'blazon';
const MCP_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Whether a client accepts it as a server name: letters, digits, hyphens and underscores, starting with a letter or digit, 64 at most. */
export const isMcpName = (name: string): boolean => MCP_NAME.test(name);

/**
 * The name to register the server under: the brand's title as a slug, with `-brand` unless the title already says brand (`acme-brand`,
 * `acme-brand-guidelines`). Two brands then sit side by side in one client config, and an agent sees whose tools it calls. `blazon` when
 * the brand has no title of its own: none, nothing left of it as a slug, or the title blazon gives a new book. A client lists a server by
 * this name (it is the prefix of the tool names), so a brand's name here is the one thing that tells two of them apart.
 */
export function mcpServerName(title: string | undefined): string {
  const base = (title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  // `<name> Brand Book` is the title a new project gets: the book is not part of the name, so it is `<name>-brand`. A title that is nothing but
  // that has no name in it.
  const name = base.replace(/-brand-book$/, '-brand');
  if (name === '' || name === 'brand' || name === 'brand-book' || title === DEFAULT_CONFIG.title) return DEFAULT_MCP_NAME;
  return name.split('-').includes('brand') ? name : `${name}-brand`;
}

/** A word safe in a POSIX shell: quoted only when it has to be. */
const shell = (word: string): string => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

const TITLES: Record<McpClient, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  vscode: 'VS Code',
};

/** The server entry every client's JSON holds. `type` is added where the client's format asks for it. */
function entry(launch: McpLaunch, brand: string | undefined, type: boolean): Record<string, unknown> {
  return {
    ...(type && { type: 'stdio' }),
    command: launch.command,
    args: [...launch.args, ...(brand === undefined ? [] : ['--brand', brand])],
    ...(Object.keys(launch.env).length > 0 && { env: launch.env }),
  };
}

const json = (key: 'mcpServers' | 'servers', name: string, value: Record<string, unknown>): string => JSON.stringify({ [key]: { [name]: value } }, null, 2);

/**
 * The text that registers blazon-mcp (stdio) in one client. `brand` is an absolute folder, or undefined to leave `--brand` out
 * (the server then reads the folder the client starts it in). Formats were checked against each client's documentation on 2026-11-09:
 * Claude Code `claude mcp add` and `.mcp.json`, Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`,
 * VS Code `.vscode/mcp.json` (`servers`, with `type`) and `code --add-mcp`.
 */
export function buildMcpConfig(client: McpClient, launch: McpLaunch, brand?: string, name: string = DEFAULT_MCP_NAME): McpConfig {
  const note = launch.built ? undefined : launch.problem;
  const args = [...launch.args, ...(brand === undefined ? [] : ['--brand', brand])];
  const base = { client, title: TITLES[client], built: launch.built, ...(note && { note }) };
  switch (client) {
    case 'claude-code': {
      // `--env` may not be followed directly by the name, so `--transport stdio` sits between them
      const env = Object.entries(launch.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
      const add = ['claude', 'mcp', 'add', '--scope', 'project', ...env, '--transport', 'stdio', name, '--', launch.command, ...args].map(shell).join(' ');
      return {
        ...base,
        snippets: [
          { kind: 'command', label: 'Command (writes .mcp.json at the project root)', text: add },
          { kind: 'json', label: '.mcp.json', text: json('mcpServers', name, entry(launch, brand, false)) },
        ],
      };
    }
    case 'claude-desktop':
      return {
        ...base,
        snippets: [
          {
            kind: 'json',
            label: 'claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\, Linux: ~/.config/Claude/)',
            text: json('mcpServers', name, entry(launch, brand, false)),
          },
        ],
      };
    case 'cursor':
      return {
        ...base,
        snippets: [{ kind: 'json', label: '.cursor/mcp.json (or ~/.cursor/mcp.json for every project)', text: json('mcpServers', name, entry(launch, brand, true)) }],
      };
    case 'vscode': {
      const add = `code --add-mcp ${shell(JSON.stringify({ name, ...entry(launch, brand, true) }))}`;
      return {
        ...base,
        snippets: [
          { kind: 'command', label: 'Command (adds it to your VS Code user profile)', text: add },
          { kind: 'json', label: '.vscode/mcp.json', text: json('servers', name, entry(launch, brand, true)) },
        ],
      };
    }
  }
}

/** Every client's config, in the order of {@link MCP_CLIENTS}. What the dev server hands the brand book's "Connect your agent" panel. */
export function allMcpConfigs(launch: McpLaunch, brand?: string, name: string = DEFAULT_MCP_NAME): McpConfig[] {
  return MCP_CLIENTS.map((client) => buildMcpConfig(client, launch, brand, name));
}

export const isMcpClient = (value: string): value is McpClient => (MCP_CLIENTS as readonly string[]).includes(value);

/** A config file a client reads its MCP servers from, and where in it the server names are. */
export interface McpConfigFile {
  /** Absolute path. */
  path: string;
  /** The object whose keys are server names: `mcpServers` for most clients, `servers` for VS Code. */
  serversKey: 'mcpServers' | 'servers';
  /** True for a file that belongs to one project folder, false for a user-wide one. */
  scope: 'project' | 'user';
  /** `~/.claude.json` only: it also keeps `projects[<folder>].mcpServers` for each folder Claude Code knows. */
  projects?: string[];
}

/**
 * The files a client reads its servers from, as {@link buildMcpConfig} describes them. `folders` are the project folders to look in
 * (the current folder, the brand folder). Nothing here reads a file.
 */
export function mcpConfigFiles(client: McpClient, folders: string[], home: string, platform: NodeJS.Platform = process.platform, appData?: string): McpConfigFile[] {
  const project = (rel: string[], serversKey: McpConfigFile['serversKey']): McpConfigFile[] =>
    folders.map((dir) => ({ path: path.join(dir, ...rel), serversKey, scope: 'project' }));
  const support = (app: string): string => {
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', app);
    if (platform === 'win32') return path.join(appData ?? path.join(home, 'AppData', 'Roaming'), app);
    return path.join(home, '.config', app);
  };
  switch (client) {
    case 'claude-code':
      return [{ path: path.join(home, '.claude.json'), serversKey: 'mcpServers', scope: 'user', projects: folders }, ...project(['.mcp.json'], 'mcpServers')];
    case 'claude-desktop':
      return [{ path: path.join(support('Claude'), 'claude_desktop_config.json'), serversKey: 'mcpServers', scope: 'user' }];
    case 'cursor':
      return [...project(['.cursor', 'mcp.json'], 'mcpServers'), { path: path.join(home, '.cursor', 'mcp.json'), serversKey: 'mcpServers', scope: 'user' }];
    case 'vscode':
      return [...project(['.vscode', 'mcp.json'], 'servers'), { path: path.join(support('Code'), 'User', 'mcp.json'), serversKey: 'servers', scope: 'user' }];
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The objects of a parsed client file that hold server entries: the file itself and, for `~/.claude.json`, each known project. */
function serverHolders(text: string, file: Pick<McpConfigFile, 'serversKey' | 'projects'>): Record<string, unknown>[] | undefined {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(doc)) return undefined;
  const projects = isRecord(doc.projects) ? doc.projects : {};
  const servers = (holder: unknown): Record<string, unknown>[] =>
    isRecord(holder) && isRecord(holder[file.serversKey]) ? [holder[file.serversKey] as Record<string, unknown>] : [];
  return [...servers(doc), ...(file.projects ?? []).flatMap((folder) => servers(projects[folder]))];
}

/**
 * The server NAMES a client's config file holds, from its text. Only keys are returned: a server's command, arguments and
 * environment (where a token may be) are never copied out. Returns undefined when the text is not a JSON object.
 */
export function mcpServerNames(text: string, file: Pick<McpConfigFile, 'serversKey' | 'projects'>): string[] | undefined {
  return serverHolders(text, file)?.flatMap((servers) => Object.keys(servers));
}

/** What an entry says to run. The values are the user's own and may hold a secret: a caller keeps only what it identified as a script path, and prints nothing else. */
export interface McpEntryLaunch {
  command: string | undefined;
  args: string[];
}

/** The `command` and string `args` of every entry named `name` in a client's config file. `env` is never read. Returns undefined when the text is not a JSON object. */
export function mcpEntryLaunches(text: string, file: Pick<McpConfigFile, 'serversKey' | 'projects'>, name: string): McpEntryLaunch[] | undefined {
  return serverHolders(text, file)?.flatMap((servers) => {
    const entry = servers[name];
    if (!isRecord(entry)) return [];
    return [
      {
        command: typeof entry.command === 'string' ? entry.command : undefined,
        args: Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : [],
      },
    ];
  });
}
