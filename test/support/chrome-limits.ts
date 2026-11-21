import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// How many Chromes a test run may have alive at once, and how long one may take. A Chrome start uses most of a core, and vitest runs
// files in parallel, so on a loaded machine several at once make every test slower and then fail on its time limit. The numbers are here
// and nowhere else.

function positive(text: string | undefined, fallback: number): number {
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Test files that hold a Chrome slot at the same time, across every vitest worker and every vitest run on this machine. BLAZON_CHROME_SLOTS overrides. */
export const CHROME_SLOTS = positive(process.env.BLAZON_CHROME_SLOTS, 2);
/** One Chrome start. Playwright's own default is the same 30 s; it is set so that it is written down. A start that takes longer throws and Playwright kills it. */
export const CHROME_LAUNCH_TIMEOUT_MS = 30_000;
/** How long a file waits for a free slot before it fails saying so, and not hangs: more than the longest file, less than a stuck run is worth. */
export const SLOT_WAIT_MS = 15 * 60_000;
/** A slot held longer than this, or by a process that is gone, is taken over. A file runs in well under this, even on a loaded machine. */
export const SLOT_STALE_MS = 20 * 60_000;
/** Closing what a file left open, at the end of it. */
export const CLOSE_TIMEOUT_MS = 15_000;

export interface SlotOptions {
  /** Where the slots are: one folder each. Default: a folder of this user under the OS temp folder, shared by every run. */
  dir?: string;
  limit?: number;
  waitMs?: number;
  staleMs?: number;
  pollMs?: number;
  /** Whether a process is still there (a fake in a test). */
  alive?: (pid: number) => boolean;
  now?: () => number;
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

export const defaultSlotDir = (): string => path.join(os.tmpdir(), `blazon-chrome-slots-${os.userInfo().uid}`);

/**
 * Takes one of `limit` slots and resolves with the function that gives it back; waits, polling, while all are taken, and rejects after
 * `waitMs`. A slot is a folder made with mkdir, which either makes it or fails whoever asks at the same time, so no two holders share one.
 * A slot whose owner process is gone, or that is older than `staleMs`, is taken over, so a killed run never blocks the next.
 */
export async function acquireSlot(options: SlotOptions = {}): Promise<() => void> {
  const { dir = defaultSlotDir(), limit = CHROME_SLOTS, waitMs = SLOT_WAIT_MS, staleMs = SLOT_STALE_MS, pollMs = 250, alive = isAlive, now = Date.now } = options;
  fs.mkdirSync(dir, { recursive: true });
  const started = now();
  for (;;) {
    for (let i = 0; i < limit; i++) {
      const slot = path.join(dir, `slot-${i}`);
      const give = () => fs.rmSync(slot, { recursive: true, force: true });
      if (take(slot)) return give;
      if (isStale(slot, staleMs, alive, now())) {
        // Rename first: of two runs that find the same stale slot only one rename succeeds, and the other does not remove the new owner's
        const old = `${slot}.stale-${process.pid}-${now()}`;
        try {
          fs.renameSync(slot, old);
          fs.rmSync(old, { recursive: true, force: true });
        } catch {
          // another run took it over first
        }
        if (take(slot)) return give;
      }
    }
    if (now() - started > waitMs) {
      throw new Error(`no Chrome slot in ${Math.round(waitMs / 1000)}s: ${limit} are held (${dir}); a run that holds one may be stuck, or set BLAZON_CHROME_SLOTS`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function take(slot: string): boolean {
  try {
    fs.mkdirSync(slot);
  } catch {
    return false;
  }
  fs.writeFileSync(path.join(slot, 'owner'), String(process.pid));
  return true;
}

function isStale(slot: string, staleMs: number, alive: (pid: number) => boolean, at: number): boolean {
  try {
    const age = at - fs.statSync(slot).mtimeMs;
    if (age > staleMs) return true;
    const pid = Number(fs.readFileSync(path.join(slot, 'owner'), 'utf-8'));
    return Number.isInteger(pid) && pid > 0 && !alive(pid);
  } catch {
    // no owner file yet: it is being made; a slot that is gone is not stale, the next round takes it
    return false;
  }
}
