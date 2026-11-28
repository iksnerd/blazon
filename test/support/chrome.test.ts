import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { closeBrowser, launchBrowser } from './chrome';
import { CHROME_CLOSE_MS, CHROME_KILL_WAIT_MS } from './chrome-limits';

// closeBrowser is what every Chrome test file's afterAll calls. A Chrome whose shutdown hangs (seen under load: 11 to 30 s) must not
// outlast the hook: it is killed by its pid after CHROME_CLOSE_MS. A stopped Chrome stands in for one too starved to exit.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to start');
  console.warn('closeBrowser test: skipped, no Chrome to start (set BLAZON_CHROME)');
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function chromePid(browser: Awaited<ReturnType<typeof launchBrowser>>): Promise<number> {
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = (await session.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] };
  await session.detach();
  return processInfo.find((p) => p.type === 'browser')!.id;
}

describe.skipIf(!CHROME)('closeBrowser', () => {
  it('closes a Chrome that exits by itself, with its pages', async () => {
    const browser = await launchBrowser(CHROME);
    const pid = await chromePid(browser);
    await browser.newPage();
    await closeBrowser(browser);
    expect(browser.isConnected()).toBe(false);
    expect(alive(pid)).toBe(false);
  }, 60_000);

  it('kills a Chrome that does not exit, within its bound and never throwing', async () => {
    const browser = await launchBrowser(CHROME);
    const pid = await chromePid(browser);
    await browser.newPage();
    process.kill(pid, 'SIGSTOP'); // a shutdown that never finishes
    const started = Date.now();
    try {
      await closeBrowser(browser);
    } finally {
      if (alive(pid)) process.kill(pid, 'SIGKILL');
    }
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(CHROME_CLOSE_MS - 50);
    expect(took).toBeLessThan(CHROME_CLOSE_MS + CHROME_KILL_WAIT_MS);
    expect(alive(pid)).toBe(false);
    expect(browser.isConnected()).toBe(false);
  }, 60_000);
});
