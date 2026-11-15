import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { BRAND_SCHEMA } from '../../../src/core/brand/schema.js';
import { STANDARD_LOGO_LOCKUPS, STANDARD_SECTION_IDS, STANDARD_USAGE_ROLES } from '../../../src/types/index.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// Brand vocabulary (RFC 0002 §1): a brand adds sections, logo lockups and usage roles as data, next to the standard
// ones. Blazon keeps checking spellings, because the declared lists are the vocabulary.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(25)]);

function project(files: Record<string, Buffer | string> = {}): string {
  const root = tempDir();
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

const page = (section?: string) => `---\n${section === undefined ? '' : `section: ${section}\n`}---\n\n# Page\n\nText.\n`;
const compile = (root: string, config: Record<string, unknown> = {}) => compileBlazonData({ ...DEFAULT_CONFIG, ...config } as BlazonConfig, root);
const invalid = async (config: Record<string, unknown>) => (await compile(project(), config)).findings.filter((f) => f.code === 'config-invalid');

const STANDARD_TITLES = [
  'Introduction',
  'Logo',
  'Color',
  'Typography',
  'Icons',
  'Illustration',
  'Photography',
  'Patterns',
  '3D graphics',
  'Diagrams',
  'Motion',
  'Layout',
  'Social',
  'Applications',
];

describe('the standard names', () => {
  it('are the lists the code had before, now under STANDARD_ names', () => {
    expect([...STANDARD_LOGO_LOCKUPS]).toEqual(['horizontal', 'stacked', 'mark', 'wordmark']);
    expect([...STANDARD_USAGE_ROLES]).toEqual(['text', 'background', 'border', 'icon', 'illustration', 'accent', 'interactive']);
    expect([...STANDARD_SECTION_IDS]).toHaveLength(14);
  });
});

describe('with no vocabulary in the config', () => {
  it('BlazonData holds the standard lists, and the standard sections with their titles', async () => {
    const data = await compile(project());
    expect(data.vocabulary).toEqual({ lockups: [...STANDARD_LOGO_LOCKUPS], usageRoles: [...STANDARD_USAGE_ROLES] });
    expect(data.sections).toEqual(STANDARD_SECTION_IDS.map((id, i) => ({ id, title: STANDARD_TITLES[i], standard: true })));
  });
});

describe('custom sections', () => {
  const config = {
    customSections: [
      { id: 'voice', title: 'Voice and tone' },
      { id: 'sound', title: 'Sound' },
    ],
  };

  it('are listed after the standard ones, with their titles', async () => {
    const { sections } = await compile(project(), config);
    expect(sections.slice(14)).toEqual([
      { id: 'voice', title: 'Voice and tone', standard: false },
      { id: 'sound', title: 'Sound', standard: false },
    ]);
  });

  it("are accepted in a page's front matter where a standard one is", async () => {
    const data = await compile(project({ 'docs/a.md': page('[logo, voice]') }), config);
    expect(data.docs[0]!.sections).toEqual(['logo', 'voice']);
    expect(data.findings.filter((f) => f.code === 'section-invalid')).toEqual([]);
  });

  it('are missing like a standard section: a note, once a page declares any section', async () => {
    const found = (await compile(project({ 'docs/a.md': page('logo') }), config)).findings.filter((f) => f.code === 'section-missing');
    expect(found.map((f) => f.path)).toEqual([...STANDARD_SECTION_IDS.filter((id) => id !== 'logo'), 'voice', 'sound'].sort());
  });

  it('are expected only when the `sections` config lists them, once it is set', async () => {
    const found = (await compile(project({ 'docs/a.md': page('logo') }), { ...config, sections: ['logo', 'voice'] })).findings.filter((f) => f.code === 'section-missing');
    expect(found.map((f) => f.path)).toEqual(['voice']);
  });

  it('are valid in the `sections` config, and an unknown id there is still an error', async () => {
    const found = (await compile(project({ 'docs/a.md': page('logo') }), { ...config, sections: ['logo', 'voice', 'branding'] })).findings.filter(
      (f) => f.code === 'section-invalid',
    );
    expect(found.map((f) => [f.path, f.message])).toEqual([['sections', expect.stringContaining('"branding" is not a section; known: intro, logo,')]]);
    expect(found[0]!.message).toContain('voice, sound');
  });

  it('do not make an unknown id in a page valid, and the message lists the custom ones', async () => {
    const found = (await compile(project({ 'docs/a.md': page('branding') }), config)).findings.filter((f) => f.code === 'section-invalid');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'a.md' });
    expect(found[0]!.message).toBe(`"branding" is not a section; known: ${[...STANDARD_SECTION_IDS, 'voice', 'sound'].join(', ')}`);
  });
});

