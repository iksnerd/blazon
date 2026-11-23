import { afterAll, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { starterProject } from '../support/init-project';
import { checkBuilt, checkBlazon, checkRegistered, expectedTools, handshake, runMcpCheck } from '../../src/cli/commands/mcp-check';

// `blazon mcp --check`: the four checks (built, blazon found, a real handshake, registered), each failing alone. The handshake is tried on
// a fake server that speaks JSON-RPC (so a hang, an early exit and a missing tool can be made) and, in the last block, on the real built
// server. Chrome is not used.

const BUILT = fs.existsSync(path.join(REPO, 'mcp/dist/index.js'));
// A missing build must not look like a pass: on CI the real-server block fails, elsewhere it is skipped with a notice.
if (!BUILT && process.env.CI) throw new Error('mcp/dist/index.js is not built, and CI must run the blazon mcp --check tests: npm ci && npm run build -w mcp.');
if (!BUILT) process.stderr.write('mcp/dist/index.js is not built: the real-server tests of blazon mcp --check are skipped (npm ci && npm run build -w mcp).\n');

const blazon = (args: string[], env: Record<string, string> = {}, cwd = REPO) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...env },
    input: '',
  });

/** A server script that answers like blazon-mcp does, or misbehaves as `mode` says. It writes its pid to `pidFile`. */
function fakeServer(mode: 'ok' | 'missing-tool' | 'hang' | 'exit' | 'tool-error', pidFile: string): string {
  const file = path.join(tempDir('blazon-mcp-fake-server-'), 'index.js');
  const names = expectedTools().filter((name, i) => !(mode === 'missing-tool' && i === 0));
  fs.writeFileSync(
    file,
    `
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const mode = ${JSON.stringify(mode)};
if (mode === 'exit') { console.error('Cannot find module nothing'); process.exit(3); }
if (mode === 'hang') setInterval(() => {}, 1000);
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (mode === 'hang' || msg.id === undefined) continue;
    const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');
    if (msg.method === 'initialize') reply({ protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '0' } });
    else if (msg.method === 'tools/list') reply({ tools: ${JSON.stringify(names)}.map((name) => ({ name })) });
    else if (mode === 'tool-error') reply({ isError: true, content: [{ type: 'text', text: 'Cannot run "blazon".' }] });
    else reply({ content: [{ type: 'text', text: '{}' }], structuredContent: { passed: true, counts: {} } });
  }
});
process.stdin.on('end', () => process.exit(0));
`,
  );
  return file;
}

/** Every fake server's pid file: a server a broken check left running is killed here, so a red run ends instead of hanging on its pipes. */
const pidFiles: string[] = [];
afterAll(() => {
  for (const file of pidFiles) {
    try {
      process.kill(-Number(fs.readFileSync(file, 'utf8')), 'SIGKILL');
    } catch {
      // never started, or already gone
    }
  }
});

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('mcp --check: (a) the server is built', () => {
  it('passes when mcp/dist/index.js exists and fails, with the build command, when it does not', () => {
    const root = tempDir('blazon-root-');
    fs.mkdirSync(path.join(root, 'mcp'));
    fs.writeFileSync(path.join(root, 'mcp/package.json'), '{}'); // a source checkout; an install without the file says to reinstall instead
    const missing = checkBuilt(root);
    expect(missing.passed).toBe(false);
    expect(missing.fix).toContain('npm run build -w mcp');
    fs.mkdirSync(path.join(root, 'mcp/dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mcp/dist/index.js'), '');
    expect(checkBuilt(root)).toMatchObject({ name: 'built', passed: true });
  });
});

