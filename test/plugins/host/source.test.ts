import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SPEC } from '../support/spec.js';

// test/spec/ is a copy of the protocol's conformance corpus, made by scripts/vendor-spec-corpus.py. A file edited by hand
// would pass for the corpus's own text, so the copy records the commit it came from and a digest of its files.

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

describe('the vendored corpus', () => {
  const source = JSON.parse(fs.readFileSync(path.join(SPEC, 'SOURCE.json'), 'utf-8'));

  it('names the commit it came from and keeps no repository name', () => {
    expect(source).not.toHaveProperty('repo');
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(source.folders).toEqual(['corpus/core', 'corpus/tree-digest']);
    expect(source.single_files).toEqual(['LICENSE', 'NOTICE', 'schemas/draft/host-profile.schema.json', 'experiments/cue-host-profile/profile.cue']);
  });

  it('is exactly the files it recorded: no file edited, added or removed by hand', () => {
    const listed = files(SPEC)
      .filter((file) => path.basename(file) !== 'SOURCE.json')
      .map((file) => path.relative(SPEC, file).split(path.sep).join('/'))
      .sort();
    const lines = listed.map((file) => `${file} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(SPEC, file))).digest('hex')}\n`);
    expect(listed).toHaveLength(source.files);
    expect(`sha256:${crypto.createHash('sha256').update(lines.join('')).digest('hex')}`).toBe(source.digest);
  });
});
