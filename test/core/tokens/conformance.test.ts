import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData, emitTokenOutputs } from '../../../src/core/index.js';
import { formatBrandJson } from '../../../src/core/brand/export.js';
import { BRAND_SCHEMA } from '../../../src/core/brand/schema.js';
import { BLAZON_LOCK, blazonPinFindings, writeBlazonPin, type BlazonIdentity } from '../../../src/core/blazon-pin.js';
import { copyProject } from '../../support/examples';
import { tempDir } from '../../support/project';
import { REPO } from '../../support/paths';
import { hasReference, referencePath } from '../../support/reference';

/**
 * RFC 0001 conformance: examples/conformance, and the reference brand when a maintainer has it in docs/personal/reference, must
 * produce exactly the golden outputs and findings. The reference brand's goldens live beside it (docs/personal/reference/golden/),
 * so a clean clone skips that part. After a deliberate output change, regenerate with
 * `UPDATE_GOLDEN=1 npx vitest run test/core/tokens/conformance.test.ts` and review the diff of test/examples/golden/conformance/
 * like any other code change.
 */
const EXAMPLE = referencePath('examples/auth0');
const GOLDEN = referencePath('golden/auth0');
const PRESENT = hasReference('examples/auth0') && (hasReference('golden/auth0') || process.env.UPDATE_GOLDEN === '1');
const FIXTURE = path.join(REPO, 'examples/conformance');
const FIXTURE_GOLDEN = path.join(REPO, 'test/examples/golden/conformance');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

function matchGolden(name: string, actual: string, dir = GOLDEN): void {
  const file = path.join(dir, name);
  if (UPDATE) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, actual);
  }
  expect(actual).toBe(fs.readFileSync(file, 'utf-8'));
}

/**
 * brand.json as the golden holds it: parsed and written again with the top-level `generator` key removed. `generator`
 * names the blazon build that wrote the file (its commit and whether the tree was dirty), so it differs between builds
 * and cannot be pinned. A finding's message may name the date of the SPDX license list blazon ships (font-license-unknown), which
 * moves when the list is refreshed and says nothing about brand.json, so that date alone is masked. Everything else is pinned,
 * so a change to the shape of brand.json shows as a golden diff.
 */
function brandJsonGolden(text: string): { text: string; document: Record<string, unknown> } {
  const document = JSON.parse(text) as Record<string, unknown>;
  delete document.generator;
  const masked = `${JSON.stringify(document, null, 2)}\n`.replace(/SPDX license list of \d{4}-\d{2}-\d{2}/g, 'SPDX license list of <date>');
  return { text: masked, document };
}

const findingsOf = (data: { findings: { code: string; severity: string; path: string; context?: string }[] }) =>
  data.findings.map(({ code, severity, path: p, context }) => ({ code, severity, path: p, ...(context && { context }) }));

const validBrandJson = new Ajv2020({ strict: true, allErrors: true }).compile(BRAND_SCHEMA);

describe.skipIf(!PRESENT)('conformance: the reference brand (docs/personal/reference)', async () => {
  if (!PRESENT) return;
  const outDir = tempDir();
  // The example's own config: its logo is what the logo directives in its pages draw
  const config = { ...(await loadConfig(EXAMPLE)), tokensOutDir: outDir };
  const data = await compileBlazonData(config, EXAMPLE);
  const emitted = await emitTokenOutputs(data, config, EXAMPLE);

  it.each([
    ['theme.css', emitted.cssPath],
    ['typography.css', emitted.typographyPath!],
    ['tokens.ts', emitted.tsPath],
    ['tokens.json', emitted.jsonPath],
    ['tokens.locale.ja.json', path.join(outDir, 'tokens.locale.ja.json')],
  ])('emits %s', (name, file) => {
    matchGolden(name, fs.readFileSync(file, 'utf-8'));
  });

  it('reports exactly the known source problems, in every locale', () => {
    matchGolden('check.json', `${JSON.stringify(findingsOf(data), null, 2)}\n`);
  });

  it('exports the brand.json in the golden, whatever the blazon build that wrote it', () => {
    const written = formatBrandJson(data, config, EXAMPLE);
    const { text } = brandJsonGolden(written);
    matchGolden('brand.json', text);
    // validated as written, with its generator: the golden has it removed, and the schema requires it
    expect(validBrandJson(JSON.parse(written)), JSON.stringify(validBrandJson.errors)).toBe(true);
    // the same file with a generator, as another build writes it, compares equal once it is removed
    const stamped = JSON.stringify({ ...JSON.parse(written), generator: { name: 'blazon', commit: 'a'.repeat(40), dirty: true } });
    expect(brandJsonGolden(stamped).text).toBe(text);
  });
});

