import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { formatBrandJson } from '../../src/core/brand/export.js';
import { BRAND_SCHEMA, BRAND_SCHEMA_FILE } from '../../src/core/brand/schema.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { startDevServer } from '../../src/server/dev-server.js';
import { LOGO_CORNERS } from '../../src/types/index.js';
import { starterProject } from '../support/init-project';
import { REPO } from '../support/paths';
import { hasReference, referencePath } from '../support/reference';

// The JSON Schema of brand.json (RFC 0001 §12): the contract in a form any language can check a file against.
// A schema that lets a reader ignore keys it does not know cannot also catch a key the code added and the schema
// forgot, so the second check validates against a copy of the schema that forbids undescribed keys.

const ROOT = REPO;
type Json = any;

const ajv = () => new Ajv2020({ strict: true, allErrors: true });

/** The schema with `additionalProperties: false` wherever the schema did not say what other keys may be. */
function strictCopy(schema: Json): Json {
  const copy = structuredClone(schema);
  const walk = (node: Json): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    if (node.properties && node.additionalProperties === undefined) node.additionalProperties = false;
    Object.values(node).forEach(walk);
  };
  walk(copy);
  return copy;
}

async function exportOf(root: string): Promise<Json> {
  const config = await loadConfig(root);
  return JSON.parse(formatBrandJson(await compileBlazonData(config, root), config, root));
}

const exports: Record<string, Json> = {};
let validate: ValidateFunction;
let validateStrict: ValidateFunction;

beforeAll(async () => {
  validate = ajv().compile(BRAND_SCHEMA);
  validateStrict = ajv().compile(strictCopy(BRAND_SCHEMA));
  if (hasReference('examples/auth0')) exports.auth0 = await exportOf(referencePath('examples/auth0'));
  exports.blazon = await exportOf(path.join(ROOT, 'examples/blazon'));
  exports.conformance = await exportOf(path.join(ROOT, 'examples/conformance'));
  const starter = await starterProject();
  exports.starter = await exportOf(starter);
}, 120_000);

