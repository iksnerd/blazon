import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { assetFingerprint } from '../../../src/core/checker/review.js';
import { tempProject } from '../../support/project';

// RFC 0001 section 7 allows one name in two formats in one folder as one asset with one sidecar, and section 2 gives a sidecar one
// `review.value`, the fingerprint of one file's bytes. The test marked `it.fails` pins the defect where both meet: it is green
// while the defect exists and turns red when a fix makes it pass, at which point drop the `.fails`.

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

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
function markProject(value?: string): string {
  const root = tempProject({
    'assets/logos/mark.svg': SVG,
    'assets/logos/mark.json': { generated: { by: 'Acme image model' }, review: { status: 'ok', by: 'Acme design lead', at: '2026-11-21', ...(value && { value }) } },
  });
  fs.writeFileSync(path.join(root, 'assets/logos/mark.png'), png());
  return root;
}

const compile = (root: string) => compileBlazonData(logoConfig(root), root);
const fingerprintOf = (root: string, file: string) => assetFingerprint(fs.readFileSync(path.join(root, 'assets/logos', file)));

describe('one id in two formats (mark.svg and mark.png, one sidecar)', () => {
  it('is two records with one id, each with its own fingerprint, and one review.value to hold them', async () => {
    const root = markProject();
    const marks = (await compile(root)).assets.logos.filter((asset) => asset.id === 'logos/mark');

    expect(marks.map((asset) => asset.format).sort()).toEqual(['png', 'svg']);
    expect(marks.map((asset) => asset.meta?.review?.status)).toEqual(['ok', 'ok']);
    expect(fingerprintOf(root, 'mark.svg')).not.toBe(fingerprintOf(root, 'mark.png'));
  });

  it.fails('passes approval-stale for every file once the fingerprint is recorded, whichever file it was taken from', async () => {
    const bytes = markProject();
    for (const file of ['mark.svg', 'mark.png']) {
      const stale = (await compile(markProject(fingerprintOf(bytes, file)))).findings.filter((finding) => finding.code === 'approval-stale');
      expect(stale, `fingerprint taken from ${file}`).toEqual([]);
    }
  });
});
