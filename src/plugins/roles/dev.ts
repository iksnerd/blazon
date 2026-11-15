import type { Finding, BlazonConfig, BlazonData } from '../../types/index.js';
import { Cooldown, DEV_COOLDOWN_MS } from './gate.js';
import { brandFor } from './integrate.js';
import { PluginRun } from './roles.js';
import { finding } from '../../core/checker/catalogue.js';

// The check role in blazon dev (RFC 0002 of blazon, section 2). Each compile of the project asks for a check. Calls run
// one at a time; a check whose compile a newer one has replaced is dropped, and only the newest waiting one runs, so a
// burst of saves costs one run. A plugin that breaks rests for a cooldown instead of being stopped for a run that has no end.

export interface DevChecksOptions {
  /** The clock the cooldown reads; default Date.now */
  now?: () => number;
  cooldownMs?: number;
  /** The environment a plugin may be given; default: this process's */
  env?: NodeJS.ProcessEnv;
  /** Where verified copies of pinned plugins are made; default: the system's temporary directory */
  store?: string;
}

interface Job {
  generation: number;
  data: BlazonData;
  config: BlazonConfig;
  resolve: (found: Finding[] | undefined) => void;
}

export class DevChecks {
  private readonly gate: Cooldown;
  private generation = 0;
  private running = false;
  private waiting: Job | undefined;

  constructor(
    private readonly cwd: string,
    private readonly options: DevChecksOptions = {}
  ) {
    this.gate = new Cooldown(options.now, options.cooldownMs ?? DEV_COOLDOWN_MS);
  }

  private run(config: BlazonConfig): PluginRun {
    // A new run for each check, so the lock and the config are read again; the cooldown is what lasts between them
    return new PluginRun(config, this.cwd, { gate: this.gate, env: this.options.env, store: this.options.store });
  }

  /** Whether the project allows any plugin, so a project that allows none starts no process and sends no second update. */
  has(config: BlazonConfig): boolean {
    return this.run(config).active;
  }

  /**
   * What the check plugins find for this compile, after the core's findings, which this does not change. Undefined when
   * a newer compile was asked for before this one finished: its answer would describe files that have changed.
   */
  check(data: BlazonData, config: BlazonConfig): Promise<Finding[] | undefined> {
    return new Promise((resolve) => {
      this.waiting?.resolve(undefined);
      this.waiting = { generation: ++this.generation, data, config, resolve };
      if (!this.running) void this.drain();
    });
  }

  /**
   * A change replaced the compile any check was running or waiting for, and it asks for no check of its own (the project now allows no
   * plugin, or the new compile failed). What is running describes files that have changed, so its answer is dropped, as a newer check
   * would drop it. Nothing is dropped for the next check.
   */
  supersede(): void {
    this.generation++;
    this.waiting?.resolve(undefined);
    this.waiting = undefined;
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.waiting) {
        const job = this.waiting;
        this.waiting = undefined;
        let found: Finding[];
        try {
          const run = this.run(job.config);
          found = run.active ? await run.check(brandFor(job.data, job.config, this.cwd)) : [];
        } catch (err) {
          found = [finding('plugin-failed', { path: 'plugins', message: `could not run the check plugins: ${err instanceof Error ? err.message : String(err)}` })];
        }
        job.resolve(job.generation === this.generation ? found : undefined);
      }
    } finally {
      this.running = false;
    }
  }
}
