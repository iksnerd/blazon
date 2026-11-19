import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import type { BlazonConfig } from '../../src/types/index.js';
import { formatBrandJson } from '../../src/core/brand/export.js';
import { fontFaceCss } from '../../src/core/read/index.js';
import { writeProject } from '../support/helpers.js';

// `fonts` takes stylesheet URLs and, since a font file is what a brand has, the file itself: blazon embeds it so the book and
// its PDF do not depend on a stylesheet made by hand. `blazon check` says when a family a token names is loaded by nothing.

const FONT_BYTES = 'wOF2-not-really-a-font';
const tokens = (family: string[], extra: Record<string, unknown> = {}) => ({ font: { $type: 'fontFamily', brand: { $value: family, ...extra } } });

const compile = (files: Record<string, unknown>, fonts?: BlazonConfig['fonts']) => {
  const root = writeProject({ 'tokens/a.json': tokens(['Mulish', 'sans-serif']), 'fonts/Mulish.woff2': FONT_BYTES, ...files });
  return compileBlazonData({ ...DEFAULT_CONFIG, ...(fonts && { fonts }) }, root);
};

const codes = (findings: { code: string }[]) => findings.map((f) => f.code).filter((code) => code.startsWith('font-'));
const INTER = 'https://fonts.googleapis.com/css2?family=Inter&display=swap';
const css = (stylesheet: string) => Buffer.from(stylesheet.replace('data:text/css;base64,', ''), 'base64').toString('utf-8');

describe('a font file in the config', () => {
  it('is embedded as an @font-face stylesheet next to the URLs, in the order given', async () => {
    const data = await compile({}, ['https://fonts.example/a.css', { family: 'Mulish', file: 'fonts/Mulish.woff2', weight: '200 1000', style: 'normal' }]);

    expect(data.fonts[0]).toBe('https://fonts.example/a.css');
    expect(data.fonts).toHaveLength(2);
    expect(data.fonts[1]).toMatch(/^data:text\/css;base64,/);
    const face = css(data.fonts[1]!);
    expect(face).toContain('font-family:"Mulish"');
    expect(face).toContain(`url(data:font/woff2;base64,${Buffer.from(FONT_BYTES).toString('base64')}) format("woff2")`);
    expect(face).toContain('font-weight:200 1000');
    expect(face).toContain('font-style:normal');
  });

  it('names the format by the extension, and leaves the weight and style out when none is given', async () => {
    const data = await compile({ 'fonts/Mulish.ttf': FONT_BYTES }, [{ family: 'Mulish', file: 'fonts/Mulish.ttf' }]);

    expect(css(data.fonts[0]!)).toMatch(/^@font-face\{font-family:"Mulish";src:url\(data:font\/ttf;base64,[^)]+\) format\("truetype"\)\}$/);
  });

  it('counts as loading the family, so check has nothing to say', async () => {
    const data = await compile({}, [{ family: 'mulish', file: 'fonts/Mulish.woff2' }]);

    expect(codes(data.findings)).toEqual([]);
  });

  it.each([
    ['is missing', { family: 'Mulish', file: 'fonts/Nope.woff2' }, 'is not a file in the project'],
    ['is a folder', { family: 'Mulish', file: 'fonts' }, 'is not a font blazon embeds'],
    ['is not a font', { family: 'Mulish', file: 'tokens/a.json' }, 'is not a font blazon embeds: give .woff2, .woff, .ttf, .otf'],
  ])('is an error when the file %s, and is left out', async (_name, entry, why) => {
    const data = await compile({}, [entry]);

    expect(data.fonts).toEqual([]);
    expect(data.findings.filter((f) => f.code === 'font-file-invalid')).toEqual([
      expect.objectContaining({ severity: 'error', path: entry.file, message: expect.stringContaining(why) }),
    ]);
  });

  it('stays inside the project: a path that climbs out, an absolute path and a link to outside are errors, and nothing is embedded', async () => {
    const outside = path.join(writeProject({ 'Secret.woff2': FONT_BYTES }), 'Secret.woff2');
    const root = writeProject({ 'tokens/a.json': tokens(['Mulish', 'sans-serif']), 'fonts/Mulish.woff2': FONT_BYTES });
    fs.symlinkSync(outside, path.join(root, 'fonts/Linked.woff2'));
    const entries = [
      { family: 'Mulish', file: `../${path.basename(path.dirname(outside))}/Secret.woff2` },
      { family: 'Mulish', file: outside },
      { family: 'Mulish', file: 'fonts/Linked.woff2' },
    ];
    const data = await compileBlazonData({ ...DEFAULT_CONFIG, fonts: entries }, root);

    expect(data.fonts).toEqual([]);
    expect(data.findings.filter((f) => f.code === 'font-file-invalid').map((f) => f.path)).toEqual(entries.map((e) => e.file));
    for (const f of data.findings.filter((x) => x.code === 'font-file-invalid')) expect(f.message).toContain('is outside the project folder');
  });

  it('is refused by the config check when an entry is not a URL or {family, file}', async () => {
    const bad: unknown[] = [
      { family: 'Mulish' },
      { family: 'Mu"lish', file: 'a.woff2' },
      { family: 'Mulish', file: 'a.woff2', weight: true },
      { family: 'Mulish', file: 'a.woff2', weight: '400;}body{display:none' },
      { family: 'Mulish', file: 'a.woff2', weight: 'heavy' },
      { family: 'Mulish', file: 'a.woff2', weight: 0 },
      { family: 'Mulish', file: 'a.woff2', src: 'x' },
      { family: 'Mulish', file: 'a.woff2', style: 'oblique' },
    ];
    const data = await compile({}, [{ family: 'Mulish', file: 'fonts/Mulish.woff2' }, ...bad] as BlazonConfig['fonts']);

    expect(data.findings.filter((f) => f.code === 'config-invalid').map((f) => f.path)).toEqual(bad.map((_, i) => `fonts[${i + 1}]`));
    expect(data.fonts).toHaveLength(1);
  });
});

