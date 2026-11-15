import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { withoutCascade } from '../../../src/core/checker/cascade.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { loadConfig } from '../../../src/core/config/index.js';
import type { Finding } from '../../../src/types/index.js';
import { starterProject } from '../../support/project';

// A token file that does not parse holds tokens nobody can see. Every finding that says a token "does not exist" is then a guess, and
// one broken file used to produce a screenful of them. The broken file is the finding; what follows from it is left out until it is fixed.

const f = (code: string, over: Partial<Finding> = {}): Finding => ({ code, severity: 'error', path: 'x', message: 'm', ...over });
const broken = f('invalid-json', { path: 'tokens/colors.json' });

describe('withoutCascade', () => {
  it('leaves everything alone when every token file reads', () => {
    const all = [f('unresolved-alias'), f('theme-unresolved'), f('invalid-value', { message: '"{a.b}" is not a color' })];
    expect(withoutCascade(all)).toEqual(all);
  });

  it('drops what only says a token is missing once a token file is unreadable', () => {
    const kept = f('invalid-value', { message: '"nope" is not a color: write hex' });
    const other = f('starter-file', { severity: 'warning' });
    const result = withoutCascade([
      broken,
      f('unresolved-alias'),
      f('theme-unresolved'),
      f('invalid-value', { message: '"{rule.default}" is not a color: write hex' }),
      kept,
      other,
    ]);
    expect(result).toEqual([broken, kept, other]);
  });

  it('drops a page directive that names a token of the unread file, and a $type that file would have given, and keeps a directive wrong for another reason', () => {
    const wrongArgs = f('directive-invalid', { message: '<!-- blazon:tokens -->: needs at least one path' });
    const result = withoutCascade([
      broken,
      f('directive-invalid', { message: '<!-- blazon:tokens surface -->: no token at surface' }),
      f('missing-type', { context: 'theme=dark' }),
      wrongArgs,
    ]);
    expect(result).toEqual([broken, wrongArgs]);
  });
});

describe('compileBlazonData with a resolver and a broken token file', () => {
  it('reports the broken file with its line, and the other files still load', async () => {
    const root = await starterProject();
    const files = ['colors', 'form', 'social', 'spacing', 'typography'].map((name) => ({ $ref: `tokens/${name}.json` }));
    fs.writeFileSync(
      path.join(root, 'blazon.resolver.json'),
      JSON.stringify({ version: '2025.10', sets: { base: { sources: files } }, resolutionOrder: [{ $ref: '#/sets/base' }] }),
    );
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{ bad json');
    const data = await compileBlazonData(await loadConfig(root), root);
    const errors = data.findings.filter((x) => x.severity === 'error');
    expect(errors.map((x) => [x.code, x.path])).toEqual([['invalid-json', 'tokens/colors.json']]);
    expect(data.tokens.byPath.has('space.4')).toBe(true);
  }, 60_000);
});

describe('compileBlazonData with a broken token file', () => {
  it('reports the broken file and not the errors that follow from not reading it', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'tokens/colors.json'), '{ bad json');
    const codes = (await compileBlazonData(await loadConfig(root), root)).findings.map((x) => x.code);
    expect(codes).toContain('invalid-json');
    expect(codes).not.toContain('unresolved-alias');
    expect(codes).not.toContain('theme-unresolved');
  }, 60_000);
});
