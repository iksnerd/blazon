/**
 * Gathers what is added to it and calls `handler` once with all of it, `delayMs` after the last addition. A save is one file event and a `git
 * checkout` is dozens, and each used to compile the brand and send an update of its own; a burst is now one change. The handlers run one at a
 * time, in order, so a burst that ends while the last compile is still running waits for it and does not race it. A failure is passed to
 * `onError` and does not stop the next burst.
 */
export function coalesce<T>(delayMs: number, handler: (items: T[]) => Promise<void> | void, onError: (error: unknown) => void) {
  let pending = new Set<T>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const flush = () => {
    const items = [...pending];
    pending = new Set();
    timer = undefined;
    running = running.then(() => handler(items)).catch(onError);
  };

  return {
    add(item: T): void {
      pending.add(item);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
      // A timer waiting for a burst to end must not keep a process alive
      timer.unref?.();
    },
    /** Drops what is waiting. A handler that is already running finishes. */
    cancel(): void {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = new Set();
    },
  };
}
