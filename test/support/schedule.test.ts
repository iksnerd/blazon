import { describe, expect, it } from 'vitest';
import { slotAwareOrder, withEstimates, type Planned } from './schedule';

const file = (name: string, duration: number, chrome = false): Planned<string> => ({ item: name, duration, chrome });

/** Plays an order through as vitest hands it out: the next file to the first free worker, and a Chrome file waits there for a slot. */
function play(order: string[], planned: Planned<string>[], workers: number, slots: number): { end: number; waited: number } {
  const byName = new Map(planned.map((p) => [p.item, p]));
  const free = Array.from({ length: workers }, () => 0);
  const slotFree = Array.from({ length: slots }, () => 0);
  let waited = 0;
  for (const name of order) {
    const p = byName.get(name)!;
    const w = free.indexOf(Math.min(...free));
    let start = free[w]!;
    if (p.chrome) {
      const s = slotFree.indexOf(Math.min(...slotFree));
      waited += Math.max(0, slotFree[s]! - start);
      start = Math.max(start, slotFree[s]!);
      slotFree[s] = start + p.duration;
    }
    free[w] = start + p.duration;
  }
  return { end: Math.max(...free), waited };
}

describe('the order the test files are handed out in', () => {
  // Vitest's own order: the longest first, and the Chrome files are the longest
  const planned = [file('c1', 160, true), file('c2', 110, true), file('c3', 95, true), file('c4', 88, true), ...Array.from({ length: 40 }, (_, i) => file(`o${i}`, 20))];

  it('hands out every file once, and keeps the order within each kind', () => {
    const order = slotAwareOrder(planned, 4, 2);
    expect([...order].sort()).toEqual(planned.map((p) => p.item).sort());
    expect(order.filter((n) => n.startsWith('c'))).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(order.filter((n) => n.startsWith('o'))).toEqual(planned.filter((p) => !p.chrome).map((p) => p.item));
  });

  it('keeps the slots busy without a worker waiting, where the longest-first order makes two of four wait', () => {
    const vitest = play(
      planned.map((p) => p.item),
      planned,
      4,
      2,
    );
    const ours = play(slotAwareOrder(planned, 4, 2), planned, 4, 2);
    expect(vitest.waited).toBeGreaterThan(0);
    expect(ours.waited).toBe(0);
    expect(ours.end).toBeLessThan(vitest.end);
  });

  it('runs the Chrome files one after another when there are no others, and works with one worker', () => {
    expect(slotAwareOrder([file('c1', 5, true), file('c2', 9, true)], 4, 2)).toEqual(['c1', 'c2']);
    expect(slotAwareOrder([file('o1', 1), file('c1', 5, true), file('o2', 1)], 1, 2)).toEqual(['c1', 'o1', 'o2']);
    expect(slotAwareOrder([], 4, 2)).toEqual([]);
  });

  it('gives a file with no duration from the last run the mean of its kind, and a default when its kind has none', () => {
    const estimated = withEstimates([
      { item: 'a', duration: 10, chrome: true },
      { item: 'b', duration: 30, chrome: true },
      { item: 'c', duration: undefined, chrome: true },
      { item: 'd', duration: undefined, chrome: false },
    ]);
    expect(estimated.map((p) => p.duration)).toEqual([10, 30, 20, 1000]);
  });
});
