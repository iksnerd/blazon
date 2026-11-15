import { Breaker, DEFAULT_THRESHOLD } from './breaker.js';

// What stops a plugin that keeps breaking (RFC 0005 section 7). A command has a unit of work, one run, and
// uses a breaker for each plugin, and a call that exits 2 counts as a break for it. The dev server has no such unit and uses a
// cooldown instead, which does not rest a plugin for exit 2: its message asks for a change the next save may make. Either way an
// answer that was stopped is reported as a break by the caller, never as a pass.

export interface Gate {
  /** Why a call to this plugin must not start, or undefined when it may. */
  stopped(name: string): string | undefined;
  /** Note how a call that did start ended: an answer, a break, or exit 2 (the plugin could not answer). */
  record(name: string, ended: Ended): void;
}

/** How a call ended, for a gate: `exit-2` is a plugin that said it could not answer (RFC 0005 section 7). */
export type Ended = 'answer' | 'break' | 'exit-2';

/** Three breaks in a row stop a plugin for the rest of the run; exit 2 counts as a break. */
export class RunBreakers implements Gate {
  private readonly breakers = new Map<string, Breaker>();

  private breaker(name: string): Breaker {
    const found = this.breakers.get(name) ?? new Breaker(DEFAULT_THRESHOLD);
    this.breakers.set(name, found);
    return found;
  }

  stopped(name: string): string | undefined {
    return this.breaker(name).open ? `stopped for the rest of this run after ${DEFAULT_THRESHOLD} breaks in a row` : undefined;
  }

  record(name: string, ended: Ended): void {
    this.breaker(name).record(ended !== 'answer');
  }
}

/** The dev server's cooldown: a plugin that broke is not started again until `ms` after its latest break. */
export const DEV_COOLDOWN_MS = 30_000;

export class Cooldown implements Gate {
  private readonly until = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ms: number = DEV_COOLDOWN_MS
  ) {}

  stopped(name: string): string | undefined {
    const left = (this.until.get(name) ?? 0) - this.now();
    if (left <= 0) return undefined;
    const seconds = Math.ceil(left / 1000);
    return `stopped after a break, and runs again in ${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  record(name: string, ended: Ended): void {
    if (ended === 'break') this.until.set(name, this.now() + this.ms);
  }
}
