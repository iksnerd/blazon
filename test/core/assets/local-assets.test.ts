import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import type { AssetCategoryConfig, BlazonConfig } from '../../../src/types/index.js';
import { writeProject } from '../../support/helpers.js';

// A category whose images are kept out of git (`assets.<key>.local`, RFC 0001 §11): a checkout without them
// gets one note per category instead of an error for every file and directive that needs them.

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const MAKE = 'Run render-art.py with your copy of the guidelines PDF.';

/** Sidecars and pages that use them, with no image at all: what a fresh clone of such a brand holds. */
const CLONE = {
  'assets/logos/horizontal.json': { title: 'Horizontal' },
  'assets/usage/misuse.json': { title: 'Misuse' },
  'assets/usage/clear-space.json': { title: 'Clear space' },
  'docs/01-logo.md': '# Logo\n\n<!-- blazon:logo-usage -->\n\n<!-- blazon:section usage misuse clear-space -->\n\n<!-- blazon:logo-placement usage/misuse -->\n',
};

const compile = (files: Record<string, unknown>, assets: Record<string, AssetCategoryConfig | unknown>) =>
  compileBlazonData({ ...DEFAULT_CONFIG, logo: './assets/logos/horizontal.svg', assets: assets as Record<string, AssetCategoryConfig> } as BlazonConfig, writeProject(files));

const LOCAL = { logos: { local: MAKE }, usage: { local: MAKE } };

describe('local asset categories', () => {
  it('turns a local category with no image into one note, and drops what its absence causes', async () => {
    const { findings } = await compile(CLONE, LOCAL);
    // These projects have no tokens, which is `tokens-missing`'s business and not this test's
    expect(findings.filter((f) => f.severity !== 'info' && f.code !== 'tokens-missing')).toEqual([]);
    expect(findings.filter((f) => f.code === 'asset-local-missing')).toEqual([
      {
        code: 'asset-local-missing',
        severity: 'info',
        path: 'logos',
        message: `The images are kept out of git and are not here. ${MAKE} Until then the brand book leaves them out.`,
      },
      {
        code: 'asset-local-missing',
        severity: 'info',
        path: 'usage',
        message: `The images are kept out of git and are not here. ${MAKE} Until then the brand book leaves them out.`,
      },
    ]);
  });

  it('reports everything as usual for a category that is not local', async () => {
    const codes = (await compile(CLONE, { logos: { local: MAKE } })).findings.map((f) => f.code);
    expect(codes).toContain('asset-sidecar-orphaned');
    expect(codes).toContain('directive-invalid');
    expect(codes).not.toContain('logo-missing');
  });

  it('still reports a directive naming a category that does not exist', async () => {
    const files = { ...CLONE, 'docs/02-typo.md': '# Typo\n\n<!-- blazon:section usgae misuse -->\n' };
    expect((await compile(files, LOCAL)).findings.filter((f) => f.severity === 'error')).toEqual([
      { code: 'directive-invalid', severity: 'error', path: '02-typo.md', message: '<!-- blazon:section usgae misuse -->: no asset at usgae' },
    ]);
  });

  it('reports everything as usual once one image of a local category is there', async () => {
    const { findings } = await compile({ ...CLONE, 'assets/usage/misuse.svg': SVG }, LOCAL);
    expect(findings.filter((f) => f.path === 'usage' && f.code === 'asset-local-missing')).toEqual([]);
    expect(findings.filter((f) => f.code === 'asset-sidecar-orphaned').map((f) => f.path)).toEqual(['usage/clear-space.json']);
    expect(findings.filter((f) => f.code === 'directive-invalid').map((f) => f.message)).toEqual([
      '<!-- blazon:logo-placement usage/misuse -->: usage/misuse states no placement in its sidecar',
      '<!-- blazon:section usage misuse clear-space -->: no asset at usage/clear-space',
    ]);
  });

  it('tells a reader of the data that a category is local once its images are there', async () => {
    const { assetCategories } = await compile({ ...CLONE, 'assets/usage/misuse.svg': SVG }, LOCAL);
    expect(assetCategories?.find((c) => c.category === 'usage')).toEqual({ category: 'usage', label: 'Usage', local: MAKE });
  });

  it('needs local to say how to make the files', async () => {
    const { findings } = await compile(CLONE, { usage: { local: true } });
    expect(findings.filter((f) => f.code === 'asset-config-invalid')).toEqual([
      { code: 'asset-config-invalid', severity: 'error', path: 'usage', message: 'local must be a sentence saying how to make the files' },
    ]);
  });
});
