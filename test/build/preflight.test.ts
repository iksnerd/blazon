import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../support/project';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData, emitTokenOutputs, writeBlockers } from '../../src/core/index.js';
import { buildSite } from '../../src/builder/site-builder.js';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { writeProject } from '../support/helpers.js';

// What stops blazon writing, asked by the commands and by buildSite and emitTokenOutputs themselves, so that calling them from code gives
// the refusals `blazon build` gives: an output folder in the way of an input, a pin that is not met, and errors in the brand.

describe('what stops a write', () => {
  let project: string;
  const dist = (...parts: string[]) => path.join(project, 'dist', ...parts);

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  /** The starter's data with one token spoiled: an error `blazon check` would fail on. */
  const broken = async () => {
    const colors = path.join(project, 'tokens/colors.json');
    const original = fs.readFileSync(colors, 'utf-8');
    const text = original.replace(/"\$value": "#[0-9a-fA-F]{6}"/, '"$value": "notacolor"');
    expect(text).not.toBe(original);
    fs.writeFileSync(colors, text);
    try {
      return { data: await compileBlazonData(await loadConfig(project), project) };
    } finally {
      fs.writeFileSync(colors, original);
    }
  };

  it('is nothing for a brand that checks out', async () => {
    const config = await loadConfig(project);
    const data = await compileBlazonData(config, project);
    expect(data.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(writeBlockers(data, config, project)).toEqual([]);
  });

  it('is an error in the brand: buildSite and emitTokenOutputs write nothing and say what is wrong', async () => {
    const { data } = await broken();
    const config = await loadConfig(project);
    await expect(buildSite(config, project, { data })).rejects.toThrow(/the brand has \d+ errors?, so nothing is written: invalid-value/);
    await expect(emitTokenOutputs(data, config, project)).rejects.toThrow(/so nothing is written/);
    expect(fs.existsSync(dist())).toBe(false);
  });

  it('lets a caller who knows it is building a broken brand do so', async () => {
    const { data } = await broken();
    const config = await loadConfig(project);
    await buildSite(config, project, { data, allowErrors: true });
    expect(fs.existsSync(dist('site/index.html'))).toBe(true);
    expect(fs.existsSync(dist('tokens/theme.css'))).toBe(true);
    fs.rmSync(dist(), { recursive: true, force: true });
  });

  it('is a pin that is not met, which allowErrors does not lift', async () => {
    const config = await loadConfig(project);
    const data = await compileBlazonData(config, project);
    fs.writeFileSync(path.join(project, 'blazon.lock'), `{\n  "v": 1,\n  "commit": "${'a'.repeat(40)}"\n}\n`);
    try {
      await expect(buildSite(config, project, { data })).rejects.toThrow(/blazon-pin-mismatch/);
      await expect(buildSite(config, project, { data, allowErrors: true })).rejects.toThrow(/blazon-pin-mismatch/);
      await expect(emitTokenOutputs(data, config, project, { allowErrors: true })).rejects.toThrow(/blazon-pin-mismatch/);
      expect(fs.existsSync(dist())).toBe(false);
    } finally {
      fs.rmSync(path.join(project, 'blazon.lock'), { force: true });
    }
  });

  it('is an output folder in the way of an input, which allowErrors does not lift either, and which is named once beside the other reasons', async () => {
    const { data } = await broken();
    const config = { ...(await loadConfig(project)), outDir: './docs' };
    const blockers = writeBlockers(data, config, project);
    expect(blockers).toHaveLength(2);
    expect(blockers[0]).toMatch(/outDir[^]*docsDir/);
    expect(blockers[1]).toMatch(/so nothing is written/);
    expect(writeBlockers(data, config, project, { allowErrors: true })).toHaveLength(1);
    await expect(buildSite(config, project, { data, allowErrors: true })).rejects.toThrow(/docsDir/);
    expect(fs.existsSync(path.join(project, 'docs/01-principles.md'))).toBe(true);
  });

  it('names the first five errors and counts the rest', async () => {
    const config = await loadConfig(project);
    const data = await compileBlazonData(config, project);
    const many = { ...data, findings: Array.from({ length: 8 }, (_, i) => ({ code: 'x', severity: 'error' as const, path: `p${i}`, message: 'bad' })) };
    const [blocker] = writeBlockers(many, config, project);
    expect(blocker).toContain('the brand has 8 errors');
    expect(blocker).toContain('x (p4): bad');
    expect(blocker).not.toContain('p5');
    expect(blocker).toMatch(/and 3 more$/);
  });
});

describe('a refusal comes before anything is deleted', () => {
  it('buildSite keeps the old site when the token outputs would overwrite an input', async () => {
    const dark = { color: { paper: { $value: '#111111' } } };
    const root = writeProject({
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/base.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'extras/tokens.theme.dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      'tokens/base.json': { color: { $type: 'color', ink: { $value: '#000000' }, paper: { $value: '#ffffff' } } },
      'extras/tokens.theme.dark.json': dark,
      'site-out/previous.txt': 'the site that is there now',
    });
    const config = { ...DEFAULT_CONFIG, tokensOutDir: './extras', outDir: './site-out' };
    const data = await compileBlazonData(config, root);
    await expect(buildSite(config, root, { data, allowErrors: true })).rejects.toThrow(/written over/);
    expect(fs.readFileSync(path.join(root, 'site-out/previous.txt'), 'utf-8')).toBe('the site that is there now');
  });
});
