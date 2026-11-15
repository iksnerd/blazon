#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BlazonRunner, targetFrom } from './blazon.js';
import { createServer } from './server.js';

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

try {
  const target = targetFrom(process.argv.slice(2), process.env);
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
