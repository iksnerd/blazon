import { chromium, type Browser } from 'playwright-core';
import { CHROME_CLOSE_MS, CHROME_KILL_WAIT_MS, CHROME_LAUNCH_TIMEOUT_MS } from './chrome-limits.js';

// The one place a test starts and closes Chrome. It sets the time limit of the start and remembers every browser it started, so that
// test/support/browser-setup.ts can close what a file left open, including when its test or hook threw: a Chrome left behind keeps
// its CPU and a /tmp/playwright_chromiumdev_profile-* folder.

const open = new Set<Browser>();
/** The process id of each browser's Chrome, as Chrome itself reports it; Playwright's Browser does not expose its process. */
const pids = new WeakMap<Browser, number>();

/** Starts the Chrome at `executablePath`; throws, and Playwright kills the process, when it is not up in CHROME_LAUNCH_TIMEOUT_MS. */
export async function launchBrowser(executablePath: string): Promise<Browser> {
  const browser = await chromium.launch({ executablePath, timeout: CHROME_LAUNCH_TIMEOUT_MS });
  open.add(browser);
  browser.on('disconnected', () => open.delete(browser));
  try {
    const session = await browser.newBrowserCDPSession();
    const { processInfo } = (await session.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] };
    const main = processInfo.find((p) => p.type === 'browser');
    if (main) pids.set(browser, main.id);
    await session.detach();
  } catch (error) {
    // Without the pid a hung close can only be reported, not killed (closeBrowser says so); the browser itself is fine
    process.stderr.write(`could not read the pid of the Chrome just started: ${(error as Error).message}\n`);
  }
  return browser;
}

const settle = <T>(promise: Promise<T>, ms: number): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), ms))),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Closes a browser from `launchBrowser`: its contexts (and their pages) first, then Chrome, for at most CHROME_CLOSE_MS. A Chrome that has
 * not exited by then is killed, with its helpers, by the process group Playwright started it in (its own pid), never by name, and the call
 * waits CHROME_KILL_WAIT_MS more for Playwright to see it gone. It never throws and never takes longer than the two together, which is well
 * under a test file's afterAll limit.
 *
 * A hung shutdown is cleanup, not a test result. This runs in afterAll, after every assertion of the file passed. On a loaded machine
 * Chrome's own exit took 11 to 30 s (the main process runnable for seconds with its pages gone, then a helper holding the stdio pipe
 * Playwright waits on), and the file failed with a HookTimeoutError on output that was right. What the file checks is the pages it drew;
 * how long Chrome takes to exit says nothing about them, so the kill is reported on stderr and the file passes.
 */
export async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return; // a file whose beforeAll did not get as far as starting one
  const shutdown = (async () => {
    await Promise.all(browser.contexts().map((context) => context.close().catch(() => undefined)));
    await browser.close();
  })();
  try {
    if (await settle(shutdown, CHROME_CLOSE_MS)) return;
    const pid = pids.get(browser);
    process.stderr.write(`Chrome did not exit in ${CHROME_CLOSE_MS / 1000}s after the file's tests; killing it (pid ${pid ?? 'unknown'})\n`);
    if (pid !== undefined) kill(pid);
    if (!(await settle(shutdown, CHROME_KILL_WAIT_MS))) process.stderr.write(`Chrome (pid ${pid ?? 'unknown'}) was still not gone ${CHROME_KILL_WAIT_MS / 1000}s after the kill\n`);
  } finally {
    open.delete(browser);
  }
}

/** SIGKILL to Chrome's process group, which Playwright makes it lead (a detached spawn), so its helpers go too; to the process alone if not. */
function kill(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // gone already
    }
  }
}

/** Closes every browser started here and still open. Never throws: a close that hangs is killed and reported, and the run goes on. */
export async function closeLaunched(): Promise<void> {
  await Promise.all([...open].map((browser) => closeBrowser(browser)));
}
