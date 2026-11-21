import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from './spawn';
import { acquireSlot, CHROME_SLOTS } from './chrome-limits';
import { tempDir } from './project';

// The cap on Chromes at once is a lock on a folder, so it is proved with a fake launcher that only counts: no Chrome starts here.

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the Chrome slots', () => {
  it('lets no more than the limit hold one at the same time, however many ask', async () => {
    const dir = tempDir('blazon-slots-');
    let held = 0;
    let most = 0;
    const launcher = async (): Promise<void> => {
      const release = await acquireSlot({ dir, limit: 2, pollMs: 5 });
      held++;
      most = Math.max(most, held);
      await pause(20); // a Chrome is up
      held--;
      release();
    };
    await Promise.all(Array.from({ length: 9 }, launcher));
    expect(most).toBe(2);
    expect(held).toBe(0);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('gives a slot back for the next who asks', async () => {
    const dir = tempDir('blazon-slots-');
    const release = await acquireSlot({ dir, limit: 1, pollMs: 5 });
    const next = acquireSlot({ dir, limit: 1, pollMs: 5 });
    await pause(30);
    release();
    await (
      await next
    )();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('fails, and does not hang, when no slot is free in time', async () => {
    const dir = tempDir('blazon-slots-');
    const release = await acquireSlot({ dir, limit: 1 });
    await expect(acquireSlot({ dir, limit: 1, waitMs: 50, pollMs: 5 })).rejects.toThrow(/no Chrome slot in \d+s: 1 are held/);
    release();
  });

  it('takes over the slot of a process that is gone', async () => {
    const dir = tempDir('blazon-slots-');
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf-8' });
    fs.mkdirSync(path.join(dir, 'slot-0'));
    fs.writeFileSync(path.join(dir, 'slot-0', 'owner'), dead.stdout);
    const release = await acquireSlot({ dir, limit: 1, waitMs: 50, pollMs: 5 });
    expect(fs.readFileSync(path.join(dir, 'slot-0', 'owner'), 'utf-8')).toBe(String(process.pid));
    release();
  });

  it('takes over a slot held for longer than the stale time, and not one held for less', async () => {
    const dir = tempDir('blazon-slots-');
    const release = await acquireSlot({ dir, limit: 1 });
    await expect(acquireSlot({ dir, limit: 1, waitMs: 30, pollMs: 5, staleMs: 60_000 })).rejects.toThrow(/no Chrome slot/);
    const later = () => Date.now() + 120_000;
    const taken = await acquireSlot({ dir, limit: 1, waitMs: 1000, pollMs: 5, staleMs: 60_000, now: later });
    taken();
    release();
  });

  it('defaults to two, and BLAZON_CHROME_SLOTS is the one way to change it', () => {
    expect(CHROME_SLOTS).toBe(Number(process.env.BLAZON_CHROME_SLOTS) > 0 ? Number(process.env.BLAZON_CHROME_SLOTS) : 2);
  });
});