describe('the license file beside a font file', () => {
  const OFL = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.\n';
  const licenses = async (files: Record<string, unknown>, fonts: BlazonConfig['fonts'] = [{ family: 'Mulish', file: 'fonts/Mulish.woff2' }]) => {
    const data = await compile(files, fonts);
    return { data, found: data.fontLicenses ?? [], skipped: data.findings.filter((f) => f.code === 'font-license-invalid') };
  };

  it('is read as text and kept with the family and its project-relative path', async () => {
    const { found, skipped } = await licenses({ 'fonts/OFL.txt': OFL });
    expect(found).toEqual([{ family: 'Mulish', licenseFile: 'fonts/OFL.txt', licenseText: OFL }]);
    expect(skipped).toEqual([]);
  });

  it('is found by name whatever the case, OFL first, then LICENSE, LICENCE and COPYING', async () => {
    expect((await licenses({ 'fonts/license.TXT': 'b', 'fonts/COPYING': 'c' })).found[0]?.licenseFile).toBe('fonts/license.TXT');
    expect((await licenses({ 'fonts/Licence-Mulish.md': 'b', 'fonts/copying': 'c' })).found[0]?.licenseFile).toBe('fonts/Licence-Mulish.md');
    expect((await licenses({ 'fonts/LICENSE': 'b', 'fonts/ofl.txt': OFL })).found[0]?.licenseFile).toBe('fonts/ofl.txt');
  });

  it('is looked for in the font file own folder only, never in a parent, and not as a folder', async () => {
    expect((await licenses({ 'OFL.txt': OFL, 'LICENSE/readme': 'x' })).found).toEqual([]);
  });

  it('is not read when it is over 64 KiB, and a finding says so', async () => {
    const { found, skipped } = await licenses({ 'fonts/OFL.txt': 'x'.repeat(65 * 1024) });
    expect(found).toEqual([]);
    expect(skipped).toEqual([expect.objectContaining({ severity: 'warning', path: 'fonts/OFL.txt', message: expect.stringContaining('64 KiB') })]);
  });

  it('is not kept when it is not UTF-8 text, and a finding says so', async () => {
    const root = writeProject({ 'tokens/a.json': tokens(['Mulish', 'sans-serif']), 'fonts/Mulish.woff2': FONT_BYTES });
    fs.writeFileSync(path.join(root, 'fonts/OFL.txt'), Buffer.from([0xff, 0xfe, 0x41, 0x00, 0xc3, 0x28]));
    const data = await compileBlazonData({ ...DEFAULT_CONFIG, fonts: [{ family: 'Mulish', file: 'fonts/Mulish.woff2' }] }, root);
    expect(data.fontLicenses ?? []).toEqual([]);
    expect(data.findings.filter((f) => f.code === 'font-license-invalid')).toEqual([expect.objectContaining({ path: 'fonts/OFL.txt', message: expect.stringContaining('UTF-8') })]);
  });

  it('is not read through a link that leaves the project', async () => {
    const outside = path.join(writeProject({ 'OFL.txt': OFL }), 'OFL.txt');
    const root = writeProject({ 'tokens/a.json': tokens(['Mulish', 'sans-serif']), 'fonts/Mulish.woff2': FONT_BYTES });
    fs.symlinkSync(outside, path.join(root, 'fonts/OFL.txt'));
    const data = await compileBlazonData({ ...DEFAULT_CONFIG, fonts: [{ family: 'Mulish', file: 'fonts/Mulish.woff2' }] }, root);
    expect(data.fontLicenses ?? []).toEqual([]);
    expect(data.findings.filter((f) => f.code === 'font-license-invalid')).toEqual([expect.objectContaining({ message: expect.stringContaining('outside the project folder') })]);
  });

  it('is kept once for a family whose files share a folder, and the file is a project input', async () => {
    const { found } = await licenses({ 'fonts/OFL.txt': OFL, 'fonts/Mulish-Bold.woff2': FONT_BYTES }, [
      { family: 'Mulish', file: 'fonts/Mulish.woff2' },
      { family: 'Mulish', file: 'fonts/Mulish-Bold.woff2', weight: 700 },
    ]);
    expect(found).toHaveLength(1);
  });

  it('is carried by brand.json as theme.fontLicenses, and left out when there is none', async () => {
    const root = writeProject({ 'tokens/a.json': tokens(['Mulish', 'sans-serif']), 'fonts/Mulish.woff2': FONT_BYTES, 'fonts/OFL.txt': OFL });
    const config = { ...DEFAULT_CONFIG, fonts: [{ family: 'Mulish', file: 'fonts/Mulish.woff2' }] };
    const brand = JSON.parse(formatBrandJson(await compileBlazonData(config, root), config, root));
    expect(brand.theme.fontLicenses).toEqual([{ family: 'Mulish', licenseFile: 'fonts/OFL.txt', licenseText: OFL }]);
    const none = JSON.parse(formatBrandJson(await compileBlazonData({ ...DEFAULT_CONFIG }, root), { ...DEFAULT_CONFIG }, root));
    expect('fontLicenses' in none.theme).toBe(false);
  });
});

