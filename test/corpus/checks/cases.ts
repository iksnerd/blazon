import fs from 'node:fs';
import path from 'node:path';
import type { CheckCode } from '../../../src/core/checker/catalogue.js';
import type { BlazonIdentity } from '../../../src/core/blazon-pin.js';
import { getTemplateDir } from '../../../src/core/starter.js';

// The conformance corpus of the checks (RFC 0001, "Conformance"): for every code in the catalogue, a project that yields it at the
// catalogue's severity (`fail`) and one that differs in the one thing that matters and does not (`near`). Each case is a handful of files, an
// optional config, and where the code needs it, the identity of the running blazon. The test that runs them is test/core/checker/corpus.test.ts.
// A new catalogue code with no entry here fails that test.

export interface Setup {
  /** Files at project-relative paths: objects are written as JSON, text as it is. */
  files?: Record<string, unknown>;
  /** Files (project-relative) made unreadable after they are written. */
  unreadable?: string[];
  /** Config keys over the defaults. */
  config?: Record<string, unknown>;
  /** The blazon that is running, for the pin; a clean build of commit `a` x 40 when absent. */
  identity?: BlazonIdentity | null;
  /** Run the check plugins the config allows, as `blazon check` does after the compile. */
  plugins?: boolean;
  /** A fake icon package to install under node_modules/<name>: file path to text. */
  packages?: Record<string, Record<string, string>>;
}

export interface Case {
  fail: Setup;
  near: Setup;
}

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#111111"/></svg>';
const WHITE_SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#ffffff"/></svg>';
const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);
export const CLEAN: BlazonIdentity = { commit: COMMIT, dirty: false, from: 'build' };

/** A token file with two colors: the smallest project that compiles with no error. */
const COLORS = { color: { $type: 'color', ink: { $value: '#111111' }, paper: { $value: '#ffffff' } } };
const tokens = (tree: unknown = COLORS) => ({ 'tokens/a.json': tree });
const colors = (extra: Record<string, unknown> = {}) => tokens({ color: { $type: 'color', ...extra } });
const ink = (token: Record<string, unknown>) => colors({ ink: { $value: '#111111', ...token } });
const blazon = (extension: Record<string, unknown>) => ({ $extensions: { 'dev.blazon': extension } });
const logoAsset = { 'assets/logos/mark.svg': SVG };
const withIcons = { 'lucide-static': { 'icons/home.svg': SVG, 'icons/plus.svg': SVG } };
const resolver = {
  'blazon.resolver.json': {
    version: '2025.10',
    sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
    modifiers: { theme: { contexts: { light: [], dark: [] }, default: 'light' } },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  },
  'tokens/base.json': COLORS,
};
const doc = (body: string, front = '') => `---\ntitle: Page\n${front}---\n\n${body}\n`;
const fiveTokens = colors({ a: { $value: '#010101' }, b: { $value: '#020202' }, c: { $value: '#030303' }, d: { $value: '#040404' }, e: { $value: '#050505' } });
const fiveNamed = '`color.a` `color.b` `color.c` `color.d` `color.e`';
const pin = (commit: string) => ({ 'blazon.lock': { v: 1, commit } });
const starterLogo = fs.readFileSync(path.join(getTemplateDir(), 'assets/logos/blazon-graphite.svg'), 'utf-8');
const starterOfl = fs.readFileSync(path.join(getTemplateDir(), 'fonts/OFL.txt'), 'utf-8');
const starterDoc = fs.readFileSync(path.join(getTemplateDir(), 'docs/01-principles.md'), 'utf-8');

