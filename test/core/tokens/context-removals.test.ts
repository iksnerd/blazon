import { describe, it, expect } from 'vitest';
import { contextGroups, contextItems, contextRemovals } from '../../../src/core/tokens/contexts.js';
import type { GroupMeta, TokenItem } from '../../../src/types/index.js';

// A context is stored as its changes, and a change can also be a removal: a token the default has and the context does not, a group that
// carries rules in the default and none in the context.

const token = (path: string, value = '#000'): TokenItem =>
  ({
    path,
    group: path.split('.')[0]!,
    name: path.split('.').pop()!,
    file: 'a.json',
    rawValue: value,
    resolvedValue: value,
    value,
    type: 'color',
    blazon: {},
    cssVariable: `--${path}`,
  }) as TokenItem;
const group = (path: string, description?: string, pairs?: unknown[]): GroupMeta => ({ path, ...(description && { description }), blazon: pairs ? { pairs } : {} }) as GroupMeta;

const base = { items: [token('color.ink'), token('color.paper'), token('color.accent')], groupMeta: [group('color', 'Acme colors'), group('space', 'Acme spacing')] };

describe('contextRemovals', () => {
  it('lists the default tokens the context lacks, sorted, and nothing when it lacks none', () => {
    expect(contextRemovals(base, { items: [token('color.paper')], groupMeta: base.groupMeta })).toEqual({ removed: ['color.accent', 'color.ink'] });
    expect(contextRemovals(base, base)).toEqual({});
  });

  it('does not list a token only the context has', () => {
    expect(contextRemovals(base, { items: [...base.items, token('color.extra')], groupMeta: base.groupMeta })).toEqual({});
  });

  it('lists a group whose description or rules differ as the context whole record, and a group only the context has', () => {
    const pairs = [{ fg: '{color.ink}', bg: '{color.paper}', min: 'AAA' }];
    const context = { items: base.items, groupMeta: [group('color', 'Acme dark colors', pairs), group('space', 'Acme spacing'), group('radius', 'Acme radii')] };
    expect(contextRemovals(base, context)).toEqual({ groupChanges: [group('color', 'Acme dark colors', pairs), group('radius', 'Acme radii')] });
  });

  it('lists the default groups that carry no description or rules in the context, sorted', () => {
    expect(contextRemovals(base, { items: base.items, groupMeta: [] })).toEqual({ removedGroups: ['color', 'space'] });
  });
});

describe('contextItems with removed, and contextGroups', () => {
  it('leaves a removed token out, keeps the order of the rest, and lets removal win over another context changing it', () => {
    expect(contextItems(base.items, [{ tokens: [], removed: ['color.paper'] }]).map((t) => t.path)).toEqual(['color.ink', 'color.accent']);
    const both = contextItems(base.items, [{ tokens: [token('color.paper', '#fff')] }, { tokens: [], removed: ['color.paper'] }]);
    expect(both.map((t) => t.path)).toEqual(['color.ink', 'color.accent']);
  });

  it('puts a changed group in the default place, adds a new one and drops a removed one', () => {
    const changed = group('color', 'Acme dark colors');
    const out = contextGroups(base.groupMeta, [{ groupChanges: [changed, group('radius', 'Acme radii')], removedGroups: ['space'] }]);
    expect(out).toEqual([changed, group('radius', 'Acme radii')]);
    expect(contextGroups(base.groupMeta, [])).toEqual(base.groupMeta);
  });
});
