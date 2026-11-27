import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../support/project';
import { parseArgs, loadMarkers, scanFiles, formatScan, checkAttestation, MarkersNotLoadedError } from '../../scripts/verify-release.mjs';

// The marker scan is the part of the release check that must never pass by checking nothing: on 2026-11-25 a scan that filtered the
// markers wrongly loaded zero of them and printed "0 hits". The markers here are made-up words.

function markerFile(content: unknown): string {
  const file = path.join(tempDir('blazon-markers-'), 'markers.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

describe('parseArgs', () => {
  it('reads a version and the --registry flag', () => {
    expect(parseArgs(['0.10.0'])).toEqual({ version: '0.10.0', registry: false });
    expect(parseArgs(['0.10.0', '--registry'])).toEqual({ version: '0.10.0', registry: true });
    expect(parseArgs(['--registry', '1.2.3-rc.1'])).toEqual({ version: '1.2.3-rc.1', registry: true });
  });

  it('refuses a missing version, a v prefix, a path-like version and an unknown flag', () => {
    expect(() => parseArgs([])).toThrow(/version/);
    expect(() => parseArgs(['v0.10.0'])).toThrow(/version/);
    expect(() => parseArgs(['../x'])).toThrow(/version/);
    expect(() => parseArgs(['0.10.0', '--nope'])).toThrow(/--nope/);
    expect(() => parseArgs(['0.10.0', '0.11.0'])).toThrow(/one version/);
  });
});

describe('loadMarkers', () => {
  it('fails, by name, when the file is missing', () => {
    expect(() => loadMarkers(path.join(tempDir(), 'none.json'))).toThrow(MarkersNotLoadedError);
  });

  it('fails when the file is not JSON', () => {
    expect(() => loadMarkers(markerFile('{not json'))).toThrow(MarkersNotLoadedError);
  });

  it('fails on an empty array', () => {
    expect(() => loadMarkers(markerFile([]))).toThrow(MarkersNotLoadedError);
    expect(() => loadMarkers(markerFile([]))).toThrow(/would check nothing/);
  });

  it('fails on an array of only one-character strings, blanks and non-strings', () => {
    expect(() => loadMarkers(markerFile(['a', 'b', ' c ', '  ', 7, null]))).toThrow(MarkersNotLoadedError);
  });

  it('collects strings from nested arrays and objects, trimmed, lower-cased, two characters or more', () => {
    const file = markerFile(['  Zorble  ', ['quux', ['Flux Cap', 'x']], { k: ['NESTED'] }, 'ok']);
    expect(loadMarkers(file).sort()).toEqual(['flux cap', 'nested', 'ok', 'quux', 'zorble']);
  });
});

describe('scanFiles', () => {
  const markers = ['zorble', 'quux'];

  it('counts hits in content and names, never returns marker text', () => {
    const files = [
      { path: 'package/a.txt', content: 'one ZORBLE here and zorble again' },
      { path: 'package/b.txt', content: 'clean' },
      { path: 'package/quux-notes.md', content: 'clean' },
    ];
    const result = scanFiles(files, markers);
    expect(result.contentHits).toBe(1);
    expect(result.nameHits).toBe(1);
    expect(result.contentFiles).toEqual(['package/a.txt']);
    // A file whose own name holds a marker is counted, never listed.
    expect(JSON.stringify(result)).not.toMatch(/quux|zorble/i);
  });

  it('prints counts and file names only: the output holds no marker text', () => {
    const files = [
      { path: 'package/a.txt', content: 'about zorble' },
      { path: 'package/quux.md', content: 'x' },
    ];
    const line = formatScan(scanFiles(files, markers));
    expect(line).toContain('package/a.txt');
    expect(line).not.toMatch(/zorble|quux/i);
  });

  it('reports zero hits for clean files', () => {
    const result = scanFiles([{ path: 'package/a.txt', content: 'fine' }], markers);
    expect(result.contentHits + result.nameHits).toBe(0);
  });

  it('refuses to scan with no markers', () => {
    expect(() => scanFiles([{ path: 'a', content: 'b' }], [])).toThrow(MarkersNotLoadedError);
  });

  it('reads Buffer content', () => {
    expect(scanFiles([{ path: 'a.bin', content: Buffer.from('xx zorble xx') }], markers).contentHits).toBe(1);
  });
});

describe('checkAttestation', () => {
  const commit = 'ef49ce548b15b197eb0d7259e77d35846145a47d';
  const cert = (over: Record<string, string> = {}) => [
    {
      verificationResult: {
        signature: {
          certificate: {
            buildSignerURI: 'https://github.com/iksnerd/blazon/.github/workflows/ci.yml@refs/tags/v0.10.0',
            sourceRepositoryRef: 'refs/tags/v0.10.0',
            sourceRepositoryDigest: commit,
            ...over,
          },
        },
      },
    },
  ];
  const want = { version: '0.10.0', commit };

  it('accepts the right workflow, ref and digest', () => {
    expect(checkAttestation(cert(), want)).toEqual({ ok: true });
  });

  it('refuses the wrong workflow', () => {
    const r = checkAttestation(cert({ buildSignerURI: 'https://github.com/iksnerd/blazon/.github/workflows/other.yml@refs/tags/v0.10.0' }), want);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/workflow/);
  });

  it('refuses the wrong ref', () => {
    const r = checkAttestation(
      cert({
        buildSignerURI: 'https://github.com/iksnerd/blazon/.github/workflows/ci.yml@refs/heads/main',
        sourceRepositoryRef: 'refs/heads/main',
      }),
      want,
    );
    expect(r.ok).toBe(false);
  });

  it('refuses the wrong digest', () => {
    const r = checkAttestation(cert({ sourceRepositoryDigest: '0'.repeat(40) }), want);
    expect(r.ok === false && r.reason).toMatch(/digest/);
  });

  it('refuses an empty list, a missing certificate and a missing digest', () => {
    expect(checkAttestation([], want).ok).toBe(false);
    expect(checkAttestation([{}], want).ok).toBe(false);
    expect(checkAttestation(cert({ sourceRepositoryDigest: '' }), want).ok).toBe(false);
    expect(checkAttestation('nope', want).ok).toBe(false);
  });
});
