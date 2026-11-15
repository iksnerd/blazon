import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../support/project';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { runBuild } from '../../src/cli/commands/build.js';

const TOKEN_FILES = ['theme.css', 'tokens.json', 'tokens.ts', 'typography.css'];

describe('the site folder is emptied before the tokens are written', () => {
  let project: string;

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  const exists = (...parts: string[]) => fs.existsSync(path.join(project, ...parts));

  it('keeps the tokens when tokensOutDir is inside outDir (buildSite)', async () => {
    const config = { ...(await loadConfig(project)), outDir: './dist', tokensOutDir: './dist/tokens' };
    await buildSite(config, project);
    for (const file of TOKEN_FILES) expect(exists('dist/tokens', file), file).toBe(true);
    expect(exists('dist/index.html')).toBe(true);
  });

  it('keeps the tokens when tokensOutDir is inside outDir (blazon build -o)', async () => {
    fs.rmSync(path.join(project, 'dist'), { recursive: true, force: true });
    await runBuild(project, './dist');
    for (const file of TOKEN_FILES) expect(exists('dist/tokens', file), file).toBe(true);
    expect(exists('dist/index.html')).toBe(true);
  });

  it('keeps the tokens when they are beside or outside the site folder', async () => {
    const config = { ...(await loadConfig(project)), outDir: './out/site', tokensOutDir: './out/tokens' };
    await buildSite(config, project);
    for (const file of TOKEN_FILES) expect(exists('out/tokens', file), file).toBe(true);
    expect(exists('out/site/index.html')).toBe(true);
  });
});

describe('output-dirs-overlap', () => {
  let project: string;

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  const codes = async (outDir: string, tokensOutDir: string) =>
    (await compileBlazonData({ ...(await loadConfig(project)), outDir, tokensOutDir }, project)).findings.filter((f) => f.code === 'output-dirs-overlap');

  it.each([
    ['the same folder', './dist', './dist/'],
    ['a tokensOutDir that holds outDir', './dist/site', './dist'],
  ])('is an error for %s, naming both folders', async (_name, outDir, tokensOutDir) => {
    const found = await codes(outDir, tokensOutDir);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error' });
    expect(found[0]!.message).toContain(outDir);
    expect(found[0]!.message).toContain(tokensOutDir);
  });

  it.each([
    ['tokens inside the site', './dist', './dist/tokens'],
    ['beside each other', './dist/site', './dist/tokens'],
    ['unrelated', './site', './tokens-out'],
  ])('is not raised for %s', async (_name, outDir, tokensOutDir) => {
    expect(await codes(outDir, tokensOutDir)).toEqual([]);
  });

  it('stops blazon build before it writes anything', async () => {
    fs.writeFileSync(
      path.join(project, 'blazon.json'),
      fs
        .readFileSync(path.join(project, 'blazon.json'), 'utf-8')
        .replace("outDir: './dist/site'", "outDir: './same'")
        .replace("tokensOutDir: './dist/tokens'", "tokensOutDir: './same'"),
    );
    await expect(runBuild(project)).rejects.toThrow();
    expect(fs.existsSync(path.join(project, 'same'))).toBe(false);
  });
});

describe('an output folder that overlaps an input', () => {
  let project: string;

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  const overlaps = async (over: object) => (await compileBlazonData({ ...(await loadConfig(project)), ...over }, project)).findings.filter((f) => f.code === 'output-dirs-overlap');

  it.each([
    ['outDir that is docsDir', { outDir: './docs' }, 'docsDir'],
    ['outDir that is tokensDir, written with a trailing slash', { outDir: './tokens/' }, 'tokensDir'],
    ['outDir that is assetsDir', { outDir: 'assets' }, 'assetsDir'],
    ['outDir that holds assetsDir and docsDir', { outDir: '.', docsDir: './docs' }, 'docsDir'],
    ['outDir that holds a configured logo file', { outDir: './brand', assetsDir: './assets', logo: './brand/logo.svg' }, 'logo'],
  ])('is an error for an %s, naming the input', async (_name, over, input) => {
    const found = await overlaps(over);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'blazon.json' });
    expect(found[0]!.message).toContain(String((over as { outDir: string }).outDir));
    expect(found[0]!.message).toContain(input);
    expect(found[0]!.message).toMatch(/empties outDir|would read/);
  });

  it.each([
    ['outDir inside assetsDir', { outDir: './assets/site' }, 'assetsDir'],
    ['outDir inside tokensDir', { outDir: './tokens/site' }, 'tokensDir'],
    ['tokensOutDir that is tokensDir', { tokensOutDir: './tokens' }, 'tokensDir'],
    ['tokensOutDir inside docsDir', { tokensOutDir: './docs/out' }, 'docsDir'],
  ])('is an error for %s, because the next build would read it back', async (_name, over, input) => {
    const found = await overlaps(over);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(input);
    expect(found[0]!.message).toContain('would read');
  });

  it('is not raised for the defaults, or for a folder beside the inputs', async () => {
    expect(await overlaps({})).toEqual([]);
    expect(await overlaps({ outDir: './docs-site', tokensOutDir: './tokens-out' })).toEqual([]);
  });

  it('stops buildSite before it deletes anything, so the public API is as safe as the command', async () => {
    const principles = path.join(project, 'docs/01-principles.md');
    expect(fs.existsSync(principles)).toBe(true);
    await expect(buildSite({ ...(await loadConfig(project)), outDir: './docs' }, project)).rejects.toThrow(/outDir[^]*docsDir/);
    expect(fs.existsSync(principles)).toBe(true);
    await expect(buildSite({ ...(await loadConfig(project)), tokensOutDir: './tokens' }, project)).rejects.toThrow(/tokensOutDir[^]*tokensDir/);
    expect(fs.existsSync(path.join(project, 'dist/site/index.html'))).toBe(false);
  });

  it('stops blazon build too', async () => {
    await expect(runBuild(project, './docs')).rejects.toThrow();
    expect(fs.existsSync(path.join(project, 'docs/01-principles.md'))).toBe(true);
  });
});

