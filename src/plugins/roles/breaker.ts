/** Three breaks in a row, the core's threshold (RFC 0005 section 7). A host MAY use another. */
export const DEFAULT_THRESHOLD = 3;

/**
 * Stops calling a plugin that keeps breaking, for the rest of a unit of work. After `threshold` breaks in a row it is
 * open, and every later call in that unit ends at once as an error without starting the program. An answer resets
 * the count. It never closes within the unit and never carries into the next one: make a new Breaker per unit of
 * work. An open breaker must not turn a stopped call into a pass; the caller reports the skipped call as a break.
 */
export class Breaker {
  private breaks = 0;
  private opened = false;

  constructor(private readonly threshold = DEFAULT_THRESHOLD) {}

  get open(): boolean {
    return this.opened;
  }

  /** Note how a call that did start ended: a break, or an answer. */
  record(broke: boolean): void {
    if (this.opened) return;
    if (!broke) {
      this.breaks = 0;
      return;
    }
    this.breaks += 1;
    if (this.breaks >= this.threshold) this.opened = true;
  }
}
