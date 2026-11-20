// Installs a packed tarball into an empty folder, as someone who has never seen this repository would, and runs the commands they
// would run first. It proves the package works from its own files, not from this checkout. The release job runs it on the tarball
// it is about to attach (ci.yml); run it by hand the same way:
//   npm pack && node scripts/smoke-tarball.mjs iksnerd-blazon-<version>.tgz
// Nothing here reads the repository but test/first-run/expected.json (what a fresh project's check may report): the tarball and a temporary folder are all else it uses. blazon refuses to run a plugin that has a
// folder others can write above it, so on a machine where the system temp folder is one, set BLAZON_SMOKE_DIR to a folder under home.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { firstRunProblems } from './first-run-expectation.mjs';

const tarball = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!tarball || !fs.existsSync(tarball)) {
  console.error('usage: node scripts/smoke-tarball.mjs <package.tgz>');
  process.exit(1);
}

// Under the home folder, not os.tmpdir(): the plugin host refuses an install in a folder that group or others can write, and the
// system temp folder is one on a CI runner, so the shipped plugins would fail to start there.
const base = process.env.BLAZON_SMOKE_DIR ? path.resolve(process.env.BLAZON_SMOKE_DIR) : os.homedir();
fs.mkdirSync(base, { recursive: true });
const work = fs.realpathSync(fs.mkdtempSync(path.join(base, 'blazon-smoke-')));

let failed = false;
function step(label, file, args, options = {}) {
  const run = spawnSync(file, args, { cwd: work, encoding: 'utf-8', timeout: 300_000, ...options });
  const ok = run.status === 0 && (!options.expect || `${run.stdout}${run.stderr}`.includes(options.expect));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    failed = true;
    console.error(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n'));
    throw new Error(`${label} failed`);
  }
  return run;
}

/** Starts the server the way the printed config says, on the fresh brand, and calls tools over stdio: tools/list and a real check_brand and list_tokens. */
async function callInstalledServer(entry, brand) {
  const child = spawn(entry.command, entry.args, { cwd: work, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...entry.env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
      } catch {
        // not a reply
      }
    }
  });
  let id = 0;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const mine = ++id;
      const timer = setTimeout(() => reject(new Error(`${method}: no answer in 60 s`)), 60_000);
      pending.set(mine, (message) => (clearTimeout(timer), resolve(message)));
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mine, method, params })}\n`);
    });
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = (await request('tools/list', {})).result.tools.map((tool) => tool.name);
    const check = await request('tools/call', { name: 'check_brand', arguments: { limit: 1 } });
    const list = await request('tools/call', { name: 'list_tokens', arguments: { group: 'text' } });
    const ok = tools.includes('check_brand') && check.result?.structuredContent?.passed === true && (list.result?.structuredContent?.tokens?.length ?? 0) > 0;
    console.log(`${ok ? 'ok  ' : 'FAIL'} installed MCP server over stdio (${tools.length} tools; check_brand, list_tokens on ${path.basename(brand)})`);
    if (!ok) {
      failed = true;
      throw new Error(`the installed server answered wrongly: ${JSON.stringify({ tools, check: check.result ?? check.error, list: list.result ?? list.error }).slice(0, 600)}`);
    }
  } finally {
    child.kill('SIGTERM');
  }
}

try {
  step('npm init', 'npm', ['init', '-y']);
  step('npm install <tarball>', 'npm', ['install', '--no-audit', '--no-fund', tarball]);
  // npm 12 warns an installer about a script of the package it was not told to trust. The packed manifest must carry none that npm
  // runs for an installer or a git dependency, so the warning cannot appear (the contributor hooks are `npm run hooks`).
  const manifest = JSON.parse(fs.readFileSync(path.join(work, 'node_modules', '@iksnerd', 'blazon', 'package.json'), 'utf-8'));
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'].filter((name) => manifest.scripts?.[name]);
  if (lifecycle.length > 0) {
    failed = true;
    console.error(`FAIL the package's manifest has install-time scripts: ${lifecycle.join(', ')}`);
    throw new Error('install-time scripts');
  }
  console.log('ok   no install-time script in the package');
  // An agent reads what changed between versions in the installed package: the release writes the new section into CHANGELOG.md before the tag, so the packed file names this version.
  const changelog = path.join(work, 'node_modules', '@iksnerd', 'blazon', 'CHANGELOG.md');
  if (!fs.existsSync(changelog) || !fs.readFileSync(changelog, 'utf-8').includes(`## ${manifest.version} `)) {
    failed = true;
    console.error(`FAIL the installed package has no CHANGELOG.md with a "## ${manifest.version}" section`);
    throw new Error('CHANGELOG.md');
  }
  console.log('ok   CHANGELOG.md is in the package and has this version');
  const blazon = path.join(work, 'node_modules', '.bin', 'blazon');
  const programs = path.join(work, 'node_modules', '@iksnerd', 'blazon', 'plugins');
  step('blazon --help', blazon, ['--help'], { expect: 'Usage' });
  step('blazon init', blazon, ['init', 'brand', '--yes']);
  step('blazon check', blazon, ['check', 'brand']);
  // What a new user sees on minute one, from the packed starter: judged against the same file the source test reads.
  const fresh = step('blazon check --json', blazon, ['check', 'brand', '--json']);
  const expected = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'test', 'first-run', 'expected.json'), 'utf-8'));
  const drift = firstRunProblems(JSON.parse(fresh.stdout), expected);
  if (drift.length > 0) {
    failed = true;
    console.error(`FAIL the packed starter's first run differs from test/first-run/expected.json:\n${drift.map((line) => `  ${line}`).join('\n')}`);
    throw new Error('first run');
  }
  step('blazon build', blazon, ['build', 'brand']);
  const name = 'blazon.copy';
  step(`blazon plugin check --core (${name})`, blazon, ['plugin', 'check', path.join(programs, name, 'bin', `blazon-${name}.🔌`), '--core']);
  step('blazon doctor', blazon, ['doctor'], { cwd: path.join(work, 'brand') });
  // The MCP server ships in the package as one file. --check starts it on the brand, runs a real handshake (initialize, tools/list,
  // check_brand) and needs no BLAZON_BIN, since the server runs the bin/blazon.js beside it.
  const check = step('blazon mcp --check (the handshake)', blazon, ['mcp', '--check', '--brand', 'brand', '--json']);
  const checked = JSON.parse(check.stdout);
  if (checked.passed !== true) {
    failed = true;
    console.error(`FAIL blazon mcp --check did not pass: ${check.stdout}`);
    throw new Error('mcp --check');
  }
  const printed = step('blazon mcp --print-config', blazon, ['mcp', '--print-config', '--client', 'cursor', '--brand', 'brand', '--json']);
  const entry = JSON.parse(JSON.parse(printed.stdout).snippets[0].text).mcpServers.blazon;
  if (!fs.existsSync(entry.args[0]) || !entry.args[0].startsWith(path.join(work, 'node_modules'))) {
    failed = true;
    console.error(`FAIL the printed command does not name the installed server file: ${JSON.stringify(entry)}`);
    throw new Error('mcp --print-config');
  }
  await callInstalledServer(entry, path.join(work, 'brand'));
  console.log('smoke: the tarball installs and runs');
} catch (error) {
  if (!failed) console.error(String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