describe('check on a family that nothing loads', () => {
  it('warns once on the token that names it first, and says what to add', async () => {
    const data = await compile(
      { 'tokens/a.json': { ...tokens(['Mulish', 'sans-serif']), type: { $type: 'typography', body: { $value: { fontFamily: ['Mulish'], fontSize: '16px' } } } } },
      [INTER],
    );

    expect(data.findings.filter((f) => f.code === 'font-family-missing')).toEqual([
      expect.objectContaining({ severity: 'warning', path: 'font.brand', message: expect.stringContaining('{"family": "Mulish", "file": path}') }),
    ]);
  });

  it('says nothing when the config lists no fonts, because the project has not asked for any to be loaded', async () => {
    expect(codes((await compile({})).findings)).toEqual([]);
  });

  it('reads a Google Fonts URL for the families it loads, and a URL it cannot read as loading anything', async () => {
    const google = await compile({}, ['https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Mulish:wght@400;700&display=swap']);
    expect(codes(google.findings)).toEqual([]);

    const other = await compile({}, [INTER]);
    expect(codes(other.findings)).toEqual(['font-family-missing']);

    const selfHosted = await compile({}, ['https://brand.example/fonts.css']);
    expect(codes(selfHosted.findings)).toEqual([]);
  });

  it('leaves system families, generic names and a token with `webFont` alone', async () => {
    const system = await compile({ 'tokens/a.json': tokens(['-apple-system', 'Segoe UI', 'sans-serif']) }, [INTER]);
    expect(codes(system.findings)).toEqual([]);

    const said = await compile({ 'tokens/a.json': tokens(['Mulish', 'sans-serif'], { $extensions: { 'dev.blazon': { webFont: false } } }) }, [INTER]);
    expect(codes(said.findings)).toEqual([]);
  });

  it('is quiet about the shipped examples and the starter that load what they name', async () => {
    const { loadConfig } = await import('../../src/core/config/index.js');
    const { ROOT } = await import('../support/spec-helpers.js');
    const { starterProject } = await import('../support/project.js');
    const { hasReference, referencePath } = await import('../support/reference.js');
    const reference = hasReference('examples/slack') ? [referencePath('examples/slack')] : [];
    for (const dir of ['examples/blazon', ...reference, await starterProject()]) {
      const root = path.resolve(ROOT, dir);
      expect(codes((await compileBlazonData(await loadConfig(root), root)).findings), dir).toEqual([]);
    }
  });
});

