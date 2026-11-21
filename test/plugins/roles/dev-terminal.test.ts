import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadConfig } from '../../../src/core/config/index.js';
import { createBlazonVitePlugin } from '../../../src/server/plugin.js';
import { tempDir } from '../../support/project';
import { initStarter } from '../../support/init-project';

// blazon dev on a real project: a token file that breaks is said in the terminal, with where, and so is the fix. A real Vite dev server
// and a real file change, with console.error watched. The viewer gets the findings either way; this is for whoever watches the terminal.

let server: ViteDevServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

const until = async (read: () => boolean, what: string, ms = 20_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!read()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe('blazon dev, in its terminal', () => {
  it('says a broken token file, where it is and what to do, and says when it is fixed', async () => {
    const root = tempDir('blazon-dev-terminal-');
    await initStarter(root);
    const viewer = path.join(root, 'viewer');
    fs.mkdirSync(viewer);
    fs.writeFileSync(path.join(viewer, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>');
    const said: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void said.push(args.map(String).join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void said.push(args.map(String).join(' ')));
    server = await createServer({ configFile: false, root: viewer, logLevel: 'silent', server: { port: 0, strictPort: false }, plugins: [createBlazonVitePlugin(await loadConfig(root), root)] });
    await server.listen();

    const colors = path.join(root, 'tokens/colors.json');
    const good = fs.readFileSync(colors, 'utf-8');
    fs.writeFileSync(colors, '{ bad json');
    await until(() => said.some((line) => line.includes('[token-file-invalid]')), 'the broken file to be said');
    const line = said.find((l) => l.includes('[token-file-invalid]'))!;
    expect(line).toContain('tokens/colors.json');
    expect(line).toContain('Fix the JSON syntax');

    fs.writeFileSync(colors, good);
    await until(() => said.includes('[blazon] the errors are fixed'), 'the fix to be said');
  }, 60_000);
});
