import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import type { IconSetConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// Icon sets read from an installed package (RFC 0001 §9). The packages here are tiny fakes shaped like
// the real ones: lucide-static (icons/), @tabler/icons (icons/outline + icons.json), @mdi/svg (svg/ + meta.json).

const SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>';

const project = (): string => tempDir();

function install(root: string, name: string, files: Record<string, string>, meta: Record<string, unknown> = { version: '1.2.3', license: 'ISC' }): void {
  const pkg = path.join(root, 'node_modules', name);
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name, ...meta }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
    fs.writeFileSync(path.join(pkg, file), content);
  }
}

const compile = (root: string, iconSets: IconSetConfig[]) => compileBlazonData({ ...DEFAULT_CONFIG, iconSets }, root);
const lucide = () => ({ 'icons/arrow-left.svg': SVG, 'icons/home.svg': SVG, 'icons/plus.svg': SVG });

describe('icon sets', () => {
  it('list the package icons, with its version and license', async () => {
    const root = project();
    install(root, 'lucide-static', lucide());
    const data = await compile(root, [{ name: 'lucide', package: 'lucide-static' }]);
    expect(data.findings.filter((f) => f.code.startsWith('icon-set'))).toEqual([]);
    expect(data.iconSets).toEqual([
      { name: 'lucide', package: 'lucide-static', version: '1.2.3', license: 'ISC', count: 3, categories: [{ name: 'Other', icons: ['arrow-left', 'home', 'plus'] }] },
    ]);
  });

  it('group by the brand map, put the rest under Other, and warn about an icon the package lacks', async () => {
    const root = project();
    install(root, 'lucide-static', lucide());
    const data = await compile(root, [{ name: 'lucide', package: 'lucide-static', categories: { Navigation: ['arrow-left', 'home', 'nope'] } }]);
    expect(data.iconSets[0]!.categories).toEqual([
      { name: 'Navigation', icons: ['arrow-left', 'home'] },
      { name: 'Other', icons: ['plus'] },
    ]);
    expect(data.findings.filter((f) => f.code === 'icon-unknown')).toMatchObject([{ severity: 'warning', path: 'lucide', message: expect.stringMatching(/"nope".*Navigation/) }]);
  });

  it('read the brand map from a JSON file in the project', async () => {
    const root = project();
    install(root, 'lucide-static', lucide());
    fs.writeFileSync(path.join(root, 'lucide.categories.json'), JSON.stringify({ Actions: ['plus'] }));
    const data = await compile(root, [{ name: 'lucide', package: 'lucide-static', categories: './lucide.categories.json' }]);
    expect(data.iconSets[0]!.categories).toEqual([
      { name: 'Actions', icons: ['plus'] },
      { name: 'Other', icons: ['arrow-left', 'home'] },
    ]);
  });

  it('take Tabler categories from icons.json and read icons/outline', async () => {
    const root = project();
    install(root, '@tabler/icons', {
      'icons/outline/a-b.svg': SVG,
      'icons/outline/home.svg': SVG,
      'icons/filled/home.svg': SVG,
      'icons.json': JSON.stringify({ 'a-b': { name: 'a-b', category: 'Text' }, home: { name: 'home', category: 'Buildings' } }),
    });
    const data = await compile(root, [{ name: 'tabler', package: '@tabler/icons' }]);
    expect(data.iconSets[0]!.count).toBe(2);
    expect(data.iconSets[0]!.categories).toEqual([
      { name: 'Buildings', icons: ['home'] },
      { name: 'Text', icons: ['a-b'] },
    ]);
  });

  it('take MDI categories from the first tag in meta.json and read svg/', async () => {
    const root = project();
    install(root, '@mdi/svg', {
      'svg/abacus.svg': SVG,
      'svg/ab-testing.svg': SVG,
      'svg/untagged.svg': SVG,
      'meta.json': JSON.stringify([
        { name: 'abacus', tags: ['Education'] },
        { name: 'ab-testing', tags: ['Developer / Languages', 'Other tag'] },
        { name: 'untagged', tags: [] },
      ]),
    });
    const data = await compile(root, [{ name: 'mdi', package: '@mdi/svg' }]);
    expect(data.iconSets[0]!.categories).toEqual([
      { name: 'Developer / Languages', icons: ['ab-testing'] },
      { name: 'Education', icons: ['abacus'] },
      { name: 'Other', icons: ['untagged'] },
    ]);
  });

  it('let the brand map win over package metadata, and take dir for any other package', async () => {
    const root = project();
    install(root, 'phosphor', { 'regular/acorn.svg': SVG, 'regular/bell.svg': SVG });
    const data = await compile(root, [{ name: 'phosphor', package: 'phosphor', dir: 'regular', categories: { Nature: ['acorn'] } }]);
    expect(data.iconSets[0]!.categories).toEqual([
      { name: 'Nature', icons: ['acorn'] },
      { name: 'Other', icons: ['bell'] },
    ]);
  });

  it.each([
    ['a package that is not installed', [{ name: 'x', package: 'not-installed' }], /package "not-installed" is not installed/],
    ['a dir the package lacks', [{ name: 'x', package: 'lucide-static', dir: 'nope' }], /no directory "nope"/],
    ['a dir that leaves the package', [{ name: 'x', package: 'lucide-static', dir: '../..' }], /outside the package/],
    ['an unknown package with no dir', [{ name: 'x', package: 'other-icons' }], /needs dir/],
    ['a name that is not URL-safe', [{ name: 'My Set', package: 'lucide-static' }], /name must be lowercase/],
    [
      'a duplicate name',
      [
        { name: 'a', package: 'lucide-static' },
        { name: 'a', package: 'lucide-static' },
      ],
      /used twice/,
    ],
    ['a categories file that is not valid JSON', [{ name: 'x', package: 'lucide-static', categories: './bad.json' }], /categories .*not valid JSON/],
    ['a categories file outside the project', [{ name: 'x', package: 'lucide-static', categories: '../escape.json' }], /categories .*outside the project/],
  ])('report %s as an error and skip the set', async (_, sets, message) => {
    const root = project();
    install(root, 'lucide-static', lucide());
    install(root, 'other-icons', { 'x/a.svg': SVG });
    fs.writeFileSync(path.join(root, 'bad.json'), '{ nope');
    const data = await compile(root, sets as IconSetConfig[]);
    const errors = data.findings.filter((f) => f.code === 'icon-set-invalid');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({ severity: 'error' });
    expect(errors[0]!.message).toMatch(message);
    expect(data.iconSets.map((s) => s.name)).not.toContain('x');
  });

  it('leave out an SVG that links outside the package', async () => {
    const root = project();
    install(root, 'lucide-static', lucide());
    fs.writeFileSync(path.join(root, 'secret.svg'), SVG);
    fs.symlinkSync(path.join(root, 'secret.svg'), path.join(root, 'node_modules/lucide-static/icons/escape.svg'));
    const data = await compile(root, [{ name: 'lucide', package: 'lucide-static' }]);
    expect(data.iconSets[0]!.count).toBe(3);
    expect(data.iconSets[0]!.categories.flatMap((c) => c.icons)).not.toContain('escape');
  });

  it.each(['../outside', '../../outside', '/tmp/outside', '@scope/../../outside', 'a/b/c', 'Upper'])(
    'refuses the package "%s", which is a path and not a package name',
    async (name) => {
      const root = project();
      // `../outside` from node_modules/ is a folder of the project itself, `../../outside` one beside it; both hold an SVG
      fs.mkdirSync(path.join(root, 'outside'));
      fs.writeFileSync(path.join(root, 'outside', 'leak.svg'), SVG);
      const data = await compile(root, [{ name: 'evil', package: name, dir: '.' }]);
      expect(data.iconSets).toEqual([]);
      expect(data.findings.filter((f) => f.code === 'icon-set-invalid')).toMatchObject([{ path: 'evil', message: expect.stringMatching(/not a package name/) }]);
    },
  );

  it('is empty, with no findings, when the config names none', async () => {
    const data = await compileBlazonData({ ...DEFAULT_CONFIG }, project());
    expect(data.iconSets).toEqual([]);
    expect(data.findings.filter((f) => f.code.startsWith('icon-set'))).toEqual([]);
  });
});
