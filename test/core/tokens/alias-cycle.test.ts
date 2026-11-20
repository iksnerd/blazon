import { describe, it, expect } from 'vitest';
import { Resolver } from '../../../src/core/tokens/alias.js';
import type { DeclaredToken } from '../../../src/core/tokens/walk.js';

const token = (path: string, rawValue: unknown): DeclaredToken => ({ path, file: 'tokens/a.json', rawValue, type: undefined, blazon: {} });

const report = (tokens: DeclaredToken[]) => {
  const resolver = new Resolver(tokens);
  for (const t of tokens) resolver.token(t.path);
  return resolver.problems.map((p) => `${p.path}: ${p.message}`);
};

describe('alias-circular', () => {
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

  it('is reported once, on the smallest member, for a 3-token loop from any start', () => {
    const tokens = [token('c', '{a}'), token('b', '{c}'), token('a', '{b}')];
    const expected = ['a: Alias {b} leads back to a'];
    expect(report(tokens)).toEqual(expected);
    expect(report([...tokens].reverse())).toEqual(expected);
  });

  it('is not reported for a plain chain, and every link resolves to the end value', () => {
    const tokens = [token('a', '{b}'), token('b', '{c}'), token('c', '#fff')];
    const resolver = new Resolver(tokens);
    expect(resolver.token('a')).toBe('#fff');
    expect(resolver.token('b')).toBe('#fff');
    expect(resolver.problems).toEqual([]);
  });

  it('is not reported twice when a looping token is resolved twice', () => {
    const resolver = new Resolver([token('a', '{b}'), token('b', '{a}')]);
    resolver.token('a');
    resolver.token('a');
    expect(resolver.problems).toHaveLength(1);
  });
});

describe('typeOf', () => {
  const typed = (path: string, rawValue: unknown, type: DeclaredToken['type']): DeclaredToken => ({ ...token(path, rawValue), type });

  it('follows an alias chain to the first declared type', () => {
    const tokens = [token('a', '{b}'), token('b', '{c}'), typed('c', '#fff', 'color')];
    expect(new Resolver(tokens).typeOf(tokens[0]!)).toBe('color');
  });

  it('gives undefined for a 3-token loop, a self alias and a broken link', () => {
    const tokens = [token('a', '{b}'), token('b', '{c}'), token('c', '{a}'), token('s', '{s}'), token('u', '{missing}')];
    const resolver = new Resolver(tokens);
    for (const t of tokens) expect(resolver.typeOf(t)).toBeUndefined();
  });
});