// The fixture for what auth0 does not reach: review approvals (by, at, value), the font extension, a logo initiative, an experimental asset category.
// It is fictional on purpose: examples/blazon is blazon's own brand, and approving its tokens here would record approvals nobody gave.
describe('conformance: examples/conformance', async () => {
  const outDir = tempDir();
  const config = { ...(await loadConfig(FIXTURE)), tokensOutDir: outDir };
  const data = await compileBlazonData(config, FIXTURE);
  const emitted = await emitTokenOutputs(data, config, FIXTURE);

  it.each([
    ['theme.css', emitted.cssPath],
    ['tokens.ts', emitted.tsPath],
    ['tokens.json', emitted.jsonPath],
  ])('emits %s', (name, file) => {
    matchGolden(name, fs.readFileSync(file, 'utf-8'), FIXTURE_GOLDEN);
  });

  it('reports exactly one stale approval and one font license note, and nothing for the approvals that hold', () => {
    const findings = findingsOf(data);
    matchGolden('check.json', `${JSON.stringify(findings, null, 2)}\n`, FIXTURE_GOLDEN);
    // by name, so the golden cannot be regenerated into a different story without this failing
    expect(findings).toEqual([
      { code: 'approval-stale', severity: 'warning', path: 'color.accent' },
      { code: 'font-license-unknown', severity: 'info', path: 'font.family.body' },
    ]);
  });

  it('carries the approvals, the font metadata and the initiative into brand.json', () => {
    const written = formatBrandJson(data, config, FIXTURE);
    const { text } = brandJsonGolden(written);
    matchGolden('brand.json', text, FIXTURE_GOLDEN);
    expect(validBrandJson(JSON.parse(written)), JSON.stringify(validBrandJson.errors)).toBe(true);
    expect(text).toContain('"initiative"');
    expect(text).toContain('Example Approver');
    expect(text).toContain('OFL-1.2');
    expect(text).toContain('"experimental": true');
  });

  it('reports nothing for the experimental asset that says needs-review, nor for the page that draws it', () => {
    const sketch = data.assets.custom.experiments!.find((a) => a.name === 'example-sketch')!;
    expect(sketch.meta!.review!.status).toBe('needs-review');
    expect(data.docs.some((doc) => doc.markdown.includes('blazon:assets experiments'))).toBe(true);
    expect(data.findings.filter((f) => ['needs-review', 'needs-review-in-use', 'generated-unreviewed'].includes(f.code))).toEqual([]);
  });
});

// blazon.lock holds a commit of blazon itself, which no golden can: a golden would fail on every other commit, and a lock with
// a made-up hash committed in the example would make `blazon check examples/conformance` fail for everyone. So the lock is
// written into a copy of the fixture, for a blazon identity the test gives, and the findings are compared with the fixture's.
describe('conformance: blazon.lock on examples/conformance', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const built = (commit: string, dirty = false): BlazonIdentity => ({ commit, dirty, from: 'build' });

  it('has no pin of its own, so a book with no blazon.lock is not checked', () => {
    expect(fs.existsSync(path.join(FIXTURE, BLAZON_LOCK))).toBe(false);
    expect(blazonPinFindings(FIXTURE, null)).toEqual([]);
  });

  it('is met by the blazon that wrote the pin, and by no other, and never by a dirty or an unknown one', () => {
    const copy = copyProject(FIXTURE);
    expect(writeBlazonPin(copy, built(A))).toBe(A);
    expect(JSON.parse(fs.readFileSync(path.join(copy, BLAZON_LOCK), 'utf-8'))).toEqual({ v: 1, commit: A });
    expect(blazonPinFindings(copy, built(A))).toEqual([]);
    const codes = (identity: BlazonIdentity | null) => blazonPinFindings(copy, identity).map((f) => [f.code, f.severity, f.path]);
    expect(codes(built(B))).toEqual([['blazon-pin-mismatch', 'error', BLAZON_LOCK]]);
    expect(codes(built(A, true))).toEqual([['blazon-pin-mismatch', 'error', BLAZON_LOCK]]);
    expect(codes(null)).toEqual([['blazon-pin-mismatch', 'error', BLAZON_LOCK]]);
  });

  it('refuses a lock that is not { v: 1, commit: <40 hex digits> }, with a fixed fake hash', () => {
    const copy = copyProject(FIXTURE);
    fs.writeFileSync(path.join(copy, BLAZON_LOCK), `${JSON.stringify({ v: 1, commit: A.toUpperCase() })}\n`);
    expect(blazonPinFindings(copy, built(A)).map((f) => f.code)).toEqual(['blazon-pin-invalid']);
    fs.writeFileSync(path.join(copy, BLAZON_LOCK), `${JSON.stringify({ v: 1, commit: A, extra: true })}\n`);
    expect(blazonPinFindings(copy, built(A)).map((f) => f.code)).toEqual(['blazon-pin-invalid']);
  });
});