describe('mcp --check: (b) blazon is resolvable', () => {
  const brand = tempDir('blazon-brand-');
  const root = tempDir('blazon-root-');
  const exe = (dir: string, name = 'blazon'): string => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o755 });
    return file;
  };

  it('uses BLAZON_BIN when set, and says so', () => {
    const bin = exe(tempDir());
    expect(checkBlazon({ BLAZON_BIN: bin, PATH: '' }, brand, root)).toMatchObject({ passed: true, source: 'BLAZON_BIN', path: bin });
  });

  it('fails when BLAZON_BIN names no executable, even if blazon is on PATH', () => {
    const dir = tempDir();
    exe(dir);
    const result = checkBlazon({ BLAZON_BIN: '/nope/blazon', PATH: dir }, brand, root);
    expect(result).toMatchObject({ passed: false, source: 'BLAZON_BIN' });
    expect(result.fix).toBeTruthy();
  });

  it('uses the bin/blazon.js of its own package when BLAZON_BIN is not set, as the server does, ahead of PATH', () => {
    const pkg = tempDir('blazon-pkg-');
    fs.mkdirSync(path.join(pkg, 'bin'));
    const own = exe(path.join(pkg, 'bin'), 'blazon.js');
    const dir = tempDir();
    exe(dir);
    expect(checkBlazon({ PATH: dir }, brand, pkg)).toMatchObject({ passed: true, source: 'package', path: own });
    expect(checkBlazon({ BLAZON_BIN: '/nope/blazon', PATH: dir }, brand, pkg)).toMatchObject({ passed: false, source: 'BLAZON_BIN' });
  });

  it('finds blazon on PATH, and fails with a fix when there is neither', () => {
    const dir = tempDir();
    exe(dir);
    expect(checkBlazon({ PATH: dir }, brand, root)).toMatchObject({ passed: true, source: 'PATH', path: path.join(dir, 'blazon') });
    expect(checkBlazon({ PATH: tempDir() }, brand, root)).toMatchObject({ passed: false, source: 'none' });
    expect(checkBlazon({ PATH: tempDir() }, brand, root).fix).toMatch(/BLAZON_BIN/);
  });
});

describe('mcp --check: (c) the handshake', () => {
  const brand = tempDir('blazon-brand-');
  const pidFile = () => {
    const file = path.join(tempDir('blazon-pid-'), 'pid');
    pidFiles.push(file);
    return file;
  };

  it('passes on a server that lists every tool and answers check_brand', async () => {
    const result = await handshake({ entry: fakeServer('ok', pidFile()), brand });
    expect(result).toMatchObject({ name: 'handshake', passed: true });
    expect(result.tools).toEqual(expectedTools());
  }, 20_000);

  it('fails and names the tool when tools/list lacks one', async () => {
    const result = await handshake({ entry: fakeServer('missing-tool', pidFile()), brand });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain(`missing ${expectedTools()[0]}`);
  }, 20_000);

  it('fails with the tool error when check_brand fails', async () => {
    const result = await handshake({ entry: fakeServer('tool-error', pidFile()), brand });
    expect(result).toMatchObject({ passed: false });
    expect(result.detail).toContain('Cannot run');
  }, 20_000);

  it('fails with the server message when the server exits before it answers', async () => {
    const result = await handshake({ entry: fakeServer('exit', pidFile()), brand });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('Cannot find module nothing');
  }, 20_000);

  it('kills a server that hangs at the timeout, and leaves no process behind', async () => {
    const pid = pidFile();
    const started = Date.now();
    const result = await handshake({ entry: fakeServer('hang', pid), brand, timeoutMs: 600 });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('no answer');
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(alive(Number(fs.readFileSync(pid, 'utf8')))).toBe(false);
  }, 20_000);

  it('stops a server that answered, too', async () => {
    const pid = pidFile();
    await handshake({ entry: fakeServer('ok', pid), brand });
    expect(alive(Number(fs.readFileSync(pid, 'utf8')))).toBe(false);
  }, 20_000);
});