describe('an output folder that reaches an input another way', () => {
  let project: string;

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  const overlaps = async (over: object, config?: object) =>
    (await compileBlazonData({ ...(await loadConfig(project)), ...over, ...config }, project)).findings.filter((f) => f.code === 'output-dirs-overlap');

  it('holds a token file a resolver names, wherever that file is', async () => {
    fs.mkdirSync(path.join(project, 'extras'));
    fs.copyFileSync(path.join(project, 'tokens/colors.json'), path.join(project, 'extras/base.json'));
    fs.writeFileSync(
      path.join(project, 'blazon.resolver.json'),
      JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/base.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }),
    );
    try {
      const found = await overlaps({ outDir: './extras' });
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/outDir[^]*resolver source[^]*extras\/base\.json/);
      await expect(buildSite({ ...(await loadConfig(project)), outDir: './extras' }, project, { allowErrors: true })).rejects.toThrow(/base\.json/);
      expect(fs.existsSync(path.join(project, 'extras/base.json'))).toBe(true);
      // and a folder that holds none of the sources is fine
      expect(await overlaps({ outDir: './dist/site' })).toEqual([]);
    } finally {
      fs.rmSync(path.join(project, 'blazon.resolver.json'), { force: true });
    }
  });

  it("goes through a symlink to an input: the folder is the input's, whatever it is called", async () => {
    fs.symlinkSync(path.join(project, 'docs'), path.join(project, 'alias'));
    try {
      for (const outDir of ['./alias', './alias/sub']) {
        const found = await overlaps({ outDir });
        expect(found, outDir).toHaveLength(1);
        expect(found[0]!.message, outDir).toContain('docsDir');
      }
      expect(await overlaps({ tokensOutDir: './alias/out' })).toHaveLength(1);
      // a symlink the other way: an input that is a link into the output
      await expect(buildSite({ ...(await loadConfig(project)), outDir: './alias/sub' }, project, { allowErrors: true })).rejects.toThrow(/docsDir/);
      expect(fs.existsSync(path.join(project, 'docs/01-principles.md'))).toBe(true);
    } finally {
      fs.unlinkSync(path.join(project, 'alias'));
    }
  });

  it('goes through a symlink for the project folder too, and a folder that does not exist yet', async () => {
    fs.symlinkSync(project, path.join(project, 'self'));
    try {
      expect(await overlaps({ outDir: './self' })).toHaveLength(1);
      expect(await overlaps({ outDir: './self/not/yet/there' })).toEqual([]);
    } finally {
      fs.unlinkSync(path.join(project, 'self'));
    }
  });

  it("holds an icon set's categories file, a font file, and a folder a build plugin empties", async () => {
    fs.mkdirSync(path.join(project, 'icon-meta'));
    fs.writeFileSync(path.join(project, 'icon-meta/categories.json'), '{}');
    const sets = [{ name: 'lucide', package: 'lucide-static', categories: 'icon-meta/categories.json' }];
    const found = await overlaps({ outDir: './icon-meta' }, { iconSets: sets });
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/categories file of the "lucide" icon set[^]*icon-meta\/categories\.json/);
    await expect(buildSite({ ...(await loadConfig(project)), iconSets: sets, outDir: './icon-meta' } as never, project, { allowErrors: true })).rejects.toThrow(/categories file/);
    expect(fs.existsSync(path.join(project, 'icon-meta/categories.json'))).toBe(true);

    const fonts = [{ family: 'Kinto', file: 'fonts/kinto.woff2' }];
    expect((await overlaps({ outDir: './fonts' }, { fonts }))[0]!.message).toMatch(/font file of Kinto/);

    // A build plugin's folder under tokensOutDir is emptied before the plugin runs, so it may not hold a source
    fs.mkdirSync(path.join(project, 'extras/blazon.favicons'), { recursive: true });
    fs.writeFileSync(path.join(project, 'extras/blazon.favicons/base.json'), '{}');
    fs.writeFileSync(
      path.join(project, 'blazon.resolver.json'),
      JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/blazon.favicons/base.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }),
    );
    try {
      const plugin = await overlaps({ tokensOutDir: './extras' }, { plugins: [{ name: 'blazon.favicons' }] });
      expect(plugin).toHaveLength(1);
      expect(plugin[0]!.message).toMatch(/folder of the plugin blazon\.favicons[^]*resolver source[^]*empties it before the plugin runs/);
    } finally {
      fs.rmSync(path.join(project, 'blazon.resolver.json'), { force: true });
    }
  });

  it("protects the folder of an instance by its id, and not the folder of the plugin's name", async () => {
    // Two instances of one plugin: only the folder `extras/acme.book-b` holds a source, so only that instance is refused
    fs.mkdirSync(path.join(project, 'extras/acme.book-b'), { recursive: true });
    fs.writeFileSync(path.join(project, 'extras/acme.book-b/base.json'), '{}');
    fs.writeFileSync(
      path.join(project, 'blazon.resolver.json'),
      JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/acme.book-b/base.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }),
    );
    try {
      const plugins = [
        { name: 'acme.book', as: 'acme.book-a' },
        { name: 'acme.book', as: 'acme.book-b' },
      ];
      const found = await overlaps({ tokensOutDir: './extras' }, { plugins });
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/folder of the plugin acme\.book-b \("extras\/acme\.book-b"\)[^]*resolver source[^]*empties it before the plugin runs/);
    } finally {
      fs.rmSync(path.join(project, 'blazon.resolver.json'), { force: true });
    }
  });

  it('holds a source that is a link, by the link as well as by the file it points to', async () => {
    fs.mkdirSync(path.join(project, 'extras'), { recursive: true });
    fs.mkdirSync(path.join(project, 'elsewhere'), { recursive: true });
    fs.copyFileSync(path.join(project, 'tokens/colors.json'), path.join(project, 'elsewhere/real.json'));
    fs.symlinkSync(path.join(project, 'elsewhere/real.json'), path.join(project, 'extras/link.json'));
    fs.writeFileSync(
      path.join(project, 'blazon.resolver.json'),
      JSON.stringify({ version: '2025.10', sets: { base: { sources: [{ $ref: 'extras/link.json' }] } }, resolutionOrder: [{ $ref: '#/sets/base' }] }),
    );
    try {
      const found = await overlaps({ outDir: './extras' });
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/resolver source[^]*extras\/link\.json/);
      await expect(buildSite({ ...(await loadConfig(project)), outDir: './extras' }, project, { allowErrors: true })).rejects.toThrow(/link\.json/);
      expect(fs.lstatSync(path.join(project, 'extras/link.json')).isSymbolicLink()).toBe(true);
    } finally {
      fs.rmSync(path.join(project, 'blazon.resolver.json'), { force: true });
      fs.unlinkSync(path.join(project, 'extras/link.json'));
    }
  });

  it('holds an icon package, and says so when a package it read has gone by the time its icons are copied', async () => {
    const pkg = path.join(project, 'node_modules/fake-icons');
    fs.mkdirSync(path.join(pkg, 'icons'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'fake-icons', version: '1.0.0' }));
    fs.writeFileSync(path.join(pkg, 'icons/a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
    const sets = [{ name: 'fake', package: 'fake-icons', dir: 'icons' }];
    try {
      const found = await overlaps({ outDir: './node_modules/fake-icons' }, { iconSets: sets });
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toMatch(/icon package "fake-icons"/);
      await expect(buildSite({ ...(await loadConfig(project)), iconSets: sets, outDir: './node_modules/fake-icons' } as never, project, { allowErrors: true })).rejects.toThrow(
        /icon package/,
      );
      expect(fs.existsSync(path.join(pkg, 'icons/a.svg'))).toBe(true);

      // A package that disappears between reading it and copying from it is an error, not a build with the icons missing
      const config = { ...(await loadConfig(project)), iconSets: sets } as never;
      const data = await compileBlazonData(config, project);
      expect(data.iconSets).toHaveLength(1);
      fs.rmSync(pkg, { recursive: true, force: true });
      await expect(buildSite(config, project, { data, allowErrors: true })).rejects.toThrow(/icon set "fake"[^]*fake-icons/);
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
    }
  });
});