describe('custom lockups', () => {
  const sidecar = (lockup: string) => project({ 'assets/logos/mono.png': PNG, 'assets/logos/mono.json': JSON.stringify({ lockup }) });

  it('are accepted in a sidecar, and held in BlazonData after the standard ones', async () => {
    const data = await compile(sidecar('monogram'), { vocabulary: { lockups: ['monogram'] } });
    expect(data.assets.all[0]!.meta).toEqual({ lockup: 'monogram' });
    expect(data.findings.filter((f) => f.code === 'asset-sidecar-invalid')).toEqual([]);
    expect(data.vocabulary.lockups).toEqual([...STANDARD_LOGO_LOCKUPS, 'monogram']);
  });

  it('are still an error when not declared, and the message lists what is valid', async () => {
    const data = await compile(sidecar('monogram'));
    expect(data.findings.filter((f) => f.code === 'asset-sidecar-invalid').map((f) => f.message)).toEqual(['lockup must be one of horizontal, stacked, mark, wordmark']);
    const declared = await compile(sidecar('shield'), { vocabulary: { lockups: ['monogram'] } });
    expect(declared.findings.filter((f) => f.code === 'asset-sidecar-invalid').map((f) => f.message)).toEqual([
      'lockup must be one of horizontal, stacked, mark, wordmark, monogram',
    ]);
  });
});

describe('custom usage roles', () => {
  const tokens = (role: string) =>
    project({
      'tokens/t.json': JSON.stringify({
        color: { ink: { $type: 'color', $value: '#000000', $extensions: { 'dev.blazon': { usage: { deny: ['chart'] } } } } },
        series: { line: { $type: 'color', $value: '{color.ink}', $extensions: { 'dev.blazon': { role } } } },
      }),
    });
  const codes = async (root: string, config: Record<string, unknown> = {}) =>
    (await compile(root, config)).findings.filter((f) => f.code === 'unknown-role' || f.code === 'usage-violation').map((f) => f.code);

  it('are accepted where a standard one is, and are compared like one', async () => {
    expect(await codes(tokens('chart'), { vocabulary: { usageRoles: ['chart'] } })).toEqual(['usage-violation']);
    expect(await codes(tokens('text'), { vocabulary: { usageRoles: ['chart'] } })).toEqual([]);
  });

  it('are an error when not declared, and the message lists what is valid', async () => {
    const found = (await compile(tokens('chart'))).findings.filter((f) => f.code === 'unknown-role');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.message).toBe('"chart" is not a usage role (text, background, border, icon, illustration, accent, interactive)');
  });

  it('are reported, not thrown on, when usage.allow or usage.deny is not a list', async () => {
    for (const key of ['allow', 'deny']) {
      const root = project({
        'tokens/t.json': JSON.stringify({
          color: { ink: { $type: 'color', $value: '#000000', $extensions: { 'dev.blazon': { usage: { [key]: 42 } } } } },
          series: { line: { $type: 'color', $value: '{color.ink}', $extensions: { 'dev.blazon': { role: 'text' } } } },
        }),
      });
      const found = (await compile(root)).findings.filter((f) => f.code === 'unknown-role');
      expect(found.map((f) => f.message)).toEqual([`usage.${key} must be a list of usage roles`]);
    }
  });

  it('are held in BlazonData after the standard ones', async () => {
    expect((await compile(project(), { vocabulary: { usageRoles: ['chart'] } })).vocabulary.usageRoles).toEqual([...STANDARD_USAGE_ROLES, 'chart']);
  });
});

