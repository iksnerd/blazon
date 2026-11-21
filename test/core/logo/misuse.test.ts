import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MISUSE_KINDS, MISUSE_KINDS, misuseCaption, resolveMisuse } from '../../../src/core/logo/misuse.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { logoConfig } from '../../support/helpers.js';
import { tempDir } from '../../support/project';

// The misuse figures of a logo (RFC 0001 §10): which kinds are drawn, from the directive, the sidecar or the default six.

describe('resolveMisuse', () => {
  it('has a closed set of nine kinds and a default of six', () => {
    expect([...MISUSE_KINDS]).toEqual(['stretch', 'squash', 'rotate', 'outline', 'recolor', 'shadow', 'crop', 'low-contrast', 'busy-background']);
    expect([...DEFAULT_MISUSE_KINDS]).toEqual(['stretch', 'rotate', 'outline', 'recolor', 'shadow', 'low-contrast']);
  });
  it('uses the default set when neither the directive nor the sidecar names kinds', () => {
    expect(resolveMisuse([], undefined)).toEqual({ kinds: [...DEFAULT_MISUSE_KINDS], unknown: [] });
  });
  it('uses the sidecar list when the directive names none', () => {
    expect(resolveMisuse([], ['crop', 'squash']).kinds).toEqual(['crop', 'squash']);
  });
  it('lets the directive override the sidecar', () => {
    expect(resolveMisuse(['rotate', 'stretch'], ['crop']).kinds).toEqual(['rotate', 'stretch']);
  });
  it('reports an unknown kind and drops it', () => {
    expect(resolveMisuse(['stretch', 'melt'], undefined)).toEqual({ kinds: ['stretch'], unknown: ['melt'] });
  });
  it('names a kind once and writes the caption in plain words', () => {
    expect(resolveMisuse(['stretch', 'stretch'], undefined).kinds).toEqual(['stretch']);
    expect(misuseCaption('stretch')).toBe('Do not stretch the logo');
  });
});

const SVG = '<svg viewBox="0 0 100 40" width="100" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40"/></svg>';
function project(sidecar: unknown): string {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'assets/logos'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/logos/mark.svg'), SVG);
  fs.writeFileSync(path.join(root, 'assets/logos/mark.json'), JSON.stringify(sidecar));
  return root;
}
const compile = (root: string) => compileBlazonData(logoConfig(root), root);

describe('the sidecar misuse field', () => {
  it('reads a list of kinds', async () => {
    const data = await compile(project({ misuse: ['stretch', 'crop'] }));
    expect(data.assets.logos[0]!.meta!.misuse).toEqual(['stretch', 'crop']);
    expect(data.findings.filter((f) => f.code.startsWith('asset-'))).toEqual([]);
  });
  it('reports an unknown kind as asset-misuse-unknown, listing the allowed kinds, and keeps the known ones', async () => {
    const data = await compile(project({ misuse: ['stretch', 'melt'] }));
    const found = data.findings.filter((f) => f.code === 'asset-misuse-unknown');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'logos/mark.json' });
    expect(found[0]!.message).toContain('melt');
    for (const kind of MISUSE_KINDS) expect(found[0]!.message).toContain(kind);
    expect(data.assets.logos[0]!.meta!.misuse).toEqual(['stretch']);
  });
  it('rejects a misuse that is not a list as an invalid sidecar', async () => {
    const data = await compile(project({ misuse: 'stretch' }));
    expect(data.findings.some((f) => f.code === 'asset-sidecar-invalid' && /misuse/.test(f.message))).toBe(true);
  });
});
