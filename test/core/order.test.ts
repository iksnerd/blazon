import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeFindings } from '../../src/core/checker/index.js';
import { compareFindings, compareText } from '../../src/core/order.js';
import type { Finding } from '../../src/types/index.js';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { buildBrandExport } from '../../src/core/brand/export.js';
import { REPO } from '../support/paths';

const base: Finding = { code: 'b', severity: 'warning', path: 'p', message: 'm' };
const sample: Finding[] = [
  { ...base, severity: 'info' },
  { ...base, severity: 'error', path: 'z' },
  { ...base, severity: 'error', path: 'a', code: 'y' },
  { ...base, severity: 'error', path: 'a', code: 'x', context: 'locale=ja' },
  { ...base, severity: 'error', path: 'a', code: 'x' },
  { ...base, severity: 'error', path: 'a', code: 'x', file: 'tokens/b.json', line: 9 },
  { ...base, severity: 'error', path: 'a', code: 'x', file: 'tokens/b.json', line: 10 },
  { ...base, severity: 'error', path: 'a', code: 'x', file: 'tokens/b.json' },
  { ...base, severity: 'error', path: 'a', code: 'x', message: 'n' },
  { ...base, severity: 'warning', path: 'ü' },
  { ...base, severity: 'warning', path: 'z' },
  { ...base, severity: 'warning', path: 'Z' },
];

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('compareFindings', () => {
  it('sorts any permutation of the findings to the same list', () => {
    const expected = [...sample].sort(compareFindings);
    for (let seed = 1; seed <= 50; seed++) {
      expect(shuffled(sample, seed).sort(compareFindings)).toEqual(expected);
      expect(summarizeFindings(shuffled(sample, seed)).all).toEqual(expected);
    }
  });

  it('orders by severity, path, code, context, file, line, message, a missing field first', () => {
    const sorted = [...sample].sort(compareFindings);
    expect(sorted.map((f) => `${f.severity}:${f.path}:${f.code}:${f.context ?? ''}:${f.file ?? ''}:${f.line ?? ''}:${f.message}`)).toEqual([
      'error:a:x::::m',
      'error:a:x::::n',
      'error:a:x::tokens/b.json::m',
      'error:a:x::tokens/b.json:9:m',
      'error:a:x::tokens/b.json:10:m',
      'error:a:x:locale=ja:::m',
      'error:a:y::::m',
      'error:z:b::::m',
      'warning:Z:b::::m',
      'warning:z:b::::m',
      'warning:ü:b::::m',
      'info:p:b::::m',
    ]);
  });

  it('does not depend on the locale: non-ASCII paths compare by code unit', () => {
    // localeCompare puts "é" before "f" in most locales; by code unit "é" (U+00E9) comes after "f"
    expect(compareText('é', 'f')).toBe(1);
    expect(compareText('Z', 'a')).toBe(-1);
    const a: Finding = { ...base, path: 'é' };
    const b: Finding = { ...base, path: 'f' };
    expect(compareFindings(a, b)).toBe(1);
    expect(compareFindings(b, a)).toBe(-1);
    expect(compareFindings(a, { ...a })).toBe(0);
  });
});

describe('src/core', () => {
  it('has no localeCompare, which depends on the host locale', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('localeCompare')) hits.push(file);
      }
    };
    walk(path.resolve(__dirname, '../../src/core'));
    expect(hits).toEqual([]);
  });
});

describe('compiled and exported findings', () => {
  const sorted = (found: Finding[]) => [...found].sort(compareFindings);

  it('come out in the total order, so an info never precedes a warning', async () => {
    const root = path.join(REPO, 'examples/conformance');
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    expect(data.findings.length).toBeGreaterThan(1);
    expect(data.findings).toEqual(sorted(data.findings));
  });

  it('are ordered in brand.json even when a plugin appended them after the compile', async () => {
    const root = path.join(REPO, 'examples/conformance');
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    data.findings.push({ code: 'zz-plugin', severity: 'error', path: 'a', message: 'from a plugin' });
    const exported = buildBrandExport(data, config, root);
    expect(exported.findings).toEqual(sorted(exported.findings));
    expect(exported.findings[0]?.code).toBe('zz-plugin');
  });
});
