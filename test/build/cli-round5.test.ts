import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';
import { starterProject } from '../support/init-project';
import { compileBlazonData } from '../../src/core/index.js';
import { loadConfig } from '../../src/core/config/index.js';
import { fetchBytes } from '../../src/core/drift/read.js';

// A fifth outside review found small edges, each one something a person or an agent hits in the first hour.

// tsx by its address, because a test that runs blazon from another folder cannot find it by name
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

const blazon = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', TSX, path.join(REPO, 'scripts/blazon-src.ts'), ...args], { encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' }, input: '' });

describe('a folder that is not there', () => {
  it.each(['check', 'tokens'])(
    '%s says so and prints no banner for work it will not do',
    (command) => {
      const result = blazon(REPO, command, path.join(tempDir('blazon-gone-'), 'nope'));
      expect(result.status).toBe(2);
      expect(result.stderr + result.stdout).toContain('no folder');
      expect(result.stderr + result.stdout).not.toMatch(/Checking design tokens|Compiling design tokens/);
    },
    60_000,
  );
});

describe('blazon help', () => {
  it('prints the same help as --help and exits 0', () => {
    const asked = blazon(REPO, 'help');
    expect(asked.status).toBe(0);
    expect(asked.stdout).toBe(blazon(REPO, '--help').stdout);
  }, 60_000);

  it('prints the help of one command', () => {
    const asked = blazon(REPO, 'help', 'check');
    expect(asked.status).toBe(0);
    expect(asked.stdout).toBe(blazon(REPO, 'check', '--help').stdout);
    expect(asked.stdout).toContain('--strict');
  }, 60_000);

  it('shows the commands for a name that is not one, as `blazon chek --help` does', () => {
    const asked = blazon(REPO, 'help', 'chek');
    expect(asked.status).toBe(0);
    expect(asked.stdout).toBe(blazon(REPO, '--help').stdout);
  }, 60_000);
});

describe('build --outDir', () => {
  it('is a path from the folder blazon is run in, as for every command line tool', async () => {
    const project = await starterProject();
    const here = tempDir('blazon-here-');
    const result = blazon(here, 'build', project, '-o', 'site-out', '--no-plugins');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.existsSync(path.join(here, 'site-out', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(project, 'site-out'))).toBe(false);
  }, 90_000);

  it.each([['-o'], ['--outDir'], ['--out-dir'], ['--outDir=%'], ['--out-dir=%']])(
    'takes a number as the folder name with %s',
    async (flag) => {
      const project = await starterProject();
      const here = tempDir('blazon-here-');
      const args = flag.endsWith('=%') ? [flag.replace('%', '2024')] : [flag, '2024'];
      const result = blazon(here, 'build', project, ...args, '--no-plugins');
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.existsSync(path.join(here, '2024', 'index.html'))).toBe(true);
    },
    120_000,
  );

  it('still refuses an outDir that would take the project with it', async () => {
    const project = await starterProject();
    const result = blazon(project, 'build', '.', '-o', '.', '--no-plugins');
    expect(result.status).not.toBe(0);
    // blazon check says so before the build starts, and the build then empties nothing
    expect(result.stdout + result.stderr).toMatch(/output-dirs-overlap|holds the project folder/);
    expect(fs.existsSync(path.join(project, 'tokens'))).toBe(true);
  }, 90_000);
});

describe('--json counts', () => {
  it('name the notes info, as the findings do, and have no notes', async () => {
    const project = await starterProject();
    const out = JSON.parse(blazon(REPO, 'check', project, '--json').stdout);
    expect(out.counts).toEqual({ errors: 0, warnings: 2, info: expect.any(Number) });
    expect(out.counts.info).toBeGreaterThan(0);
    expect(out.counts).not.toHaveProperty('notes');
  }, 60_000);
});

describe('a token file that is not an object', () => {
  const finding = async (content: string) => {
    const project = await starterProject();
    fs.writeFileSync(path.join(project, 'tokens/colors.json'), content);
    return (await compileBlazonData(await loadConfig(project), project)).findings.find((f) => f.code === 'token-file-invalid');
  };

  it('names the file in `file` when the JSON does not parse', async () => {
    expect(await finding('{ bad json')).toMatchObject({ path: 'tokens/colors.json', file: 'tokens/colors.json', line: 1 });
  });

  it('names the file the same way when the top level is not an object', async () => {
    expect(await finding('[]')).toMatchObject({ path: 'tokens/colors.json', file: 'tokens/colors.json', message: 'Top level must be an object' });
  });
});

describe('a fetch that fails', () => {
  it('says why: the address refused the connection', async () => {
    const server = net.createServer();
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const port = (server.address() as net.AddressInfo).port;
    await new Promise((closed) => server.close(closed));
    const url = `http://127.0.0.1:${port}/`;
    const error = (await fetchBytes(url).then(
      () => undefined,
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toContain(`could not fetch ${url}`);
    expect(error.message).toContain('ECONNREFUSED');
  }, 30_000);
});