export const CASES: Partial<Record<CheckCode, Case>> = {
  'approval-stale': {
    fail: { files: ink(blazon({ review: { status: 'ok', by: 'Sam', at: '2026-01-02', value: '000000000000' } })) },
    near: { files: ink(blazon({ review: { status: 'ok', by: 'Sam', at: '2026-01-02' } })) },
  },
  'asset-config-invalid': {
    fail: { files: { ...tokens(), ...logoAsset }, config: { assets: { logos: 'not an object' } } },
    near: { files: { ...tokens(), ...logoAsset }, config: { assets: { logos: { label: 'Logos' } } } },
  },
  'asset-config-unused': {
    fail: { files: tokens(), config: { assets: { ghost: { label: 'Ghost' } } } },
    near: { files: { ...tokens(), 'assets/ghost/a.svg': SVG }, config: { assets: { ghost: { label: 'Ghost' } } } },
  },
  'asset-id-duplicate': {
    fail: { files: { ...tokens(), 'assets/photos/a/hero.svg': SVG, 'assets/photos/b/hero.svg': SVG } },
    near: { files: { ...tokens(), 'assets/photos/a/hero.svg': SVG, 'assets/photos/b/other.svg': SVG } },
  },
  'asset-local-missing': {
    fail: { files: tokens(), config: { assets: { ghost: { local: 'Run the export script.' } } } },
    near: { files: { ...tokens(), 'assets/ghost/a.svg': SVG }, config: { assets: { ghost: { local: 'Run the export script.' } } } },
  },
  'asset-rule-violated': {
    fail: { files: { ...tokens(), ...logoAsset }, config: { assets: { logos: { rules: { formats: ['png'] } } } } },
    near: { files: { ...tokens(), ...logoAsset }, config: { assets: { logos: { rules: { formats: ['svg'] } } } } },
  },
  'asset-sidecar-invalid': {
    fail: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { bogus: 1 } } },
    near: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { order: 1 } } },
  },
  'asset-unreadable': {
    fail: { files: { ...tokens(), ...logoAsset }, unreadable: ['assets/logos/mark.svg'] },
    near: { files: { ...tokens(), ...logoAsset } },
  },
  'asset-sidecar-orphaned': {
    fail: { files: { ...tokens(), 'assets/logos/ghost.json': { order: 1 } } },
    near: { files: { ...tokens(), 'assets/logos/ghost.svg': SVG, 'assets/logos/ghost.json': { order: 1 } } },
  },
  'alias-circular': {
    fail: { files: colors({ a: { $value: '{color.b}' }, b: { $value: '{color.a}' } }) },
    near: { files: colors({ a: { $value: '{color.b}' }, b: { $value: '#111111' } }) },
  },
  'config-invalid': {
    fail: { files: tokens(), config: { bogusKey: 1 } },
    near: { files: tokens(), config: { port: 3000 } },
  },
  'contrast-insufficient': {
    fail: {
      files: tokens({ ...COLORS, color: { ...COLORS.color, ink: { $value: '#888888' } }, rules: blazon({ pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }) }),
    },
    near: { files: tokens({ ...COLORS, rules: blazon({ pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }) }) },
  },
  'contrast-unknown': {
    fail: {
      files: tokens({
        color: { $type: 'color', ink: { $value: 'var(--brand)' }, paper: { $value: '#ffffff' } },
        rules: blazon({ pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }),
      }),
    },
    near: { files: tokens({ ...COLORS, rules: blazon({ pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }) }) },
  },
  'css-variable-duplicate': {
    fail: { files: tokens({ size: { $type: 'dimension', 'foo-bar': { $value: '4px' }, foo: { bar: { $value: '8px' } } } }) },
    near: { files: tokens({ size: { $type: 'dimension', 'foo-bar': { $value: '4px' }, foo: { baz: { $value: '8px' } } } }) },
  },
  'alias-deprecated': {
    fail: { files: colors({ old: { $value: '#111111', $deprecated: true }, now: { $value: '{color.old}' } }) },
    near: { files: colors({ old: { $value: '#111111' }, now: { $value: '{color.old}' } }) },
  },
  'directive-invalid': {
    fail: { files: { ...tokens(), 'docs/a.md': doc('<!-- blazon:tokens color.nope -->') } },
    near: { files: { ...tokens(), 'docs/a.md': doc('<!-- blazon:tokens color.ink -->') } },
  },
  'directive-unknown': {
    fail: { files: { ...tokens(), 'docs/a.md': doc('<!-- blazon:nope -->') } },
    near: { files: { ...tokens(), 'docs/a.md': doc('<!-- blazon:tokens color.ink -->') } },
  },
  'token-path-duplicate': {
    fail: { files: { 'tokens/a.json': COLORS, 'tokens/b.json': COLORS } },
    near: { files: { 'tokens/a.json': COLORS, 'tokens/b.json': { size: { $type: 'dimension', s: { $value: '4px' } } } } },
  },
  'token-value-duplicate': {
    fail: { files: colors({ a: { $value: '#123456' }, b: { $value: '#123456' } }) },
    near: { files: colors({ a: { $value: '#123456' }, b: { $value: '#654321' } }) },
  },
  'alias-embedded': {
    fail: { files: colors({ a: { $value: '#111111' }, b: { $value: '{color.a} 50%' } }) },
    near: { files: colors({ a: { $value: '#111111' }, b: { $value: '{color.a}' } }) },
  },
  'pin-invalid': {
    fail: { files: { ...tokens(), 'blazon.lock': 'not json' } },
    near: { files: { ...tokens(), ...pin(COMMIT) } },
  },
  'pin-mismatch': {
    fail: { files: { ...tokens(), ...pin(OTHER_COMMIT) } },
    near: { files: { ...tokens(), ...pin(COMMIT) } },
  },
  'font-file-invalid': {
    fail: { files: tokens(), config: { fonts: [{ family: 'Mulish', file: 'fonts/mulish.woff2' }] } },
    near: { files: { ...tokens(), 'fonts/mulish.woff2': 'wOF2' }, config: { fonts: [{ family: 'Mulish', file: 'fonts/mulish.woff2' }] } },
  },
  'font-license-unknown': {
    fail: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Kinto', 'sans-serif'], ...blazon({ font: { license: 'OFL-1.2' } }) } } }) },
    near: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Kinto', 'sans-serif'], ...blazon({ font: { license: 'OFL-1.1' } }) } } }) },
  },
  'font-family-missing': {
    fail: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Mulish', 'sans-serif'] } } }), config: { fonts: ['https://fonts.googleapis.com/css2?family=Inter'] } },
    near: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Inter', 'sans-serif'] } } }), config: { fonts: ['https://fonts.googleapis.com/css2?family=Inter'] } },
  },
  'asset-review-missing': {
    fail: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { generated: { by: 'Midjourney' } } } },
    near: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { generated: { by: 'Midjourney' }, review: { status: 'ok' } } } },
  },
  'icon-set-invalid': {
    fail: { files: tokens(), config: { iconSets: [{ name: 'lucide', package: 'lucide-static' }] } },
    near: { files: tokens(), packages: withIcons, config: { iconSets: [{ name: 'lucide', package: 'lucide-static' }] } },
  },
  'icon-unknown': {
    fail: { files: tokens(), packages: withIcons, config: { iconSets: [{ name: 'lucide', package: 'lucide-static', categories: { Actions: ['plus', 'nope'] } }] } },
    near: { files: tokens(), packages: withIcons, config: { iconSets: [{ name: 'lucide', package: 'lucide-static', categories: { Actions: ['plus', 'home'] } }] } },
  },
  'font-meta-invalid': {
    fail: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Kinto'], ...blazon({ font: { source: 7 } }) } } }) },
    near: { files: tokens({ font: { $type: 'fontFamily', brand: { $value: ['Kinto'], ...blazon({ font: { source: 'Kinto Foundry' } }) } } }) },
  },
  'page-frontmatter-invalid': {
    fail: { files: { ...tokens(), 'docs/a.md': '---\ntitle: a: b\n---\n\nText\n' } },
    near: { files: { ...tokens(), 'docs/a.md': '---\ntitle: "a: b"\n---\n\nText\n' } },
  },
  'token-file-invalid': {
    fail: { files: { 'tokens/a.json': '{ "color": ' } },
    near: { files: tokens() },
  },
  'logo-rule-invalid': {
    fail: { files: ink(blazon({ logo: { deny: 'onDark' } })) },
    near: { files: ink(blazon({ logo: { deny: ['onDark'] } })) },
  },
  'contrast-pair-invalid': {
    fail: { files: tokens({ ...COLORS, rules: blazon({ pairs: [{ fg: '{color.nope}', bg: '{color.paper}', min: 'AA' }] }) }) },
    near: { files: tokens({ ...COLORS, rules: blazon({ pairs: [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AA' }] }) }) },
  },
  'proportion-invalid': {
    fail: { files: tokens({ color: { $type: 'color', ...blazon({ proportion: { Ink: 2 } }), ink: { $value: '#111111' } } }) },
    near: { files: tokens({ color: { $type: 'color', ...blazon({ proportion: { Ink: 1 } }), ink: { $value: '#111111' } } }) },
  },
  'review-invalid': {
    fail: { files: ink(blazon({ review: { status: 'maybe' } })) },
    near: { files: ink(blazon({ review: { status: 'ok' } })) },
  },
  'token-invalid': {
    fail: { files: colors({ ink: '#111111' }) },
    near: { files: colors({ ink: { $value: '#111111' } }) },
  },
  'token-value-invalid': {
    fail: { files: colors({ ink: { $value: 'notacolor' } }) },
    near: { files: colors({ ink: { $value: '#111111' } }) },
  },
  'logo-contrast-insufficient': {
    fail: {
      files: { ...tokens({ surface: { $type: 'color', page: { $value: '#ffffff' } } }), 'assets/logos/mark.svg': WHITE_SVG },
      config: { logo: { onLight: './assets/logos/mark.svg' }, theme: { background: 'surface.page' } },
    },
    near: {
      files: { ...tokens({ surface: { $type: 'color', page: { $value: '#ffffff' } } }), ...logoAsset },
      config: { logo: { onLight: './assets/logos/mark.svg' }, theme: { background: 'surface.page' } },
    },
  },
  'logo-missing': {
    fail: { files: tokens(), config: { logo: { onLight: './assets/logos/mark.svg' } } },
    near: { files: { ...tokens(), ...logoAsset }, config: { logo: { onLight: './assets/logos/mark.svg' } } },
  },
  'token-type-missing': {
    fail: { files: tokens({ color: { ink: { $value: '#111111' } } }) },
    near: { files: tokens({ color: { $type: 'color', ink: { $value: '#111111' } } }) },
  },
  'review-pending': {
    fail: { files: ink(blazon({ review: { status: 'needs-review', note: 'Check it' } })) },
    near: { files: ink(blazon({ review: { status: 'ok' } })) },
  },
  'page-review-pending': {
    fail: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { review: { status: 'needs-review' } }, 'docs/a.md': doc('<!-- blazon:assets logos -->') } },
    near: { files: { ...tokens(), ...logoAsset, 'assets/logos/mark.json': { review: { status: 'ok' } }, 'docs/a.md': doc('<!-- blazon:assets logos -->') } },
  },
  'config-path-outside': {
    fail: { files: tokens(), config: { docsDir: '../docs-elsewhere' } },
    near: { files: tokens(), config: { docsDir: './docs' } },
  },
  'output-dirs-overlap': {
    fail: { files: tokens(), config: { outDir: './tokens' } },
    near: { files: tokens(), config: { outDir: './dist/site' } },
  },
  'plugin-failed': {
    fail: { files: tokens(), config: { plugins: [{ name: 'acme.house-style' }] }, plugins: true },
    near: { files: tokens(), plugins: true },
  },
  'plugin-lock-invalid': {
    fail: { files: { ...tokens(), 'blazon.plugins.lock': { v: 1, plugins: {}, bogus: 1 } } },
    near: { files: { ...tokens(), 'blazon.plugins.lock': { v: 1, plugins: {} } } },
  },
  'print-cmyk-invalid': {
    fail: { files: ink(blazon({ print: { cmyk: [100, 60, 0] } })) },
    near: { files: ink(blazon({ print: { cmyk: [100, 60, 0, 30] } })) },
  },
  'print-pms-invalid': {
    fail: { files: ink(blazon({ print: { pms: '' } })) },
    near: { files: ink(blazon({ print: { pms: '2945 C' } })) },
  },
  'print-ral-invalid': {
    fail: { files: ink(blazon({ print: { ral: 'RAL 5012' } })) },
    near: { files: ink(blazon({ print: { ral: '5012' } })) },
  },
  'proportion-total-mismatch': {
    fail: { files: tokens({ color: { $type: 'color', ...blazon({ proportion: { Ink: 0.5, Paper: 0.2 } }), ink: { $value: '#111111' } } }) },
    near: { files: tokens({ color: { $type: 'color', ...blazon({ proportion: { Ink: 0.5, Paper: 0.5 } }), ink: { $value: '#111111' } } }) },
  },
  'resolver-invalid': {
    fail: { files: tokens(), config: { resolver: 'missing.resolver.json' } },
    near: { files: resolver, config: { resolver: 'blazon.resolver.json' } },
  },
  'page-slug-duplicate': {
    fail: { files: { ...tokens(), 'docs/01-colors.md': doc('One'), 'docs/colors.md': doc('Two') } },
    near: { files: { ...tokens(), 'docs/01-colors.md': doc('One'), 'docs/02-type.md': doc('Two') } },
  },
  'page-unreadable': {
    // a folder named like a page cannot be read as one
    fail: { files: { ...tokens(), 'docs/a.md/inside.txt': 'x' } },
    near: { files: { ...tokens(), 'docs/a.md': doc('Text') } },
  },
  'section-invalid': {
    fail: { files: { ...tokens(), 'docs/a.md': doc('Text', 'section: nope\n') } },
    near: { files: { ...tokens(), 'docs/a.md': doc('Text', 'section: logo\n') } },
  },
  'section-missing': {
    fail: { files: { ...tokens(), 'docs/a.md': doc('Text', 'section: logo\n') } },
    near: { files: { ...tokens(), 'docs/a.md': doc('Text', 'section: logo\n') }, config: { sections: ['logo'] } },
  },
  'alias-missing': {
    fail: { files: tokens({ ...COLORS, text: { $type: 'color', ...blazon({ tier: 'semantic' }), primary: { $value: '#222222' } } }) },
    near: { files: tokens({ ...COLORS, text: { $type: 'color', ...blazon({ tier: 'semantic' }), primary: { $value: '{color.ink}' } } }) },
  },
  'source-css-var-invalid': {
    fail: { files: ink(blazon({ source: { cssVar: 'brand-ink' } })) },
    near: { files: ink(blazon({ source: { cssVar: '--brand-ink' } })) },
  },
  'starter-file-unchanged': {
    fail: { files: { ...tokens(), 'docs/01-principles.md': starterDoc, 'fonts/OFL.txt': starterOfl } },
    near: { files: { ...tokens(), 'docs/01-principles.md': `${starterDoc}\nOur own line.\n`, 'fonts/OFL.txt': `${starterOfl}\nOurs.\n` } },
  },
  'starter-logo-unchanged': {
    fail: { files: { ...tokens(), 'assets/logos/mark.svg': starterLogo }, config: { logo: './assets/logos/mark.svg' } },
    near: { files: { ...tokens(), 'assets/logos/mark.svg': `${starterLogo}\n<!-- ours -->\n` }, config: { logo: './assets/logos/mark.svg' } },
  },
  'theme-inferred': {
    fail: { files: tokens({ surface: { $type: 'color', background: { $value: '#ffffff' } } }) },
    near: { files: tokens({ surface: { $type: 'color', background: { $value: '#ffffff' } } }), config: { theme: { background: 'surface.background' } } },
  },
  'theme-missing': {
    fail: { files: tokens() },
    near: { files: tokens({ surface: { $type: 'color', background: { $value: '#ffffff' } } }) },
  },
  'theme-unresolved': {
    fail: { files: tokens(), config: { theme: { accent: 'color.nope' } } },
    near: { files: tokens(), config: { theme: { accent: 'color.ink' } } },
  },
  'tokens-missing': {
    fail: { files: { 'tokens/a.json': {} } },
    near: { files: tokens() },
  },
  'page-tokens-unplaced': {
    fail: { files: { ...fiveTokens, 'docs/a.md': doc(fiveNamed) } },
    near: { files: { ...fiveTokens, 'docs/a.md': doc(`${fiveNamed}\n\n<!-- blazon:tokens color.a -->`) } },
  },
  'alias-type-mismatch': {
    fail: { files: tokens({ color: { $type: 'color', ink: { $value: '#111111' } }, size: { $type: 'dimension', big: { $value: '{color.ink}' } } }) },
    near: { files: tokens({ color: { $type: 'color', ink: { $value: '#111111' } }, size: { $type: 'color', big: { $value: '{color.ink}' } } }) },
  },
  'logo-variant-unknown': {
    fail: { files: ink(blazon({ logo: { deny: ['onDrak'] } })) },
    near: { files: ink(blazon({ logo: { deny: ['onDark'] } })) },
  },
  'usage-role-unknown': {
    fail: { files: ink(blazon({ usage: { allow: ['nope'] } })) },
    near: { files: ink(blazon({ usage: { allow: ['text'] } })) },
  },
  'token-type-unknown': {
    fail: { files: tokens({ color: { $type: 'bogus', ink: { $value: '#111111' } } }) },
    near: { files: tokens({ color: { $type: 'color', ink: { $value: '#111111' } } }) },
  },
  'alias-unresolved': {
    fail: { files: colors({ a: { $value: '{color.nope}' } }) },
    near: { files: colors({ ink: { $value: '#111111' }, a: { $value: '{color.ink}' } }) },
  },
  'usage-violated': {
    fail: {
      files: tokens({
        color: { $type: 'color', pink: { $value: '#ff44dd', ...blazon({ usage: { deny: ['text'] } }) } },
        text: { $type: 'color', ...blazon({ tier: 'semantic', role: 'text' }), accent: { $value: '{color.pink}' } },
      }),
    },
    near: {
      files: tokens({
        color: { $type: 'color', pink: { $value: '#ff44dd', ...blazon({ usage: { deny: ['background'] } }) } },
        text: { $type: 'color', ...blazon({ tier: 'semantic', role: 'text' }), accent: { $value: '{color.pink}' } },
      }),
    },
  },
};
