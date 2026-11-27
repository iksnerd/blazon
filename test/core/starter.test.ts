import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from '../support/spawn';
import { copyStarter, getTemplateDir, starterConfig, starterFiles } from '../../src/core/starter.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { emitTokenOutputs } from '../../src/core/emit.js';
import { contrastRatio, parseColor } from '../../src/core/checker/contrast.js';
import { REPO } from '../support/paths';
import { tempDir } from '../support/project';

// The starter `blazon init` copies is blazon's own brand book, examples/blazon: one copy. From source it is the example itself;
// in the package it is template/, which `npm run build-starter` makes from the example and git does not track.

const EXAMPLE = path.join(REPO, 'examples', 'blazon');
const read = (file: string) => fs.readFileSync(file, 'utf-8');

describe('the one copy', () => {
  it('is examples/blazon when run from source, even with a template/ beside it', () => {
    expect(getTemplateDir()).toBe(EXAMPLE);
  });

  it('is not tracked as a second copy: template/ is git-ignored', () => {
    expect(read(path.join(REPO, '.gitignore'))).toMatch(/^\/template\/$/m);
  });

  it('lists every file of the example and nothing that a build or an install leaves', () => {
    const files = starterFiles();
    expect(files).toContain('blazon.json');
    expect(files).toContain('assets/logos/blazon-graphite.svg');
    expect(files).toContain('docs/01-principles.md');
    expect(files.filter((f) => /(^|\/)(dist|node_modules|\.blazon)\//.test(f))).toEqual([]);
  });
});

describe("the starter's config", () => {
  it('leaves the Chrome-dependent plugins of the example out, so a first build needs no browser', () => {
    const example = JSON.parse(read(path.join(EXAMPLE, 'blazon.json'))) as {
      plugins: { name: string; env?: string[] }[];
      theme: Record<string, string>;
      logo: { onLight: string };
    };
    expect(example.plugins.map((plugin) => plugin.name)).toContain('blazon.social-cards');
    const starter = JSON.parse(starterConfig(read(path.join(EXAMPLE, 'blazon.json')))) as typeof example;
    // The Node-only plugins stay (the word rules, the Tailwind and shadcn/ui files, none with an `env`); the plugins that draw in Chrome or write kits are not listed
    expect(starter.plugins.map((plugin) => plugin.name)).toEqual(['blazon.copy', 'blazon.tailwind', 'blazon.shadcn']);
    for (const plugin of starter.plugins) expect(plugin, plugin.name).not.toHaveProperty('env');
    // everything else is the example's: the theme, the logo, the fonts
    expect(starter.theme).toEqual(example.theme);
    expect(starter.logo).toEqual(example.logo);
  });

  it('is plain JSON, with a final newline', () => {
    const text = starterConfig(read(path.join(EXAMPLE, 'blazon.json')));
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('is unchanged when its plugins are already cut, so the packaged copy can pass through it again', () => {
    const once = starterConfig(read(path.join(EXAMPLE, 'blazon.json')));
    expect(starterConfig(once)).toBe(once);
  });

  it('loads in a new project with the three Node-only plugins, and compiles with no error', async () => {
    const dest = tempDir('blazon-starter-copy-');
    copyStarter(dest);
    const config = await loadConfig(dest);
    expect((config.plugins ?? []).map((plugin) => plugin.name)).toEqual(['blazon.copy', 'blazon.tailwind', 'blazon.shadcn']);
    const data = await compileBlazonData(config, dest);
    expect(data.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('the minimal copy', () => {
  it('is the 11 files the smallest passing brand needs, 12 with the .gitignore init writes', () => {
    const dest = tempDir('blazon-minimal-');
    const { written } = copyStarter(dest, getTemplateDir(), { minimal: true });
    expect(written.map((f) => path.relative(dest, f).split(path.sep).join('/')).sort()).toEqual([
      'assets/logos/blazon-bone.json',
      'assets/logos/blazon-bone.svg',
      'assets/logos/blazon-graphite.json',
      'assets/logos/blazon-graphite.svg',
      'assets/logos/blazon-mark.json',
      'assets/logos/blazon-mark.svg',
      'blazon.json',
      'tokens/colors.json',
      'tokens/form.json',
      'tokens/spacing.json',
      'tokens/typography.json',
    ]);
  });

  it('has an empty sections list, no fonts, no resolver, and keeps the three Node-only plugins', () => {
    const config = JSON.parse(starterConfig(read(path.join(EXAMPLE, 'blazon.json')), { minimal: true })) as Record<string, unknown> & { plugins: { name: string }[] };
    expect(config.sections).toEqual([]);
    expect(config).not.toHaveProperty('fonts');
    expect(config).not.toHaveProperty('customSections');
    expect(config).not.toHaveProperty('resolver');
    expect(config.plugins.map((p) => p.name)).toEqual(['blazon.copy', 'blazon.tailwind', 'blazon.shadcn']);
  });

  it('compiles with no error and no finding but the starter notes and logo warnings, and its plugins write their files', async () => {
    const dest = tempDir('blazon-minimal-');
    copyStarter(dest, getTemplateDir(), { minimal: true });
    const config = await loadConfig(dest);
    const data = await compileBlazonData(config, dest);
    expect(data.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(data.findings.some((f) => f.code === 'theme-unresolved')).toBe(false);
  });

  it('takes any filter, and leaves the config as the full starter has it when none says minimal', () => {
    const dest = tempDir('blazon-filter-');
    const { written } = copyStarter(dest, getTemplateDir(), { filter: (rel) => rel === 'blazon.json' });
    expect(written).toHaveLength(1);
    expect(JSON.parse(read(path.join(dest, 'blazon.json'))).sections.length).toBeGreaterThan(0);
  });
});

describe("the starter's depth", () => {
  // The Form and motion page: every shadow is a hard Graphite offset, and a key's travel is the plate's offset less the shim's.
  type Shadow = { color: string; inset?: boolean; offsetX: { value: number }; offsetY: { value: number }; blur: { value: number }; spread: { value: number } };
  const shadows = (JSON.parse(read(path.join(EXAMPLE, 'tokens', 'form.json'))) as { shadow: Record<string, { $value: Shadow }> }).shadow;
  const named = Object.entries(shadows).filter(([name]) => !name.startsWith('$'));

  it('is plate, shim and recess, each unblurred Graphite, and the Form and motion page names each', () => {
    expect(named.map(([name]) => name)).toEqual(['plate', 'shim', 'recess']);
    const page = read(path.join(EXAMPLE, 'docs', '05-form.md'));
    for (const [name, { $value }] of named) {
      expect([$value.color, $value.blur.value, $value.spread.value], name).toEqual(['{color.ink.graphite}', 0, 0]);
      expect(page).toContain(`\`shadow.${name}\``);
    }
    expect(shadows.recess!.$value.inset).toBe(true);
  });

  it('leaves a key room to travel: the shim is shallower than the plate on both axes', () => {
    const { plate, shim } = shadows as Record<'plate' | 'shim', { $value: Shadow }>;
    expect(shim.$value.offsetX.value).toBeLessThan(plate.$value.offsetX.value);
    expect(shim.$value.offsetY.value).toBeLessThan(plate.$value.offsetY.value);
  });
});

describe("the starter's dark theme", () => {
  type Shadow = { color: string; inset?: boolean; offsetX: { value: number }; offsetY: { value: number }; blur: { value: number }; spread: { value: number } };
  const resolver = JSON.parse(read(path.join(EXAMPLE, 'blazon.resolver.json'))) as {
    sets: { base: { sources: { $ref: string }[] } };
    modifiers: { theme: { contexts: Record<string, { $ref: string }[]>; default: string } };
  };
  const dark = JSON.parse(read(path.join(EXAMPLE, 'tokens', 'theme', 'dark.json'))) as { shadow: Record<string, { $value: Shadow }>; rule: Record<string, { $value: string }> };
  const light = (JSON.parse(read(path.join(EXAMPLE, 'tokens', 'form.json'))) as { shadow: Record<string, { $value: Shadow }> }).shadow;

  // A copy, so nothing is built in examples/
  const compiled = async (edit?: (root: string) => void) => {
    const root = tempDir('blazon-starter-dark-');
    copyStarter(root);
    edit?.(root);
    const config = await loadConfig(root);
    return { root, config, data: await compileBlazonData(config, root) };
  };

  it('is a theme modifier, light by default, and the resolver loads every other token file', () => {
    expect(resolver.modifiers.theme.default).toBe('light');
    expect(resolver.modifiers.theme.contexts).toEqual({ light: [], dark: [{ $ref: 'tokens/theme/dark.json' }] });
    // With a resolver, blazon reads only the files it names: a token file left out of the set would silently not load
    const tokenFiles = fs
      .readdirSync(path.join(EXAMPLE, 'tokens'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => `tokens/${f}`);
    expect(resolver.sets.base.sources.map((source) => source.$ref).sort()).toEqual(tokenFiles.sort());
  });

  it('draws the same three shadows in dark, unblurred, at the same offsets, the plate and the shim in the darkest ink, the recess in a color that reaches 3:1 on both dark surfaces', async () => {
    expect(Object.keys(dark.shadow)).toEqual(['plate', 'shim', 'recess']);
    for (const name of ['plate', 'shim', 'recess']) {
      const { color, ...shape } = dark.shadow[name]!.$value;
      const { color: _lightColor, ...lightShape } = light[name]!.$value;
      expect(shape, name).toEqual(lightShape);
      expect(color, name).not.toBe('{color.ink.graphite}');
    }
    // Measured on the values the dark block of theme.css gives each variable
    const { root, config, data } = await compiled();
    const css = read((await emitTokenOutputs(data, config, root)).cssPath);
    const block = /\[data-theme="dark"\] \{([^}]*)\}/.exec(css)![1]!;
    const value = (name: string) => parseColor(new RegExp(`--${name}: (#[0-9A-Fa-f]{6});`).exec(block)![1]!)!;
    // A raised plate's shadow is darker than the page it falls on (Carbon on Graphite), not a light edge
    for (const shadow of ['shadow-plate-color', 'shadow-shim-color']) {
      expect(dark.shadow[shadow.split('-')[1]!]!.$value.color, shadow).toBe('{color.base.carbon}');
      expect(contrastRatio(value('surface-background'), value(shadow)), shadow).toBeGreaterThan(1);
    }
    for (const surface of ['surface-background', 'surface-canvas']) {
      expect(contrastRatio(value('shadow-recess-color'), value(surface)), `shadow-recess-color on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws the dark rule in Zinc, 3:1 on both dark surfaces, and the hairline in the quieter Steel', async () => {
    expect(dark.rule.default!.$value).toBe('{color.ink.zinc}');
    expect(dark.rule.quiet!.$value).toBe('{color.ink.steel}');
    const { root, config, data } = await compiled();
    const css = read((await emitTokenOutputs(data, config, root)).cssPath);
    const block = /\[data-theme="dark"\] \{([^}]*)\}/.exec(css)![1]!;
    const value = (name: string) => parseColor(new RegExp(`--${name}: (#[0-9A-Fa-f]{6});`).exec(block)![1]!)!;
    for (const surface of ['surface-background', 'surface-canvas']) {
      expect(contrastRatio(value('rule-default'), value(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the primary key an edge that reaches 3:1 on its orange fill in both themes, where dark's Zinc rule does not", async () => {
    const { root, config, data } = await compiled();
    const css = read((await emitTokenOutputs(data, config, root)).cssPath);
    const [lightBlock, darkRest] = css.split('[data-theme="dark"]') as [string, string];
    const darkBlock = /\{([^}]*)\}/.exec(darkRest)![1]!;
    // A variable the dark block leaves out keeps its :root value
    const value = (name: string, ...blocks: string[]) => {
      for (const block of blocks) {
        const hit = new RegExp(`--${name}: (#[0-9A-Fa-f]{6});`).exec(block);
        if (hit) return parseColor(hit[1]!)!;
      }
      throw new Error(`no --${name}`);
    };
    for (const [theme, blocks] of [
      ['light', [lightBlock]],
      ['dark', [darkBlock, lightBlock]],
    ] as const) {
      expect(contrastRatio(value('border-on-signal-color', ...blocks), value('interactive-primary', ...blocks)), theme).toBeGreaterThanOrEqual(3);
    }
    // Why it is its own token: the structural rule is Zinc in dark, 1.03:1 on Signal Orange
    expect(contrastRatio(value('rule-default', darkBlock), value('interactive-primary', darkBlock, lightBlock))).toBeLessThan(3);
  });

  it('compiles to a [data-theme="dark"] block in theme.css that carries the overrides', async () => {
    const { root, config, data } = await compiled();
    const { cssPath } = await emitTokenOutputs(data, config, root);
    const css = read(cssPath);
    const block = /\[data-theme="dark"\] \{([^}]*)\}/.exec(css)?.[1];
    expect(block).toBeDefined();
    expect(block).toContain('--surface-background: #1E1F21;');
    expect(block).toContain('--surface-canvas: #101113;');
    expect(block).toContain('--surface-inverse: #F2F0EB;');
    expect(block).toContain('--text-primary: #F2F0EB;');
    expect(block).toContain('--text-muted: #8C9096;');
    expect(block).toContain('--shadow-plate-color: #101113;');
    // The signal and the ink on it are the same in both themes, so the block leaves them to :root
    expect(block).not.toContain('--interactive-primary:');
    expect(block).not.toContain('--text-on-signal:');
  });

  it('passes blazon check in the dark context: no error and no warning tagged with it', async () => {
    const { data } = await compiled();
    expect(data.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(data.findings.filter((f) => f.context === 'theme=dark')).toEqual([]);
  });

  it('fails blazon check when the dark context makes Signal Orange text, though it measures AA on Graphite', async () => {
    const { data } = await compiled((root) => {
      const file = path.join(root, 'tokens', 'theme', 'dark.json');
      const tokens = JSON.parse(read(file)) as { text: Record<string, { $value: string }> };
      tokens.text.muted = { $value: '{color.signal.orange}' };
      fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
    });
    const errors = data.findings.filter((f) => f.severity === 'error');
    expect(errors.map((f) => [f.code, f.path, f.context])).toEqual([['usage-violated', 'text.muted', 'theme=dark']]);
  });
});

describe('copying', () => {
  it('writes every file but the config as the example has it, and keeps a file that is already there', () => {
    const dest = tempDir('blazon-starter-copy-');
    fs.mkdirSync(path.join(dest, 'tokens'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'tokens/colors.json'), '{}\n');
    const { written, kept } = copyStarter(dest);
    expect(kept).toEqual([path.join(dest, 'tokens/colors.json')]);
    expect(read(path.join(dest, 'tokens/colors.json'))).toBe('{}\n');
    expect(written.length).toBe(starterFiles().length - 1);
    for (const rel of starterFiles()) {
      if (rel === 'blazon.json' || rel === 'tokens/colors.json') continue;
      expect(fs.readFileSync(path.join(dest, rel)).equals(fs.readFileSync(path.join(EXAMPLE, rel))), rel).toBe(true);
    }
  });
});

describe("blazon's package", () => {
  const TEMPLATE = path.join(REPO, 'template');
  let existed = false;

  beforeAll(() => {
    existed = fs.existsSync(TEMPLATE);
    const run = spawnSync(path.join(REPO, 'node_modules/.bin/tsx'), [path.join(REPO, 'scripts/build-starter.ts')], { cwd: REPO, encoding: 'utf-8' });
    expect(run.status, run.stderr).toBe(0);
  }, 60_000);

  afterAll(() => {
    if (!existed) fs.rmSync(TEMPLATE, { recursive: true, force: true });
  });

  it('gets template/ from the example: the same files, the same bytes, the config without the plugins', () => {
    expect(starterFiles(TEMPLATE)).toEqual(starterFiles(EXAMPLE));
    for (const rel of starterFiles(EXAMPLE)) {
      if (rel === 'blazon.json') continue;
      expect(fs.readFileSync(path.join(TEMPLATE, rel)).equals(fs.readFileSync(path.join(EXAMPLE, rel))), rel).toBe(true);
    }
    expect(read(path.join(TEMPLATE, 'blazon.json'))).toBe(starterConfig(read(path.join(EXAMPLE, 'blazon.json'))));
  });

  it('packs the starter: every file of it is in `npm pack`, and the examples are not', () => {
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO, encoding: 'utf-8' })) as { files: { path: string }[] }[];
    const packed = pack!.files.map((file) => file.path);
    for (const rel of starterFiles(EXAMPLE)) expect(packed, rel).toContain(`template/${rel}`);
    expect(packed.filter((f) => f.startsWith('examples/'))).toEqual([]);
  }, 60_000);

  it('runs build-starter before every pack', () => {
    const scripts = JSON.parse(read(path.join(REPO, 'package.json'))).scripts;
    expect(scripts.prepack).toMatch(/build-starter/);
  });
});
