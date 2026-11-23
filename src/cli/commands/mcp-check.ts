import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from '../../core/colors.js';
import {
  DEFAULT_MCP_NAME,
  INCOMPLETE_INSTALL,
  isSourceCheckout,
  mcpConfigFiles,
  mcpEntryLaunches,
  mcpServerNames,
  REINSTALL,
  resolveMcpLaunch,
  type McpClient,
  type McpEntryLaunch,
} from '../../core/mcp-config.js';
import { OPERATIONS, toolOperations } from '../../core/operations/index.js';
import { packageRoot } from '../../core/package-root.js';
import { printJson } from '../read.js';
import { brandServerName } from './mcp-name.js';

/** The longest the whole handshake may take before the server is killed. */
export const HANDSHAKE_TIMEOUT_MS = 30_000;

/** What the check says before anything else. The server runs no plugin (`check_brand` passes `--no-plugins`, and the read commands never run one), so the risk is the brand's text reaching the agent. */
export const TRUST_NOTICE =
  'This check starts blazon-mcp on the brand folder. The server runs blazon with no plugin and a limited environment, and reads the brand files as data. What the brand says reaches your agent as tool results, so check only a brand folder you trust.';

/** One line of the answer. `advisory` marks a finding that does not make the check fail. */
export interface McpCheck {
  name: 'built' | 'blazon' | 'handshake' | 'registered';
  passed: boolean;
  detail: string;
  /** A command the agent can run when the check did not pass. */
  fix?: string;
  advisory?: true;
  [extra: string]: unknown;
}

/** mcp/ is a workspace of the repository: its install and build run from the root (`npm ci` inside mcp/ would replace the root's node_modules). */
const SERVER_FIX = 'npm ci && npm run build -w mcp';

/** What rebuilds the server: the build of a source checkout, or a reinstall of the package. */
const serverFix = (root: string): string => (isSourceCheckout(root) ? `cd ${root} && ${SERVER_FIX}` : REINSTALL);

/** The tool names the server must list: every operation that has a tool. */
export const expectedTools = (): string[] => toolOperations(OPERATIONS).map((op) => op.name);

/** (a) The server is there: `mcp/dist/index.js` exists in this blazon's package (an install ships it; a source checkout builds it). */
export function checkBuilt(root: string): McpCheck & { entry: string } {
  const entry = path.join(root, 'mcp/dist/index.js');
  const built = fs.existsSync(entry);
  if (!built && !isSourceCheckout(root)) return { name: 'built', passed: false, detail: INCOMPLETE_INSTALL, fix: REINSTALL, entry };
  return built
    ? { name: 'built', passed: true, detail: `${entry} exists`, entry }
    : { name: 'built', passed: false, detail: `${entry} does not exist: blazon-mcp is not built`, fix: serverFix(root), entry };
}