const errors = (check: ValidateFunction) => (check.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

describe('the schema', () => {
  it('is a valid draft 2020-12 schema that names itself', () => {
    expect(BRAND_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(ajv().validateSchema(BRAND_SCHEMA)).toBe(true);
  });

  it.each(['blazon', 'starter'])('accepts the %s export, and a copy that forbids undescribed keys accepts it too', (name) => {
    expect(validate(exports[name]), errors(validate)).toBe(true);
    expect(validateStrict(exports[name]), errors(validateStrict)).toBe(true);
  });

  it.skipIf(!hasReference('examples/auth0'))('accepts the export of the reference brand, strict or not', () => {
    expect(validate(exports.auth0), errors(validate)).toBe(true);
    expect(validateStrict(exports.auth0), errors(validateStrict)).toBe(true);
  });

  // Fields a brand may state that the reference exports do not use: each is put on a copy and checked strictly
  const withLogoMeta = (meta: Json): Json => {
    const copy = structuredClone(exports.blazon);
    const logo = copy.assets.find((a: Json) => a.category === 'logos');
    logo.meta = { ...logo.meta, ...meta };
    return copy;
  };

  it.each([
    ['a partnership with no divider', { partnership: { gap: { units: 1 } } }],
    ['an initiative', { initiative: { name: 'Lab', mark: 'initiatives/lab', gap: { units: 2 }, position: 'below', markHeight: { units: 3 } } }],
    ['an ink', { ink: '#0B1F3A' }],
    ['an order and extensions', { order: 2, extensions: { 'com.acme.contrast': { onDark: 7.2 } } }],
    ['a largest size', { maxSize: { width: { value: 90, unit: 'px' } } }],
    ['where an image came from', { generated: { by: 'Midjourney v7', prompt: 'a lighthouse', licence: 'Commercial plan' } }],
    ['an asset to use below a size', { replacedBelow: { width: { value: 30, unit: 'px' }, by: 'logos/small' } }],
  ])('accepts %s', (_, meta) => {
    const doc = withLogoMeta(meta);
    expect(validateStrict(doc), errors(validateStrict)).toBe(true);
  });

  it('accepts the ink of a configured logo, and refuses one that is not text', () => {
    const copy = structuredClone(exports.blazon);
    Object.assign(copy.logo, { onLightInk: '#3F73F8', onDarkInk: '#FFFFFF' });
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    copy.logo.onLightInk = 7;
    expect(validate(copy)).toBe(false);
  });

  it('requires a generator, with or without a commit, and refuses a malformed one', () => {
    const copy = structuredClone(exports.blazon);
    for (const generator of [{ name: 'blazon' }, { name: 'blazon', commit: 'a'.repeat(40), dirty: false }]) {
      copy.generator = generator;
      expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    }
    delete copy.generator;
    expect(validate(copy)).toBe(false);
    for (const bad of [{}, { name: 'blazon', commit: 'abc' }, { name: 'other' }, { name: 'blazon', dirty: 'yes' }]) {
      copy.generator = bad;
      expect(validate(copy), JSON.stringify(bad)).toBe(false);
    }
  });

  it('accepts a review.value of 12 lowercase hex digits, and refuses other text', () => {
    const copy = structuredClone(exports.blazon);
    const token = copy.tokens[0];
    token.blazon = { review: { status: 'ok', value: '0123456789ab' } };
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    for (const value of ['abc', 'v1:0123456789ab', 'v2:0123456789abcdef', '0123456789AB']) {
      token.blazon = { review: { status: 'ok', value } };
      expect(validate(copy), value).toBe(false);
    }
  });

  it('accepts a category whose images are kept out of git', () => {
    const copy = structuredClone(exports.blazon);
    copy.categories[0].local = 'Run render-art.py with your copy of the guidelines.';
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
  });

  it('accepts a typeface the brand book cannot load', () => {
    const copy = structuredClone(exports.blazon);
    const family = copy.tokens.find((t: Json) => t.type === 'fontFamily');
    family.blazon = { ...family.blazon, webFont: false };
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    family.blazon.webFont = 'Commercial; no web stylesheet.';
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    // describes it, though the blazon object is open: true would say nothing a reader could use
    family.blazon.webFont = true;
    expect(validate(copy)).toBe(false);
  });

  it('accepts the source and license of a typeface and refuses a field it does not describe', () => {
    const copy = structuredClone(exports.blazon);
    const family = copy.tokens.find((t: Json) => t.type === 'fontFamily');
    family.blazon = { ...family.blazon, font: { source: 'https://fonts.example/kinto', license: 'OFL-1.1', licenseUrl: 'https://openfontlicense.org/' } };
    expect(validateStrict(copy), errors(validateStrict)).toBe(true);
    family.blazon.font.license = 3;
    expect(validate(copy)).toBe(false);
  });

  it('lists the logo corners, which are geometry and stay closed, and no longer lists sections or lockups, which a brand extends', () => {
    const s = JSON.stringify(BRAND_SCHEMA);
    expect(BRAND_SCHEMA.$defs.assetMeta.properties.placement.items.enum).toEqual([...LOGO_CORNERS]);
    expect(BRAND_SCHEMA.$defs.page.properties.sections.items).toEqual({ $ref: '#/$defs/sectionId' });
    expect(BRAND_SCHEMA.$defs.assetMeta.properties.lockup).toEqual({ $ref: '#/$defs/name' });
    expect(s).not.toContain('"file":true');
  });
});

describe('what the schema refuses', () => {
  const broken = (change: (brand: Json) => void): boolean => {
    const brand = structuredClone(exports.blazon);
    change(brand);
    return validate(brand) as boolean;
  };

  it.each<[string, (brand: Json) => void]>([
    ['a missing top-level key', (b) => delete b.tokens],
    ['a format that is not blazon-brand', (b) => (b.format = 'something-else')],
    ['a version other than 2', (b) => (b.version = 1)],
    ['a token with no value', (b) => delete b.tokens[0].value],
    ['a token path that is not a string', (b) => (b.tokens[0].path = 5)],
    ['`file` on a token, which would be read as a path beside brand.json', (b) => (b.tokens[0].file = 'tokens/colors.json')],
    ['`file` on a page', (b) => (b.pages[0].file = '01-intro.md')],
    ['bytes that are not a number', (b) => (b.assets[0].bytes = 'many')],
    ['an asset file that is an absolute path', (b) => (b.assets[0].file = '/etc/passwd')],
    ['an asset file that leaves the folder', (b) => (b.assets[0].file = '../secrets.png')],
    ['an asset file with a ".." in the middle', (b) => (b.assets[0].file = 'brand-assets/../../x.png')],
    ['an asset file that is a URL', (b) => (b.assets[0].file = 'https://example.com/x.png')],
    ['a logo that is neither a path nor an embedded image', (b) => (b.logo.onLight = '/abs/logo.png')],
    ['sections that are not a list', (b) => (b.pages[0].sections = 'logo')],
    ['a section that is not a name', (b) => (b.pages[0].sections = ['Brand Section'])],
    ['a lockup that is not a name', (b) => (b.assets.find((a: Json) => a.meta?.lockup).meta.lockup = 'Diagonal Mark')],
    ['a generated with no tool', (b) => (b.assets[0].meta = { generated: { prompt: 'x' } })],
    ['a generated that is a string', (b) => (b.assets[0].meta = { generated: 'Midjourney' })],
    ['an empty list of traits', (b) => (b.assets[0].meta = { traits: [] })],
  ])('%s', (_name, change) => {
    expect(broken(change)).toBe(false);
  });

  // blazon's own brand has no findings, so this one starts from the fixture that has some
  it('a finding with an unknown severity', () => {
    const brand = structuredClone(exports.conformance);
    expect(validate(brand)).toBe(true);
    brand.findings[0].severity = 'fatal';
    expect(validate(brand)).toBe(false);
  });

  it('accepts a key it does not know, anywhere, because a reader ignores keys it does not know', () => {
    expect(
      broken((b) => {
        b.addedLater = true;
        b.tokens[0].addedLater = 1;
        b.assets[0].addedLater = { a: 1 };
        b.pages[0].addedLater = [];
        b.assets[0].meta = { ...b.assets[0].meta, addedLater: 'x' };
      }),
    ).toBe(true);
  });

  it('accepts a logo embedded as a data URI, which is how a logo outside assets/ is carried', () => {
    expect(broken((b) => (b.logo.onLight = 'data:image/png;base64,iVBORw0KGgo='))).toBe(true);
  });
});

describe('the schema beside brand.json', () => {
  it('names itself in every export, as a path beside the file', () => {
    expect(BRAND_SCHEMA_FILE).toBe('brand.schema.json');
    for (const brand of Object.values(exports)) expect(brand.$schema).toBe('brand.schema.json');
  });

  it('is written by blazon build, the same file, and brand.json names it', async () => {
    const root = await starterProject();
    const { siteOutDir } = await buildSite(await loadConfig(root), root);
    const written = JSON.parse(fs.readFileSync(path.join(siteOutDir, BRAND_SCHEMA_FILE), 'utf-8'));
    expect(written).toEqual(BRAND_SCHEMA);
    const brand = JSON.parse(fs.readFileSync(path.join(siteOutDir, 'brand.json'), 'utf-8'));
    expect(fs.existsSync(path.join(siteOutDir, brand.$schema))).toBe(true);
    expect(ajv().compile(written)(brand)).toBe(true);
  }, 60_000);

  it('is served by the dev server next to /brand.json', async () => {
    const root = await starterProject();
    const server = await startDevServer({ ...(await loadConfig(root)), port: 0 }, root);
    try {
      const base = server.resolvedUrls!.local[0]!;
      const res = await fetch(new URL(BRAND_SCHEMA_FILE, base));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/schema\+json|application\/json/);
      expect(await res.json()).toEqual(BRAND_SCHEMA);
      const brand = await (await fetch(new URL('brand.json', base))).json();
      expect(brand.$schema).toBe(BRAND_SCHEMA_FILE);
    } finally {
      await server.close();
    }
  });
});
