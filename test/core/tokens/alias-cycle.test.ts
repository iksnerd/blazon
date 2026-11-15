import { describe, it, expect } from 'vitest';
import { Resolver } from '../../../src/core/tokens/alias.js';
import type { DeclaredToken } from '../../../src/core/tokens/walk.js';

const token = (path: string, rawValue: unknown): DeclaredToken => ({ path, file: 'tokens/a.json', rawValue, type: undefined, blazon: {} });

const report = (tokens: DeclaredToken[]) => {
  const resolver = new Resolver(tokens);
  for (const t of tokens) resolver.token(t.path);
  return resolver.problems.map((p) => `${p.path}: ${p.message}`);
};

describe('circular-alias', () => {
  it('is reported on the same token whichever token the walk starts from', () => {
    const a = token('a', '{b}');
    const b = token('b', '{a}');
    expect(report([a, b])).toEqual(['a: Alias {b} leads back to a']);
    expect(report([b, a])).toEqual(report([a, b]));
  });

  it('names the smallest member of a loop reached through a token outside it', () => {
    const tokens = [token('z', '{y}'), token('y', '{x}'), token('x', '{y}'), token('c', '{z}')];
    const expected = ['x: Alias {y} leads back to x'];
    expect(report(tokens)).toEqual(expected);
    expect(report([...tokens].reverse())).toEqual(expected);
  });

  it('is one report for a token that aliases itself', () => {
    expect(report([token('s', '{s}')])).toEqual(['s: Alias {s} leads back to s']);
  });
});