describe('mcp --check: (d) the client has a blazon entry', () => {
  // Built at run time: a literal here reads as a credential to the secret scan, and the test only needs a value it can look for
  const canary = ['not', 'a', 'credential', '42'].join('-');
  const write = (home: string, rel: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const entry = { command: 'node', args: ['x', '--flag', canary], env: { SOME_VAR: canary } };

  it('finds the entry under the brand name, and under the old name blazon', () => {
    const names = ['acme-brand', 'blazon'];
    for (const key of ['acme-brand', 'blazon']) {
      const home = tempDir('blazon-home-');
      const project = tempDir('blazon-proj-');
      write(home, '.claude.json', { mcpServers: { [key]: entry } });
      expect(checkRegistered('claude-code', [project], project, home, undefined, names).found, key).toBe(true);
    }
  });

  it('does not take an entry of another name for this brand, and says which names it looked for', () => {
    const home = tempDir('blazon-home-');
    const project = tempDir('blazon-proj-');
    write(home, '.claude.json', { mcpServers: { 'other-brand': entry } });
    const result = checkRegistered('claude-code', [project], project, home, undefined, ['acme-brand', 'blazon']);
    expect(result.found).toBe(false);
    expect(result.detail).toContain('acme-brand');
    expect(result.detail).toContain('blazon');
  });

  it('finds the entry by name in ~/.claude.json, at the top and under the project, and never returns a value', () => {
    const home = tempDir('blazon-home-');
    const project = tempDir('blazon-proj-');
    write(home, '.claude.json', { projects: { [project]: { mcpServers: { blazon: entry } } }, mcpServers: { other: entry } });
    const result = checkRegistered('claude-code', [project], project, home);
    expect(result).toMatchObject({ found: true, advisory: true });
    expect(JSON.stringify(result)).not.toContain(canary);
    write(home, '.claude.json', { mcpServers: { blazon: entry } });
    expect(checkRegistered('claude-code', [project], project, home).found).toBe(true);
  });

  it("does not take another project's entry, and reports the exact print-config command as the fix", () => {
    const home = tempDir('blazon-home-');
    const project = tempDir('blazon-proj-');
    write(home, '.claude.json', { projects: { '/elsewhere': { mcpServers: { blazon: entry } } } });
    const result = checkRegistered('claude-code', [project], project, home);
    expect(result.passed).toBe(false);
    expect(result.fix).toBe(`blazon mcp --print-config --client claude-code --brand ${project}`);
  });

  it("reads the project .mcp.json, and VS Code's `servers` key", () => {
    const project = tempDir('blazon-proj-');
    const home = tempDir('blazon-home-');
    write(project, '.mcp.json', { mcpServers: { blazon: entry } });
    expect(checkRegistered('claude-code', [project], project, home).found).toBe(true);
    write(project, '.vscode/mcp.json', { servers: { blazon: entry } });
    expect(checkRegistered('vscode', [project], project, home).found).toBe(true);
    write(project, '.vscode/mcp.json', { mcpServers: { blazon: entry } });
    expect(checkRegistered('vscode', [project], project, home).passed).toBe(false);
  });

  it('skips a file that is not JSON and says so', () => {
    const project = tempDir('blazon-proj-');
    write(project, '.cursor/mcp.json', '{ not json');
    const result = checkRegistered('cursor', [project], project, tempDir('blazon-home-'));
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('not valid JSON');
  });
});

describe('mcp --check: (e) the registered entry runs this install', () => {
  // Built at run time, as in (d): a literal reads as a credential to the secret scan
  const canary = ['not', 'a', 'credential', '42'].join('-');
  const write = (home: string, rel: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), JSON.stringify(value));
  };
  /** A package root holding mcp/dist/index.js; the path of that file comes back too. */
  const install = (): { root: string; entry: string } => {
    const root = fs.realpathSync(tempDir('blazon-install-'));
    fs.mkdirSync(path.join(root, 'mcp/dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mcp/dist/index.js'), '');
    return { root, entry: path.join(root, 'mcp/dist/index.js') };
  };
  const run = (entry: { command?: string; args?: string[]; env?: Record<string, string> }, root: string, home = tempDir('blazon-home-')) => {
    const project = tempDir('blazon-proj-');
    write(home, '.claude.json', { mcpServers: { blazon: entry } });
    return checkRegistered('claude-code', [project], project, home, root);
  };

  it('passes when the entry runs this install server file, through a symlink or a ~ path too', () => {
    const { root, entry } = install();
    const same = run({ command: 'node', args: [entry, '--brand', '/b'] }, root);
    expect(same).toMatchObject({ passed: true, advisory: true, state: 'same', sameServer: true });
    expect(same.detail).toContain(entry);
    const link = path.join(tempDir('blazon-link-'), 'server.js');
    fs.symlinkSync(entry, link);
    expect(run({ command: 'node', args: [link] }, root)).toMatchObject({ passed: true, state: 'same' });
    const home = fs.realpathSync(tempDir('blazon-home-'));
    const rel = path.relative(home, entry);
    expect(run({ command: 'node', args: [`~/${rel}`] }, root, home)).toMatchObject({ passed: true, state: 'same' });
  });

  it('is a finding naming the client, the registered file and this install file when the entry runs another file', () => {
    const { root, entry } = install();
    const clone = install().entry;
    const result = run({ command: 'node', args: [clone, '--brand', '/b'] }, root);
    expect(result).toMatchObject({
      name: 'registered',
      passed: false,
      advisory: true,
      state: 'different',
      sameServer: false,
      found: true,
      registeredPath: clone,
      installPath: entry,
    });
    expect(result.detail).toContain('claude-code');
    expect(result.detail).toContain(clone);
    expect(result.detail).toContain(entry);
    expect(result.detail).toContain('blazon mcp --print-config');
    expect(result.fix).toMatch(/^blazon mcp --print-config --client claude-code/);
  });

  it('says it could not tell when the entry has no script path it can identify, and neither passes nor fails it', () => {
    const { root } = install();
    for (const entry of [
      { command: 'npx', args: ['-y', 'blazon-mcp'] },
      { command: 'blazon-mcp', args: ['--brand', '/b'] },
      { command: 'node', args: ['/no/such/server.js'] },
      { command: 'docker', args: ['run', 'blazon'] },
      { args: [] },
    ]) {
      const result = run(entry, root);
      expect(result, JSON.stringify(entry)).toMatchObject({ passed: false, advisory: true, state: 'unknown', sameServer: null, found: true });
      expect(result.detail).toContain('could not tell which file it runs');
      expect(result).not.toHaveProperty('registeredPath');
    }
  });

  it('is unchanged when nothing is registered', () => {
    const { root } = install();
    const project = tempDir('blazon-proj-');
    const result = checkRegistered('claude-code', [project], project, tempDir('blazon-home-'), root);
    expect(result).toMatchObject({ passed: false, advisory: true, state: 'none', found: false, files: [] });
    expect(result.detail).toContain("no server named blazon in claude-code's config");
    expect(result.fix).toBe(`blazon mcp --print-config --client claude-code --brand ${project}`);
  });

  it('names a different file even when another config holds the same one', () => {
    const { root, entry } = install();
    const clone = install().entry;
    const home = tempDir('blazon-home-');
    const project = tempDir('blazon-proj-');
    write(home, '.claude.json', { mcpServers: { blazon: { command: 'node', args: [clone] } } });
    write(project, '.mcp.json', { mcpServers: { blazon: { command: 'node', args: [entry] } } });
    expect(checkRegistered('claude-code', [project], project, home, root)).toMatchObject({ state: 'different', registeredPath: clone });
  });

  it('never prints an argument or an environment value, in the text or the JSON answer', async () => {
    const { root } = install();
    const clone = install().entry;
    const home = tempDir('blazon-home-');
    const project = tempDir('blazon-proj-');
    const secretEntry = { command: 'node', args: [clone, '--token', canary, `--key=${canary}`], env: { API_TOKEN: canary } };
    write(home, '.claude.json', { mcpServers: { blazon: secretEntry } });
    expect(JSON.stringify(checkRegistered('claude-code', [project], project, home, root))).not.toContain(canary);
    write(home, '.claude.json', { mcpServers: { blazon: { command: 'npx', args: ['-y', `--token=${canary}`], env: { API_TOKEN: canary } } } });
    expect(JSON.stringify(checkRegistered('claude-code', [project], project, home, root))).not.toContain(canary);
    write(home, '.claude.json', { mcpServers: { blazon: secretEntry } });
    for (const json of [false, true]) {
      const out: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => void out.push(parts.join(' ')));
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => (out.push(String(chunk)), true));
      try {
        await runMcpCheck({ client: 'claude-code', brand: project, cwd: project, home, root, json, env: { PATH: '' } });
      } finally {
        spy.mockRestore();
        stdout.mockRestore();
      }
      const text = out.join('\n');
      expect(text).toContain(clone);
      expect(text).not.toContain(canary);
    }
  }, 60_000);
});

