import fs from 'node:fs';
import path from 'node:path';
import pc from '../../core/colors.js';
import { buildMcpConfig, isMcpClient, MCP_CLIENTS, INCOMPLETE_INSTALL, isSourceCheckout, resolveMcpLaunch, type McpClient } from '../../core/mcp-config.js';
import { UsageError } from '../errors.js';
import { printJson } from '../read.js';
import { runMcpCheck } from './mcp-check.js';

/**
 * `blazon mcp --print-config [--client c] [--brand dir]`: prints what registers blazon-mcp (stdio) in a client. Writes no file.
 * `blazon mcp --check [--client c] [--brand dir]`: says whether the server is built, can find blazon, answers a real MCP handshake and is registered.
 * Exits 0, or 2 for an unknown client, both flags or neither. `--check` exits 1 when the server is not ready; `--print-config` exits 1 when an install has lost its server file, because there is no command that works.
 */
export async function runMcp(options: { printConfig?: boolean; check?: boolean; client?: string; brand?: string; json?: boolean; root?: string } = {}): Promise<number> {
  if (options.printConfig && options.check) throw new UsageError('give --print-config or --check, not both. See blazon mcp --help.', undefined, 'conflicting-options');
  if (!options.printConfig && !options.check)
    throw new UsageError(
      'give --print-config to print the config that registers blazon-mcp in a client, or --check to test that it works; neither writes a file. See blazon mcp --help.',
      undefined,
      'missing-argument',
    );
  const client: McpClient = options.client === undefined ? 'claude-code' : (options.client as McpClient);
  if (options.client !== undefined && !isMcpClient(options.client))
    throw new UsageError(`unknown client "${options.client}"; the clients are ${MCP_CLIENTS.join(', ')}.`, undefined, 'invalid-option-value');
  const brand = options.brand === undefined ? undefined : path.resolve(process.cwd(), options.brand);
  if (options.check) {
    const folder = brand ?? process.cwd();
    if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw new UsageError(`the brand folder ${folder} does not exist.`, undefined, 'no-folder');
    return runMcpCheck({ client, brand: folder, ...(options.root && { root: options.root }), ...(options.json && { json: true }) });
  }
  const launch = resolveMcpLaunch(options.root);
  if (!launch.built && !isSourceCheckout(options.root)) {
    // An install without its server file is damaged: every command printed would fail, so say so and print none.
    if (options.json) printJson('mcp', false, { client, built: false, ...(brand && { brand }), note: INCOMPLETE_INSTALL, snippets: [] });
    else console.error(`\n  ${pc.yellow(INCOMPLETE_INSTALL)}\n`);
    return 1;
  }
  const config = buildMcpConfig(client, launch, brand);
  if (options.json) {
    printJson('mcp', true, { client, built: config.built, ...(brand && { brand }), ...(config.note && { note: config.note }), snippets: config.snippets });
    return 0;
  }
  console.log(`\n  ${pc.bold(config.title)}`);
  for (const snippet of config.snippets) console.log(`\n  ${pc.dim(snippet.label)}\n\n${snippet.text.replace(/^/gm, '  ')}`);
  if (config.note) console.log(`\n  ${pc.yellow(config.note)}`);
  console.log('');
  return 0;
}
