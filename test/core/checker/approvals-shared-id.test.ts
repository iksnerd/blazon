import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { approvals } from '../../../src/core/checker/approvals.js';
import { assetFingerprint, assetSetFingerprint } from '../../../src/core/checker/review.js';
import { tempProject } from '../../support/project';

// RFC 0001 section 7 allows one name in two formats in one folder as one asset with one sidecar. The approval belongs to the id:
// one `review.value` is the fingerprint of all its files (section 2), so recording it makes every file pass, and a change to any file
// makes it stale once.

const SVG = '<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
/** The fingerprint of SVG as one file, computed with the code before an id could have a second file: a single-file id must keep it. */
const SVG_ALONE_BEFORE_THIS_CHANGE = 'c26a44619e15';

/** The smallest PNG header the scanner reads a size from; its bytes differ from the SVG's, so the fingerprints do. */
function png(): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(10, 16);
  b.writeUInt32BE(10, 20);
  return b;
}

/** `logos/mark.svg` and `logos/mark.png` with one sidecar that records `value`, when given, as the approved fingerprint. */
function markProject(value?: string, sidecar: Record<string, unknown> = {}): string {
  const root = tempProject({
    'assets/logos/mark.svg': SVG,
    'assets/logos/mark.json': { generated: { by: 'Acme image model' }, review: { status: 'ok', by: 'Acme design lead', at: '2026-11-21', ...(value && { value }) }, ...sidecar },
  });
  fs.writeFileSync(path.join(root, 'assets/logos/mark.png'), png());
  return root;
}

const compile = (root: string) => compileBlazonData(logoConfig(root), root);
/** What `blazon approvals` says the fingerprint of `logos/mark` is today. */
async function fingerprintOfMark(root: string): Promise<string | undefined> {
  const data = await compile(root);
  return approvals(data.tokens, data.assets.all, { assetsDir: path.join(root, 'assets'), dirs: {} }).find((a) => a.path === 'logos/mark')?.current;
}
const stale = async (root: string) => (await compile(root)).findings.filter((finding) => finding.code === 'approval-stale');

describe('one id in two formats (mark.svg and mark.png, one sidecar)', () => {
  it('is two records with one id, each with its own file hash, and one fingerprint for the id', async () => {
    const root = markProject();
    const marks = (await compile(root)).assets.logos.filter((asset) => asset.id === 'logos/mark');

    expect(marks.map((asset) => asset.format).sort()).toEqual(['png', 'svg']);
    expect(marks.map((asset) => asset.meta?.review?.status)).toEqual(['ok', 'ok']);
    expect(assetFingerprint(fs.readFileSync(path.join(root, 'assets/logos/mark.svg')))).not.toBe(assetFingerprint(fs.readFileSync(path.join(root, 'assets/logos/mark.png'))));
    const rows = approvals((await compile(root)).tokens, (await compile(root)).assets.all, { assetsDir: path.join(root, 'assets'), dirs: {} }).filter(
      (a) => a.path === 'logos/mark',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.files).toEqual(['mark.png', 'mark.svg']);
  });

  it('passes approval-stale for both files once the fingerprint of the id is recorded', async () => {
    const fingerprint = await fingerprintOfMark(markProject());
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(await stale(markProject(fingerprint))).toEqual([]);
  });

  it('is one approval-stale for the id when either file changes, naming the files', async () => {
    const fingerprint = await fingerprintOfMark(markProject());
    for (const file of ['mark.svg', 'mark.png']) {
      const root = markProject(fingerprint);
      fs.appendFileSync(path.join(root, 'assets/logos', file), file.endsWith('svg') ? '<!-- edited -->' : Buffer.from([0]));
      const found = await stale(root);
      expect(found, `${file} changed`).toHaveLength(1);
      expect(found[0]).toMatchObject({ path: 'logos/mark', file: 'assets/logos/mark.png' });
      expect(found[0]!.message, `${file} changed`).toContain('(mark.png, mark.svg)');
    }
  });

  it('changes the fingerprint when a file is removed, and an id with one file keeps the fingerprint it always had', async () => {
    const both = await fingerprintOfMark(markProject());
    const alone = markProject();
    fs.rmSync(path.join(alone, 'assets/logos/mark.png'));
    expect(await fingerprintOfMark(alone)).not.toBe(both);
    expect(await fingerprintOfMark(alone)).toBe(SVG_ALONE_BEFORE_THIS_CHANGE);
    expect(assetSetFingerprint([{ name: 'mark.svg', bytes: Buffer.from(SVG) }])).toBe(SVG_ALONE_BEFORE_THIS_CHANGE);
    // an approval recorded for the single file is still good for it
    expect(await stale(markProjectWithoutPng(SVG_ALONE_BEFORE_THIS_CHANGE))).toEqual([]);
  });

  it('reports asset-review-missing and review-pending once for the id, naming its files', async () => {
    const generated = (review?: unknown) => {
      const root = tempProject({ 'assets/logos/mark.svg': SVG, 'assets/logos/mark.json': { generated: { by: 'Acme image model' }, ...(review !== undefined && { review }) } });
      fs.writeFileSync(path.join(root, 'assets/logos/mark.png'), png());
      return root;
    };
    const missing = (await compile(generated())).findings.filter((f) => f.code === 'asset-review-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).toBe(
      'logos/mark (mark.png, mark.svg) was generated by Acme image model and nobody has confirmed it: set review.status to ok once a person has checked it',
    );
    const pending = (await compile(generated({ status: 'needs-review', note: 'Check the colors' }))).findings.filter((f) => f.code === 'review-pending');
    expect(pending).toHaveLength(1);
  });
});

function markProjectWithoutPng(value: string): string {
  const root = markProject(value);
  fs.rmSync(path.join(root, 'assets/logos/mark.png'));
  return root;
}
