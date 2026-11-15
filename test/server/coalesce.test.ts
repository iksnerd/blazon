import { describe, it, expect, vi, afterEach } from 'vitest';
import { coalesce } from '../../src/server/coalesce.js';

// A burst of file events (a git checkout, a formatter) is one change to the brand: the dev server compiles and sends one update for it.

afterEach(() => vi.useRealTimers());

describe('coalesce', () => {
  it('calls the handler once, with everything added, a delay after the last addition', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => void seen.push(items),
      () => {},
    );
    burst.add('a');
    burst.add('b');
    burst.add('c');
    await vi.advanceTimersByTimeAsync(74);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([['a', 'b', 'c']]);
  });

  it('starts the delay again at each addition, so a burst that goes on is one call', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => void seen.push(items),
      () => {},
    );
    burst.add('a');
    await vi.advanceTimersByTimeAsync(50);
    burst.add('b');
    await vi.advanceTimersByTimeAsync(50);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(25);
    expect(seen).toEqual([['a', 'b']]);
  });

  it('calls the handler for a single addition, once the delay has passed', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => void seen.push(items),
      () => {},
    );
    burst.add('only');
    await vi.advanceTimersByTimeAsync(75);
    expect(seen).toEqual([['only']]);
  });

  it('collapses the same item added twice, and calls again for a later burst', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => void seen.push(items),
      () => {},
    );
    burst.add('a');
    burst.add('a');
    await vi.advanceTimersByTimeAsync(75);
    burst.add('b');
    await vi.advanceTimersByTimeAsync(75);
    expect(seen).toEqual([['a'], ['b']]);
  });

  it('runs one handler at a time: a burst that ends while the last is still running waits for it', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let release: () => void = () => {};
    const burst = coalesce<string>(
      75,
      (items) => {
        order.push(`start ${items.join()}`);
        if (items[0] === 'first') return new Promise<void>((resolve) => (release = resolve)).then(() => void order.push('end first'));
        order.push('end second');
      },
      () => {},
    );
    burst.add('first');
    await vi.advanceTimersByTimeAsync(75);
    burst.add('second');
    await vi.advanceTimersByTimeAsync(75);
    expect(order).toEqual(['start first']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['start first', 'end first', 'start second', 'end second']);
  });

  it('says a failing handler to onError and still runs the next burst', async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => {
        if (items[0] === 'bad') throw new Error('compile failed');
        seen.push(items);
      },
      (error) => errors.push(error),
    );
    burst.add('bad');
    await vi.advanceTimersByTimeAsync(75);
    burst.add('good');
    await vi.advanceTimersByTimeAsync(75);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('compile failed');
    expect(seen).toEqual([['good']]);
  });

  it('drops what is waiting when it is cancelled, as the server does when it closes', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const burst = coalesce<string>(
      75,
      (items) => void seen.push(items),
      () => {},
    );
    burst.add('a');
    burst.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toEqual([]);
  });
});
