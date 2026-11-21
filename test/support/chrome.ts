import { chromium, type Browser } from 'playwright-core';
import { CHROME_LAUNCH_TIMEOUT_MS, CLOSE_TIMEOUT_MS } from './chrome-limits.js';

// The one place a test starts Chrome. It sets the time limit of the start and remembers every browser it started, so that
// test/support/browser-setup.ts can close what a file left open, including when its test or hook threw: a Chrome left behind keeps
// its CPU and a /tmp/playwright_chromiumdev_profile-* folder.

const open = new Set<Browser>();

/** Starts the Chrome at `executablePath`; throws, and Playwright kills the process, when it is not up in CHROME_LAUNCH_TIMEOUT_MS. */
export async function launchBrowser(executablePath: string): Promise<Browser> {
  const browser = await chromium.launch({ executablePath, timeout: CHROME_LAUNCH_TIMEOUT_MS });
  open.add(browser);
  browser.on('disconnected', () => open.delete(browser));
  return browser;
}

/** Closes every browser started here and still open. Never throws: a close that fails or hangs is reported and the run goes on. */
export async function closeLaunched(): Promise<void> {
  await Promise.all(
    [...open].map(async (browser) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          browser.close(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Chrome did not close in ${CLOSE_TIMEOUT_MS / 1000}s`)), CLOSE_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        process.stderr.write(`${(error as Error).message}\n`);
      } finally {
        clearTimeout(timer);
        open.delete(browser);
      }
    }),
  );
}