const isExecutable = (file: string): boolean => {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** `blazon` on PATH, the way a shell finds it. */
function onPath(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD').split(';')].map((ext) => name + ext) : [name];
  for (const dir of dirs) for (const candidate of names) if (isExecutable(path.join(dir, candidate))) return path.join(dir, candidate);
  return undefined;
}

/** (b) The blazon program the server runs: `BLAZON_BIN` when set, else `blazon` on PATH. The server runs it in the brand folder, so a relative BLAZON_BIN is read from there. */
export function checkBlazon(env: NodeJS.ProcessEnv, brand: string, root: string): McpCheck {
  const own = path.join(root, 'bin/blazon.js');
  const fix = !fs.existsSync(own)
    ? 'put the blazon program on PATH, or export BLAZON_BIN=<path to the blazon executable>'
    : fs.existsSync(path.join(root, 'dist/cli/index.js'))
      ? `export BLAZON_BIN=${own}`
      : `cd ${root} && npm run build && export BLAZON_BIN=${own}`;
  const bin = env.BLAZON_BIN;
  if (bin) {
    const found = bin.includes('/') || bin.includes(path.sep) ? path.resolve(brand, bin) : onPath(bin, env);
    if (found && isExecutable(found)) return { name: 'blazon', passed: true, detail: `BLAZON_BIN names ${found}`, source: 'BLAZON_BIN', path: found };
    return { name: 'blazon', passed: false, detail: `BLAZON_BIN is set to "${bin}", which is not an executable file`, fix, source: 'BLAZON_BIN' };
  }
  // The server takes BLAZON_BIN, else the bin/blazon.js of the package it ships in, else `blazon` on PATH: this says the same.
  if (isExecutable(own)) return { name: 'blazon', passed: true, detail: `the server runs this package's own ${own}`, source: 'package', path: own };
  const found = onPath('blazon', env);
  if (found) return { name: 'blazon', passed: true, detail: `blazon found on PATH at ${found}`, source: 'PATH', path: found };
  return { name: 'blazon', passed: false, detail: 'BLAZON_BIN is not set and no blazon program is on PATH', fix, source: 'none' };
}

export interface HandshakeOptions {
  /** The server's entry point, `mcp/dist/index.js`. */
  entry: string;
  brand: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** The tool names that must be listed. */
  expect?: string[];
}

interface Rpc {
  id?: number;
  result?: { tools?: { name: string }[]; isError?: boolean; content?: { text?: string }[]; structuredContent?: { passed?: boolean; counts?: unknown } };
  error?: { message?: string };
}

/** The first line of a text, cut: enough to name a cause, too short to carry a dump. */
const brief = (text: string, max = 200): string => {
  const line =
    text
      .trim()
      .split('\n')
      .find((l) => l.trim() !== '') ?? '';
  return line.length > max ? `${line.slice(0, max)}...` : line;
};

/**
 * (c) A real MCP handshake over stdio: starts the server on the brand, sends `initialize` and `tools/list`, expects the tools by name,
 * calls `check_brand` with a limit of 1, and stops the server. The server runs in its own process group where there is one, so the blazon
 * command it started goes with it. Whatever happens, the process is gone when this returns; a hang is killed at `timeoutMs`.
 */
export async function handshake(options: HandshakeOptions): Promise<McpCheck> {
  const { entry, brand, env = process.env, timeoutMs = HANDSHAKE_TIMEOUT_MS, expect = expectedTools() } = options;
  const group = process.platform !== 'win32';
  const child = spawn(process.execPath, [entry, '--brand', brand], { stdio: ['pipe', 'pipe', 'pipe'], env, detached: group });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });
  const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const spawnError = new Promise<never>((_, reject) => child.once('error', (error) => reject(new Error(`cannot start ${process.execPath}: ${error.message}`))));
  const pending = new Map<number, (message: Rpc) => void>();
  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line) as Rpc;
        if (message.id !== undefined) pending.get(message.id)?.(message);
      } catch {
        // a line that is not JSON is not a reply
      }
    }
  });
  child.stdin.on('error', () => undefined);

  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`no answer within ${timeoutMs / 1000} s`));
    }, timeoutMs);
  });
  const early = new Promise<never>((_, reject) =>
    child.once('close', (code) => reject(new Error(`the server exited (${code ?? 'signal'}) before it answered${stderr ? `: ${brief(stderr)}` : ''}`))),
  );
  early.catch(() => undefined);
  deadline.catch(() => undefined);
  spawnError.catch(() => undefined);

  let nextId = 0;
  const request = (method: string, params: object): Promise<Rpc> => {
    const id = ++nextId;
    const reply = new Promise<Rpc>((resolve) => pending.set(id, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return Promise.race([reply, deadline, early, spawnError]);
  };

  const started = Date.now();
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'blazon-mcp-check', version: '0' } });
    if (init.error) throw new Error(`initialize was refused: ${brief(init.error.message ?? '')}`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await request('tools/list', {});
    const names = (list.result?.tools ?? []).map((tool) => tool.name);
    const missing = expect.filter((name) => !names.includes(name));
    if (list.error || missing.length > 0)
      return {
        name: 'handshake',
        passed: false,
        detail: list.error ? `tools/list failed: ${brief(list.error.message ?? '')}` : `tools/list answered ${names.length} tool(s); missing ${missing.join(', ')}`,
        fix: `${serverFix(packageRoot())} (the server is older than this blazon), then run this check again`,
        tools: names,
      };
    const calledAt = Date.now();
    const call = await request('tools/call', { name: 'check_brand', arguments: { limit: 1 } });
    const ms = Date.now() - calledAt;
    const text = call.result?.content?.find((c) => c.text)?.text ?? '';
    if (call.error || call.result?.isError)
      return {
        name: 'handshake',
        passed: false,
        detail: `check_brand failed: ${brief(call.error?.message ?? text)}`,
        fix: 'run blazon check in the brand folder, and make sure the blazon program and the brand folder are the ones the server uses',
        tools: names,
        ms,
      };
    const brandPassed = call.result?.structuredContent?.passed;
    return {
      name: 'handshake',
      passed: true,
      detail: `initialize and tools/list answered (${names.length} tools); check_brand answered in ${(ms / 1000).toFixed(1)} s${brandPassed === false ? ' (the brand itself has errors: run blazon check)' : ''}`,
      tools: names,
      ms,
      ...(brandPassed !== undefined && { brandPassed }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: 'handshake',
      passed: false,
      detail: `the handshake did not finish: ${message}${timedOut ? '; the server was killed' : ''}`,
      fix: `${serverFix(packageRoot())}, then run this check again; on a hang, run the server by hand: node ${entry} --brand ${brand}`,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
    await stop(child, exited, group);
  }
}

/** Ends the server and what it started: SIGTERM to the group, and SIGKILL after 2 s if it is still there. */
async function stop(child: ReturnType<typeof spawn>, exited: Promise<void>, group: boolean): Promise<void> {
  const signal = (sig: NodeJS.Signals): void => {
    try {
      if (group && child.pid !== undefined) process.kill(-child.pid, sig);
      else child.kill(sig);
    } catch {
      // already gone
    }
  };
  child.stdin?.end();
  if (child.exitCode !== null || child.signalCode !== null) {
    signal('SIGKILL'); // a straggler in the group
    return;
  }
  signal('SIGTERM');
  let escalate: NodeJS.Timeout | undefined;
  await Promise.race([exited, new Promise<void>((resolve) => (escalate = setTimeout(resolve, 2000)))]);
  clearTimeout(escalate);
  if (child.exitCode === null && child.signalCode === null) {
    signal('SIGKILL');
    await exited;
  } else signal('SIGKILL');
}

/** realpath, or the resolved path when the file is not there. */
const real = (file: string): string => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

/**
 * The server file an entry runs, or undefined when the entry alone does not say (nothing is run to find out). It is the first argument that
 * names a `.js` or `.mjs` file (after `~`, a path relative to `base` and symlinks are resolved) and that exists or is `thisInstall`. This is
 * the only thing taken out of an entry: no other argument, no command and no environment value is kept.
 */
function scriptOf(entry: McpEntryLaunch, home: string, base: string | undefined, thisInstall: string): string | undefined {
  for (const arg of entry.args) {
    if (arg.startsWith('-')) continue;
    const expanded = arg.startsWith('~/') || arg.startsWith(`~${path.sep}`) ? path.join(home, arg.slice(1)) : arg;
    if (!path.isAbsolute(expanded) && base === undefined) continue; // a relative path from a user-wide file: the client's folder is unknown
    const file = real(path.resolve(base ?? '/', expanded));
    if (!/\.m?js$/.test(file)) continue;
    if (file === thisInstall || fs.existsSync(file)) return file;
  }
  return undefined;
}

/**
 * (d) Whether the client's config has an entry named `blazon`, and whether that entry runs this install's server file (the `mcp/dist/index.js`
 * that `blazon mcp --print-config` names: it comes from the same function). Of a file it reads the server names and, for the `blazon` entry,
 * the command and arguments, to find one script path; nothing else (another argument, an environment value, a token) is kept or printed, and
 * nothing is written or run. State `same`: it runs this install's file. `different`: it runs another file. `unknown`: no script path could be
 * identified from the entry (an `npx` or `blazon-mcp` form, a file that is not there), and this says so instead of guessing. `none`: not
 * registered. Only `same` passes; the check is advisory in every state, so none of them changes the exit status.
 */
export function checkRegistered(
  client: McpClient,
  folders: string[],
  brand: string,
  home = os.homedir(),
  root = packageRoot(),
  serverNames: readonly string[] = [DEFAULT_MCP_NAME],
): McpCheck {
  const files = mcpConfigFiles(client, folders, home, process.platform, process.env.APPDATA);
  const installPath = real(resolveMcpLaunch(root).args[0] as string);
  const found: string[] = [];
  const read: string[] = [];
  const unreadable: string[] = [];
  const scripts: { file: string; script: string | undefined }[] = [];
  const foundNames = new Set<string>();
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file.path, 'utf8');
    } catch {
      continue; // no such file: nothing registered there
    }
    const names = mcpServerNames(text, file);
    if (names === undefined) {
      unreadable.push(file.path);
      continue;
    }
    read.push(file.path);
    const present = serverNames.filter((name) => names.includes(name));
    if (present.length === 0) continue;
    found.push(file.path);
    // a project file's relative path is read from its project folder; a user-wide file has none
    const base = file.scope === 'project' ? folders.find((dir) => file.path.startsWith(dir + path.sep)) : undefined;
    for (const name of present) {
      foundNames.add(name);
      const launches = mcpEntryLaunches(text, file, name) ?? [];
      if (launches.length === 0) scripts.push({ file: file.path, script: undefined });
      for (const launch of launches) scripts.push({ file: file.path, script: scriptOf(launch, home, base, installPath) });
    }
  }
  const note = unreadable.length > 0 ? ` (not valid JSON, skipped: ${unreadable.join(', ')})` : '';
  const fix = `blazon mcp --print-config --client ${client} --brand ${brand}`;
  const wanted = serverNames.length > 1 ? `${serverNames[0]} (or ${serverNames.slice(1).join(', ')})` : (serverNames[0] ?? DEFAULT_MCP_NAME);
  if (found.length === 0)
    return {
      name: 'registered',
      passed: false,
      advisory: true,
      client,
      state: 'none',
      found: false,
      sameServer: null,
      detail: `no server named ${wanted} in ${client}'s config; looked in ${read.length > 0 ? read.join(', ') : 'no file that exists'}${note}`,
      fix,
      files: [],
    };
  const head = { name: 'registered' as const, advisory: true as const, client, found: true, files: found, installPath };
  const other = scripts.find((item) => item.script !== undefined && item.script !== installPath);
  if (other?.script !== undefined)
    return {
      ...head,
      passed: false,
      state: 'different',
      sameServer: false,
      registeredPath: other.script,
      detail: `${client} has a server named ${[...foundNames].join(' and ')} in ${other.file}, but it runs ${other.script}, not this install's ${installPath}; blazon mcp --print-config prints the command that registers this install${note}`,
      fix,
    };
  if (scripts.some((item) => item.script === undefined))
    return {
      ...head,
      passed: false,
      state: 'unknown',
      sameServer: null,
      detail: `${client} has a server named ${[...foundNames].join(' and ')} in ${found.join(', ')}, but this check could not tell which file it runs; this install's is ${installPath}, and blazon mcp --print-config prints the command that registers it${note}`,
      fix,
    };
  return {
    ...head,
    passed: true,
    state: 'same',
    sameServer: true,
    detail: `${client} has a server named ${[...foundNames].join(' and ')} in ${found.join(', ')}, and it runs this install's ${installPath}${note}`,
  };
}