describe('fontFaceCss, the rules blazon fonts --css prints', () => {
  const files = [
    { family: 'Mulish', file: 'fonts/Mulish.woff2', weight: '200 1000' },
    { family: 'Mulish', file: 'fonts/Mulish-Italic.ttf', weight: 400, style: 'italic' as const },
    { family: 'Plain', file: 'fonts/Plain.otf' },
  ];

  it('writes a rule a file, with its format from the extension, the weight and style when the entry has them, and swap', () => {
    const out = fontFaceCss({ stylesheets: [], files });
    expect(out).toContain('@font-face {\n  font-family: "Mulish";\n  src: url("fonts/Mulish.woff2") format("woff2");\n  font-weight: 200 1000;\n  font-display: swap;\n}');
    expect(out).toContain('src: url("fonts/Mulish-Italic.ttf") format("truetype");\n  font-weight: 400;\n  font-style: italic;');
    expect(out).toContain('font-family: "Plain";\n  src: url("fonts/Plain.otf") format("opentype");\n  font-display: swap;');
  });

  it('puts the base in front of the file name, with or without a closing slash', () => {
    expect(fontFaceCss({ stylesheets: [], files }, '/fonts/')).toContain('url("/fonts/Mulish.woff2")');
    expect(fontFaceCss({ stylesheets: [], files }, 'https://cdn.example/f')).toContain('url("https://cdn.example/f/Plain.otf")');
  });

  it('makes no rule for a stylesheet, only a comment with its address', () => {
    const out = fontFaceCss({ stylesheets: [INTER], files: [] });
    expect(out).toBe(`/* Stylesheet, not fetched by blazon: ${INTER} */\n`);
    expect(out).not.toContain('@font-face');
  });

  it('says so when the config lists nothing, and comments a file that is not a font', () => {
    expect(fontFaceCss({ stylesheets: [], files: [] })).toBe('/* The config lists no fonts. */\n');
    expect(fontFaceCss({ stylesheets: [], files: [{ family: 'X', file: 'fonts/x.txt' }] })).toBe('/* fonts/x.txt: not a font file blazon embeds, so no rule */\n');
  });
});