describe('a bad addition', () => {
  it.each<[string, Record<string, unknown>, string, string]>([
    ['customSections that is not a list', { customSections: 'voice' }, 'customSections', 'customSections must be a list of {"id": name, "title": text}'],
    ['a section that is not an object', { customSections: ['voice'] }, 'customSections[0]', 'customSections[0] must be {"id": name, "title": text}'],
    [
      'a section id that is not a name',
      { customSections: [{ id: 'Voice Tone', title: 'x' }] },
      'customSections[0]',
      'customSections[0].id must be a name: lowercase letters, digits and hyphens, starting with a letter',
    ],
    ['a section id that repeats a standard one', { customSections: [{ id: 'logo', title: 'x' }] }, 'customSections[0]', 'customSections[0].id "logo" is a standard section'],
    [
      'a section id that repeats an earlier one',
      {
        customSections: [
          { id: 'voice', title: 'a' },
          { id: 'voice', title: 'b' },
        ],
      },
      'customSections[1]',
      'customSections[1].id "voice" is used twice',
    ],
    ['a section with no title', { customSections: [{ id: 'voice' }] }, 'customSections[0]', 'customSections[0].title must be a non-empty string'],
    [
      'a section with an extra field',
      { customSections: [{ id: 'voice', title: 'x', order: 1 }] },
      'customSections[0]',
      'customSections[0] has unknown field "order"; known: id, title',
    ],
    ['a vocabulary that is a list', { vocabulary: ['mark'] }, 'vocabulary', 'vocabulary must be an object with lockups and usageRoles'],
    ['a vocabulary with an unknown list', { vocabulary: { colors: ['red'] } }, 'vocabulary', 'vocabulary has unknown field "colors"; known: lockups, usageRoles'],
    ['lockups that is not a list', { vocabulary: { lockups: 'mark' } }, 'vocabulary.lockups', 'vocabulary.lockups must be a list of names'],
    [
      'a lockup that is not a name',
      { vocabulary: { lockups: ['Mono Gram'] } },
      'vocabulary.lockups[0]',
      'vocabulary.lockups[0] must be a name: lowercase letters, digits and hyphens, starting with a letter',
    ],
    ['a lockup that repeats a standard one', { vocabulary: { lockups: ['mark'] } }, 'vocabulary.lockups[0]', 'vocabulary.lockups[0] "mark" is a standard lockup'],
    ['a usage role that repeats an earlier one', { vocabulary: { usageRoles: ['chart', 'chart'] } }, 'vocabulary.usageRoles[1]', 'vocabulary.usageRoles[1] "chart" is used twice'],
    ['a usage role that repeats a standard one', { vocabulary: { usageRoles: ['text'] } }, 'vocabulary.usageRoles[0]', 'vocabulary.usageRoles[0] "text" is a standard usage role'],
  ])('is config-invalid on the place it is: %s', async (_name, config, where, message) => {
    const found = await invalid(config);
    expect(found.map((f) => [f.path, f.message])).toEqual([[where, message]]);
    expect(found[0]!.severity).toBe('error');
  });

  it('leaves out the entry that is wrong and keeps the rest', async () => {
    const data = await compile(project(), {
      customSections: [
        { id: 'voice', title: 'Voice' },
        { id: 'logo', title: 'x' },
        { id: 'sound', title: 'Sound' },
      ],
      vocabulary: { lockups: ['monogram', 'mark', 'shield'] },
    });
    expect(data.sections.slice(14).map((s) => s.id)).toEqual(['voice', 'sound']);
    expect(data.vocabulary.lockups).toEqual([...STANDARD_LOGO_LOCKUPS, 'monogram', 'shield']);
    expect(data.findings.filter((f) => f.code === 'config-invalid')).toHaveLength(2);
  });
});

describe('brand.json', () => {
  const ajv = () => new Ajv2020({ strict: true, allErrors: true });

  async function exported() {
    const root = project({
      'assets/logos/mono.png': PNG,
      'assets/logos/mono.json': JSON.stringify({ lockup: 'monogram' }),
      'docs/a.md': page('[logo, voice]'),
    });
    const config = { ...DEFAULT_CONFIG, customSections: [{ id: 'voice', title: 'Voice and tone' }], vocabulary: { lockups: ['monogram'], usageRoles: ['chart'] } } as BlazonConfig;
    const data = await compileBlazonData(config, root);
    return { data, brand: JSON.parse(JSON.stringify(buildBrandExport(data, config, root))) };
  }

  it('carries the vocabulary and the valid sections, so a reader learns custom titles without blazon', async () => {
    const { data, brand } = await exported();
    expect(brand.vocabulary).toEqual({ lockups: [...STANDARD_LOGO_LOCKUPS, 'monogram'], usageRoles: [...STANDARD_USAGE_ROLES, 'chart'] });
    expect(brand.sections).toEqual(data.sections);
    expect(brand.sections.at(-1)).toEqual({ id: 'voice', title: 'Voice and tone', standard: false });
    expect(brand.pages[0].sections).toEqual(['logo', 'voice']);
    expect(brand.assets[0].meta.lockup).toBe('monogram');
  });

  it('validates against the schema, which no longer lists the section ids or the lockups', async () => {
    const { brand } = await exported();
    const validate = ajv().compile(BRAND_SCHEMA);
    expect(validate(brand), JSON.stringify(validate.errors)).toBe(true);
    expect(JSON.stringify(BRAND_SCHEMA)).not.toContain('"intro"');
    expect(JSON.stringify(BRAND_SCHEMA)).not.toContain('"wordmark"');
  });

  it('still refuses a section or lockup that is not a name', async () => {
    const { brand } = await exported();
    const validate = ajv().compile(BRAND_SCHEMA);
    for (const change of [
      (b: typeof brand) => (b.pages[0].sections = ['Voice Tone']),
      (b: typeof brand) => (b.assets[0].meta.lockup = 'Mono Gram'),
      (b: typeof brand) => (b.vocabulary.lockups = 'mark'),
      (b: typeof brand) => delete b.sections,
      (b: typeof brand) => (b.sections[0].standard = 'yes'),
    ]) {
      const broken = structuredClone(brand);
      change(broken);
      expect(validate(broken)).toBe(false);
    }
  });
});
