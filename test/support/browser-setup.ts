import { afterAll, beforeAll, expect } from 'vitest';
import { isBrowserTest } from './browser-tests.js';
import { acquireSlot, CLOSE_TIMEOUT_MS, SLOT_WAIT_MS } from './chrome-limits.js';
import { closeLaunched } from './chrome.js';

// Runs before every test file (vitest.config.ts, setupFiles). A file on the list in test/browser-tests.txt holds one Chrome slot from
// its first hook to its last, so at most CHROME_SLOTS of them run at once, in every worker, whether the file starts Chrome itself
// or runs a plugin program that does. Its afterAll runs last (vitest runs afterAll hooks in the reverse order they were added), so it
// closes any browser the file's own afterAll missed and only then gives the slot back.

const file = expect.getState().testPath;
if (file && isBrowserTest(file)) {
  let release: (() => void) | undefined;
  beforeAll(async () => {
    release = await acquireSlot();
  }, SLOT_WAIT_MS + 10_000);
  afterAll(async () => {
    try {
      await closeLaunched();
    } finally {
      release?.();
    }
  }, CLOSE_TIMEOUT_MS + 10_000);
}
