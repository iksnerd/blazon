import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject, tempDir } from '../support/project';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { setApprovedDirs } from '../../src/core/confine.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { runBuild } from '../../src/cli/commands/build.js';

// A brand's own paths stay inside its folder: blazon.json is data, so what it names is never a reason to read or write elsewhere. Each case
// puts a canary outside the project and points a field at it by `../`, an absolute path or a link.

const CANARY = 'CANARY_OUTSIDE_9f3a';
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${CANARY}</title></svg>`;

describe('paths that leave the project folder', () => {
  let project: string;
  let outside: string;

  beforeAll(async () => {
    project = await starterProject();
    outside = tempDir('blazon-outside-');
    fs.mkdirSync(path.join(outside, 'tokens'));
    fs.mkdirSync(path.join(outside, 'docs'));
    fs.mkdirSync(path.join(outside, 'assets'));
    fs.writeFileSync(path.join(outside, 'tokens', 'leak.json'), JSON.stringify({ leak: { $type: 'color', $value: '#123456', $description: CANARY } }));
    fs.writeFileSync(path.join(outside, 'docs', '99-leak.md'), `---\ntitle: ${CANARY}\n---\n# ${CANARY}\n`);
    fs.writeFileSync(path.join(outside, 'assets', 'leak.svg'), SVG);
    fs.writeFileSync(path.join(outside, 'logo.svg'), SVG);
    fs.writeFileSync(path.join(outside, 'cats.json'), JSON.stringify({ [CANARY]: ['a'] }));
  }, 60_000);

  const compile = async (over: object) => compileBlazonData({ ...(await loadConfig(project)), ...over }, project);
  const refusals = (data: Awaited<ReturnType<typeof compile>>) => data.findings.filter((f) => f.code === 'config-path-outside');
  const hasCanary = (data: unknown) => JSON.stringify(data).includes(CANARY);

  it('refuses tokensDir outside the project, and reads nothing from it', async () => {
    const data = await compile({ tokensDir: path.join(outside, 'tokens'), resolver: 'none.json' });
    expect(refusals(data).map((f) => f.path)).toContain('tokensDir');
    expect(hasCanary(data)).toBe(false);
  });

  it('refuses docsDir outside the project, by absolute path and by ../', async () => {
    for (const docsDir of [path.join(outside, 'docs'), path.relative(project, path.join(outside, 'docs'))]) {
      const data = await compile({ docsDir });
      expect(refusals(data).map((f) => f.path)).toEqual(['docsDir']);
      expect(hasCanary(data)).toBe(false);
    }
  });

  it('refuses assetsDir outside the project', async () => {
    const data = await compile({ assetsDir: path.join(outside, 'assets') });
    expect(refusals(data).map((f) => f.path)).toContain('assetsDir');
    expect(data.assets.all.some((a) => a.name === 'leak')).toBe(false);
  });

  it('refuses a docs folder that is a link out', async () => {
    const copy = await starterProject();
    fs.rmSync(path.join(copy, 'docs'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'docs'), path.join(copy, 'docs'));
    const data = await compileBlazonData(await loadConfig(copy), copy);
    expect(refusals(data).map((f) => f.path)).toEqual(['docsDir']);
    expect(hasCanary(data)).toBe(false);
  });

  it('refuses a token file and a page that are links out', async () => {
    const copy = await starterProject();
    fs.rmSync(path.join(copy, 'blazon.resolver.json'), { force: true });
    fs.symlinkSync(path.join(outside, 'tokens', 'leak.json'), path.join(copy, 'tokens', 'zz-leak.json'));
    fs.symlinkSync(path.join(outside, 'docs', '99-leak.md'), path.join(copy, 'docs', '99-leak.md'));
    const data = await compileBlazonData(await loadConfig(copy), copy);
    expect(refusals(data).map((f) => f.path)).toEqual(expect.arrayContaining(['tokens/zz-leak.json', '99-leak.md']));
    expect(hasCanary(data)).toBe(false);
  });

  it('refuses a resolver document outside the project', async () => {
    fs.writeFileSync(path.join(outside, 'resolver.json'), JSON.stringify({ version: '2025.10', sets: {}, resolutionOrder: [] }));
    const data = await compile({ resolver: path.join(outside, 'resolver.json') });
    expect(refusals(data).map((f) => f.path)).toEqual(['resolver']);
  });

  it.each([
    ['a ../ path', () => path.relative(project, path.join(outside, 'logo.svg'))],
    ['an absolute path', () => path.join(outside, 'logo.svg')],
    ['a path that does not exist', () => path.relative(project, path.join(outside, 'nope.svg'))],
  ])('refuses a logo named by %s, and says the same whether or not it exists', async (_name, file) => {
    const data = await compile({ logo: { onLight: file() } });
    expect(refusals(data)).toHaveLength(1);
    expect(data.findings.some((f) => f.code === 'logo-missing')).toBe(false);
    expect(data.logo?.onLight).toBeUndefined();
    expect(hasCanary(data)).toBe(false);
  });

  it('refuses a logo that is a link out', async () => {
    const copy = await starterProject();
    fs.symlinkSync(path.join(outside, 'logo.svg'), path.join(copy, 'assets', 'logos', 'link.svg'));
    const data = await compileBlazonData({ ...(await loadConfig(copy)), logo: './assets/logos/link.svg' }, copy);
    expect(refusals(data)).toHaveLength(1);
    expect(hasCanary(data)).toBe(false);
  });

  it('refuses an icon set categories file that is a link out', async () => {
    const copy = await starterProject();
    fs.mkdirSync(path.join(copy, 'node_modules', 'fakepkg', 'svg'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'node_modules', 'fakepkg', 'package.json'), '{"name":"fakepkg"}');
    fs.writeFileSync(path.join(copy, 'node_modules', 'fakepkg', 'svg', 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    fs.symlinkSync(path.join(outside, 'cats.json'), path.join(copy, 'cats.json'));
    const iconSets = [{ name: 'x', package: 'fakepkg', dir: 'svg', categories: 'cats.json' }];
    const data = await compileBlazonData({ ...(await loadConfig(copy)), iconSets }, copy);
    expect(data.findings.some((f) => f.code === 'icon-set-invalid')).toBe(true);
    expect(hasCanary(data)).toBe(false);
  });

  it('reads a category dir outside the project only when the operator approved it', async () => {
    fs.mkdirSync(path.join(outside, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'shared', 'mark.svg'), SVG.replace(CANARY, 'shared'));
    const assets = { shared: { dir: path.join(outside, 'shared') } };
    expect(refusals(await compile({ assets }))).toHaveLength(1);
    setApprovedDirs([outside]);
    const data = await compile({ assets });
    expect(refusals(data)).toHaveLength(0);
    expect(data.assets.all.some((a) => a.id === 'shared/mark')).toBe(true);
    setApprovedDirs([]);
  });

  it.each(['outDir', 'tokensOutDir'])('refuses %s in blazon.json outside the project and writes nothing there', async (key) => {
    const copy = await starterProject();
    const target = path.join(outside, `${key}-target`);
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'keep');
    const file = path.join(copy, 'blazon.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    fs.writeFileSync(file, JSON.stringify({ ...json, [key]: path.relative(copy, target) }));
    await expect(loadConfig(copy)).rejects.toThrow(/is outside the project folder/);
    expect(fs.readdirSync(target)).toEqual(['keep.txt']);
  });

  it('refuses an outDir that reaches outside through a link', async () => {
    const copy = await starterProject();
    const target = path.join(outside, 'dist-target');
    fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(copy, 'dist'));
    await expect(loadConfig(copy)).rejects.toThrow(/is outside the project folder/);
    expect(fs.readdirSync(target)).toEqual([]);
  });

  it('still lets the person running blazon pick any output folder with -o', async () => {
    const copy = await starterProject();
    const target = path.join(outside, 'chosen');
    await runBuild(copy, target);
    expect(fs.existsSync(path.join(target, 'index.html'))).toBe(true);
  });

  it('buildSite still writes where a caller says, for a config the caller built', async () => {
    const copy = await starterProject();
    const target = path.join(outside, 'api');
    await buildSite({ ...(await loadConfig(copy)), outDir: target }, copy);
    expect(fs.existsSync(path.join(target, 'index.html'))).toBe(true);
  });
});