export interface McpCheckOptions {
  client: McpClient;
  brand: string;
  /** The server's name to look for; by default the brand's (its title as a slug), and the old name blazon too. */
  name?: string;
  json?: boolean;
  /** Where the project-level config files are looked for besides the brand folder. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  timeoutMs?: number;
  /** blazon's package root; tests give another. */
  root?: string;
}

/** `blazon mcp --check`: runs the four checks, prints the answer, and returns the exit status: 0 when the server is ready, 1 when not. Writes no file. */
export async function runMcpCheck(options: McpCheckOptions): Promise<number> {
  const { client, brand, env = process.env, cwd = process.cwd(), home = os.homedir() } = options;
  const root = options.root ?? packageRoot();
  const built = checkBuilt(root);
  const blazon = checkBlazon(env, brand, root);
  const shake: McpCheck = built.passed
    ? await handshake({ entry: built.entry, brand, env, ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }) })
    : {
        name: 'handshake',
        passed: false,
        detail: `not run: ${isSourceCheckout(root) ? 'the server is not built' : 'the install is incomplete'}`,
        fix: built.fix as string,
      };
  const folders = [...new Set([cwd, brand])];
  const serverName = options.name ?? (await brandServerName(brand));
  const registered = checkRegistered(client, folders, brand, home, root, [...new Set([serverName, DEFAULT_MCP_NAME])]);
  const { entry: _entry, ...builtCheck } = built;
  const checks: McpCheck[] = [builtCheck, blazon, shake, registered];
  const passed = checks.filter((check) => !check.advisory).every((check) => check.passed);
  if (options.json) {
    printJson('mcp', passed, { mode: 'check', client, brand, runsPlugins: false, trust: TRUST_NOTICE, registered: registered.found, checks });
    return passed ? 0 : 1;
  }
  console.log(`\n  ${pc.bold(`blazon-mcp for ${client}, brand ${brand}`)}\n  ${pc.yellow(TRUST_NOTICE)}\n`);
  for (const check of checks) {
    const mark = check.passed ? pc.green('ok     ') : check.advisory ? pc.yellow('finding') : pc.red('fail   ');
    console.log(`  ${mark} ${check.name.padEnd(10)} ${check.detail}`);
    if (!check.passed && check.fix) console.log(`  ${' '.repeat(7)} ${' '.repeat(10)} ${pc.dim('fix:')} ${check.fix}`);
  }
  console.log(
    `\n  ${passed ? pc.green('The server is ready.') : pc.red('The server is not ready.')}${registered.found ? '' : ' It is not registered in this client yet (a finding, not a failure).'}\n`,
  );
  return passed ? 0 : 1;
}
