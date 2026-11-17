#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BlazonRunner, targetFrom } from './blazon.js';
import { createServer } from './server.js';
import { versionLine } from './version.js';

let runner: BlazonRunner | undefined;
let stopping = false;

/** Kills the blazon commands in flight and exits: on a signal, or when the client closes standard input. */
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  runner?.killAll();
  setTimeout(() => process.exit(code), 1000).unref();
  process.exitCode = code;
  process.stdin.pause();
}

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
  console.log(versionLine());
  process.exit(0);
}

try {
  // Inside @iksnerd/blazon this file is mcp/dist/index.js and the blazon program is bin/blazon.js two folders up.
  const own = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/blazon.js');
  const target = targetFrom(args, process.env, process.cwd(), own);
  runner = new BlazonRunner(target);
  const server = createServer(target, runner);
  server.server.onclose = () => stop(0);
  process.on('SIGTERM', () => stop(0));
  process.on('SIGINT', () => stop(0));
  process.stdin.on('close', () => stop(0));
  process.stdin.on('end', () => stop(0));
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(`blazon-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
