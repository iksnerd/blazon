import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { BRAND_SCHEMA } from '../../../src/core/brand/schema.js';
import type { AssetCategoryConfig } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

// An asset category may declare `experimental: true` (RFC 0001 §11): its files are explorations, so their `review` is data and
// does not gate the book. The findings an ordinary asset gets for it (`needs-review`, `generated-unreviewed`, `needs-review-in-use`) are not raised.

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const FLAGGED = JSON.stringify({ review: { status: 'needs-review', note: 'An experiment' } });
const GENERATED = JSON.stringify({ generated: { by: 'a model' } });

/** A project with the given assets and docs; `experiments` is the experimental category unless the test says otherwise. */
function project(files: Record<string, string>, docs: Record<string, string> = {}) {
  const root = tempDir();
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, 'assets', file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', file), content);
  }
  for (const [file, content] of Object.entries(docs)) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', file), content);
  }
  return root;
}
const compile = (root: string, assets: Record<string, unknown>) =>
  compileBlazonData({ ...DEFAULT_CONFIG, docsDir: path.join(root, 'docs'), assets: assets as Record<string, AssetCategoryConfig> }, root);
const codes = (data: Awaited<ReturnType<typeof compile>>) =>
  data.findings
    .filter((f) => ['needs-review', 'generated-unreviewed'].includes(f.code))
    .map((f) => `${f.code} ${f.path}`)
    .sort();

const LIBRARY = {
  'logos/mark.svg': SVG,
  'logos/mark.json': FLAGGED,
  'logos/gen.svg': SVG,
  'logos/gen.json': GENERATED,
  'experiments/a.svg': SVG,
  'experiments/a.json': FLAGGED,
  'experiments/b.svg': SVG,
  'experiments/b.json': GENERATED,
};
const EXPERIMENTAL = { experiments: { experimental: true } };

describe('experimental asset categories', () => {
  it('raise no needs-review or generated-unreviewed, while an ordinary category still does', async () => {
    const root = project(LIBRARY);
    expect(codes(await compile(root, EXPERIMENTAL))).toEqual(['generated-unreviewed logos/gen', 'needs-review logos/mark']);
    expect(codes(await compile(root, {}))).toEqual([
      'generated-unreviewed experiments/b',
      'generated-unreviewed logos/gen',
      'needs-review experiments/a',
      'needs-review logos/mark',
    ]);
    expect(codes(await compile(root, { experiments: { experimental: false } }))).toContain('needs-review experiments/a');
  });

  it('keep the asset review as data', async () => {
    const data = await compile(project(LIBRARY), EXPERIMENTAL);
    expect(data.assets.custom.experiments!.find((a) => a.name === 'a')!.meta!.review).toEqual({ status: 'needs-review', note: 'An experiment' });
  });

  it('are not needs-review-in-use on a page, which still reports the ordinary assets it draws', async () => {
    const page = '---\ntitle: P\n---\n\n<!-- blazon:assets experiments -->\n\n<!-- blazon:assets logos mark -->\n';
    const data = await compile(project(LIBRARY, { '01-p.md': page }), EXPERIMENTAL);
    expect(data.findings.filter((f) => f.code === 'needs-review-in-use').map((f) => f.message)).toEqual(['Shows 1 asset still marked needs-review: logos/mark']);

    const only = await compile(project(LIBRARY, { '01-p.md': '---\ntitle: P\n---\n\n<!-- blazon:assets experiments -->\n' }), EXPERIMENTAL);
    expect(only.findings.filter((f) => f.code === 'needs-review-in-use')).toEqual([]);
    const ordinary = await compile(project(LIBRARY, { '01-p.md': '---\ntitle: P\n---\n\n<!-- blazon:assets experiments -->\n' }), {});
    expect(ordinary.findings.filter((f) => f.code === 'needs-review-in-use')).toHaveLength(1);
  });

  it('are marked in the categories the viewer and brand.json carry, and brand.json stays valid', async () => {
    const data = await compile(project(LIBRARY), { experiments: { experimental: true, label: 'Experiments' } });
    expect(data.assetCategories!.find((c) => c.category === 'experiments')).toEqual({ category: 'experiments', label: 'Experiments', experimental: true });
    expect(data.assetCategories!.find((c) => c.category === 'logos')).not.toHaveProperty('experimental');
    const exported = buildBrandExport(data, { ...DEFAULT_CONFIG }, tempDir());
    expect(exported.categories.find((c) => c.category === 'experiments')).toMatchObject({ experimental: true });
    const valid = new Ajv2020({ strict: true, allErrors: true }).compile(BRAND_SCHEMA);
    expect(valid(JSON.parse(JSON.stringify({ ...exported, generator: { name: 'blazon', commit: 'a'.repeat(40), dirty: false } }))), JSON.stringify(valid.errors)).toBe(true);
  });

  it('must be a boolean: anything else is asset-config-invalid, and the entry is left out whole', async () => {
    for (const bad of ['yes', 1, null, {}]) {
      const data = await compile(project(LIBRARY), { experiments: { experimental: bad } });
      expect(data.findings.filter((f) => f.code === 'asset-config-invalid').map((f) => [f.path, f.message])).toEqual([['experiments', 'experimental must be true or false']]);
      expect(codes(data)).toContain('needs-review experiments/a');
    }
  });
});