describe('blazon mcp --check (command line)', () => {
  it('exits 2 for --check with --print-config, and for a brand folder that does not exist', () => {
    const both = blazon(['mcp', '--check', '--print-config', '--json']);
    expect(both.status).toBe(2);
    expect(JSON.parse(both.stdout)).toMatchObject({ command: 'mcp', passed: false });
    expect(blazon(['mcp', '--check', '--brand', '/nonexistent-brand-folder', '--json']).status).toBe(2);
    expect(blazon(['mcp', '--check', '--client', 'emacs', '--json']).status).toBe(2);
  }, 60_000);

  describe.skipIf(!BUILT)('against the real built server', () => {
    it('passes on a starter brand, answers in the repo JSON shape, and says it runs the brand config', async () => {
      const brand = await starterProject();
      const bin = path.join(tempDir('blazon-bin-'), 'blazon');
      const tsx = `file://${path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')}`;
      fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" --import ${tsx} "${path.join(REPO, 'scripts/blazon-src.ts')}" "$@"\n`, { mode: 0o755 });
      const ran = blazon(['mcp', '--check', '--brand', brand, '--json'], { BLAZON_BIN: bin, HOME: tempDir('blazon-home-') });
      expect(ran.status, ran.stderr + ran.stdout).toBe(0);
      const out = JSON.parse(ran.stdout);
      expect(Object.keys(out).slice(0, 2)).toEqual(['command', 'passed']);
      expect(out).toMatchObject({ command: 'mcp', passed: true, mode: 'check', runsPlugins: false, registered: false });
      expect(out.trust).toMatch(/runs blazon with no plugin/);
      expect(out.checks.map((c: { name: string }) => c.name)).toEqual(['built', 'blazon', 'handshake', 'registered']);
      expect(out.checks[2].tools).toEqual(expectedTools());
      expect(out.checks[3]).toMatchObject({ passed: false, advisory: true, fix: expect.stringContaining('blazon mcp --print-config') });
    }, 120_000);

    it('exits 1 with a fix when blazon cannot be found, while the handshake itself still runs', async () => {
      const brand = await starterProject();
      const ran = blazon(['mcp', '--check', '--brand', brand, '--json'], { BLAZON_BIN: '/nope/blazon', HOME: tempDir('blazon-home-') });
      expect(ran.status).toBe(1);
      const out = JSON.parse(ran.stdout);
      expect(out.passed).toBe(false);
      expect(out.checks[1]).toMatchObject({ name: 'blazon', passed: false, source: 'BLAZON_BIN' });
      expect(out.checks[1].fix).toBeTruthy();
      expect(out.checks[2]).toMatchObject({ passed: false });
    }, 120_000);
  });
});
