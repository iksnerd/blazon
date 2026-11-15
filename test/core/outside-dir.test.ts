import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from '../support/spawn';
import { REPO } from '../support/paths';
import { starterProject, tempDir } from '../support/project';
import { loadConfig, resolveConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { operatorDirs, setApprovedDirs } from '../../src/core/confine.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';

// `assets.<key>.dir` may name a folder outside the project only when the person running blazon approved that folder (--allow-dir,
// BLAZON_ALLOW_DIRS). A brand cannot approve one itself: its blazon.json is the thing being distrusted.

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>shared</title></svg>';

const blazon = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['--import', pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href, path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...env },
    input: '',
  });

describe('an assets dir outside the project', () => {
  let project: string;
  let parent: string;
  let shared: string;

  beforeAll(async () => {
    project = await starterProject();
    parent = tempDir('blazon-allow-');
    shared = path.join(parent, 'shared');
    fs.mkdirSync(path.join(shared, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(shared, 'mark.svg'), SVG);
    fs.mkdirSync(path.join(parent, 'other'));
    fs.writeFileSync(path.join(parent, 'other', 'leak.svg'), SVG);
    // A link inside the approved folder that leaves it, and a link that reaches the other folder from outside
    fs.symlinkSync(path.join(parent, 'other'), path.join(shared, 'link-out'));
  }, 60_000);
  afterEach(() => setApprovedDirs([]));

  const compile = async (dir: string, key = 'shared') => compileBlazonData({ ...(await loadConfig(project)), assets: { [key]: { dir } } }, project);
  const refusals = (data: Awaited<ReturnType<typeof compile>>) => data.findings.filter((f) => f.code === 'config-path-outside');
  const has = (data: Awaited<ReturnType<typeof compile>>, id: string) => data.assets.all.some((a) => a.id === id);

  it('is refused by default, with a message that says how to approve it', async () => {
    const data = await compile(shared);
    expect(refusals(data)).toHaveLength(1);
    expect(refusals(data)[0]!.path).toBe('assets.shared.dir');
    expect(refusals(data)[0]!.message).toContain('--allow-dir');
    expect(refusals(data)[0]!.message).toContain('BLAZON_ALLOW_DIRS');
    expect(has(data, 'shared/mark')).toBe(false);
  });

  it('is read once the operator approved the folder, and a folder inside it too', async () => {
    setApprovedDirs([shared]);
    const data = await compile(shared);
    expect(refusals(data)).toHaveLength(0);
    expect(has(data, 'shared/mark')).toBe(true);
    expect(refusals(await compile(path.join(shared, 'sub')))).toHaveLength(0);
  });

  it('is approved by the parent of the folder it names, and not by a sibling', async () => {
    setApprovedDirs([parent]);
    expect(refusals(await compile(shared))).toHaveLength(0);
    setApprovedDirs([path.join(parent, 'other')]);
    expect(refusals(await compile(shared))).toHaveLength(1);
  });

  it('is approved by BLAZON_ALLOW_DIRS, entries split on the platform delimiter', () => {
    const list = ['/nowhere/a', shared, ''].join(path.delimiter);
    expect(operatorDirs([], { BLAZON_ALLOW_DIRS: list }, project)).toEqual([path.resolve('/nowhere/a'), shared]);
  });

  it('is refused when a link inside an approved folder leaves it', async () => {
    setApprovedDirs([shared]);
    const data = await compile(path.join(shared, 'link-out'));
    expect(refusals(data)).toHaveLength(1);
    expect(has(data, 'shared/leak')).toBe(false);
  });

  it('is refused when a .. leaves the approved folder', async () => {
    setApprovedDirs([shared]);
    const data = await compile(path.join(shared, '..', 'other'));
    expect(refusals(data)).toHaveLength(1);
    expect(has(data, 'shared/leak')).toBe(false);
  });

  it('resolves a relative approval against the folder blazon started in', () => {
    expect(operatorDirs(['./shared'], {}, parent)).toEqual([shared]);
    expect(operatorDirs(['../shared'], {}, path.join(parent, 'other'))).toEqual([shared]);
  });

  it('is refused with the same message whether the folder exists or not', async () => {
    const present = refusals(await compile(shared))[0]!.message.replace(shared, 'X');
    const missing = refusals(await compile(path.join(parent, 'missing-folder')))[0]!.message.replace(path.join(parent, 'missing-folder'), 'X');
    expect(present).toBe(missing);
    // and no "does not exist" finding either way
    expect((await compile(path.join(parent, 'missing-folder'))).findings.some((f) => /does not exist/.test(f.message))).toBe(false);
  });

  it('cannot be approved by the brand: a blazon.json key that tries is an unknown key', async () => {
    const top = resolveConfig({ allowDirs: [shared] });
    expect(top.problems.length).toBeGreaterThan(0);
    const inside = await compileBlazonData({ ...(await loadConfig(project)), assets: { shared: { dir: shared, allowDirs: [shared], allowDir: shared } } } as never, project);
    expect(inside.findings.some((f) => f.code === 'asset-config-invalid' && /unknown field/.test(f.message))).toBe(true);
    expect(has(inside, 'shared/mark')).toBe(false);
  });

  it('through the command line: refused, then --allow-dir (relative to where blazon starts), then BLAZON_ALLOW_DIRS', () => {
    const brand = path.join(parent, 'brand');
    fs.cpSync(project, brand, { recursive: true });
    const file = path.join(brand, 'blazon.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    fs.writeFileSync(file, JSON.stringify({ ...json, assets: { shared: { dir: '../shared' } } }));
    const refused = blazon(brand, ['check', '--json']);
    expect(refused.stdout + refused.stderr).toContain('config-path-outside');
    expect(blazon(brand, ['check', '--json', '--allow-dir', '../shared']).stdout).not.toContain('config-path-outside');
    expect(blazon(parent, ['check', 'brand', '--json', '--allow-dir', 'shared']).stdout).not.toContain('config-path-outside');
    expect(blazon(brand, ['check', '--json'], { BLAZON_ALLOW_DIRS: `/nowhere${path.delimiter}${shared}` }).stdout).not.toContain('config-path-outside');
    // an approval for another folder does not carry over
    expect(blazon(brand, ['check', '--json', '--allow-dir', '../other']).stdout).toContain('config-path-outside');
  }, 60_000);

  it('the dev server serves an approved outside image over /brand-assets, and nothing from a folder that is not approved', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(25)]);
    fs.writeFileSync(path.join(shared, 'scene.png'), png);
    fs.writeFileSync(path.join(parent, 'other', 'secret.png'), 'CANARY_NOT_APPROVED');
    setApprovedDirs([shared]);
    const server = await startDevServer({ ...DEFAULT_CONFIG, port: 0, assets: { shared: { dir: shared }, other: { dir: path.join(parent, 'other') } } }, project);
    try {
      const base = server.resolvedUrls!.local[0]!;
      expect((await fetch(new URL('brand-assets/shared/scene.png', base))).status).toBe(200);
      const refused = await fetch(new URL('brand-assets/other/secret.png', base));
      expect(await refused.text()).not.toContain('CANARY_NOT_APPROVED');
      expect(refused.status).not.toBe(200);
      const viaFs = await fetch(new URL(`@fs${path.join(parent, 'other', 'secret.png')}`, base));
      expect(await viaFs.text()).not.toContain('CANARY_NOT_APPROVED');
    } finally {
      await server.close();
    }
  }, 60_000);
});
