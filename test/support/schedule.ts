// The order a run hands its test files to the workers in. A file on test/browser-tests.txt waits in its worker for one of the few Chrome
// slots (test/support/browser-setup.ts), and a worker that waits runs nothing else. Vitest's own order is the longest file first, which puts
// the Chrome files, the longest ones, at the front: with four workers and two slots, two workers then sat waiting for minutes. This order
// plays the run through with the expected durations and hands a free worker a Chrome file only when a slot is free then, else the next other
// file, so the slots are busy from the start and no worker is expected to wait. It changes only the order: every file still runs once.

export interface Planned<T> {
  item: T;
  /** Expected duration in ms (from the last run); only the order depends on it */
  duration: number;
  chrome: boolean;
}

/**
 * The items in the order to hand them out, for `workers` workers and `slots` Chrome slots. Within the Chrome files and within the others the
 * order given is kept (vitest's: failed first, then longest first), so only how the two kinds interleave changes.
 */
export function slotAwareOrder<T>(planned: readonly Planned<T>[], workers: number, slots: number): T[] {
  const chrome = planned.filter((p) => p.chrome);
  const other = planned.filter((p) => !p.chrome);
  const free = Array.from({ length: Math.max(1, workers) }, () => 0);
  const slotFree = Array.from({ length: Math.max(1, slots) }, () => 0);
  const order: T[] = [];
  const earliest = (times: number[]): number => times.indexOf(Math.min(...times));
  while (chrome.length > 0 || other.length > 0) {
    const w = earliest(free);
    const s = earliest(slotFree);
    const now = free[w]!;
    if (chrome.length > 0 && (slotFree[s]! <= now || other.length === 0)) {
      const next = chrome.shift()!;
      const start = Math.max(now, slotFree[s]!);
      slotFree[s] = free[w] = start + next.duration;
      order.push(next.item);
    } else {
      const next = other.shift()!;
      free[w] = now + next.duration;
      order.push(next.item);
    }
  }
  return order;
}

/** A duration for each item: its own when known, else the mean of the known ones of its kind, else `fallback` ms. */
export function withEstimates<T>(items: readonly { item: T; duration: number | undefined; chrome: boolean }[], fallback = 1000): Planned<T>[] {
  const mean = (chrome: boolean): number => {
    const known = items.filter((i) => i.chrome === chrome && i.duration !== undefined).map((i) => i.duration!);
    return known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : fallback;
  };
  const means = { true: mean(true), false: mean(false) };
  return items.map((i) => ({ item: i.item, chrome: i.chrome, duration: i.duration ?? means[`${i.chrome}`] }));
}
