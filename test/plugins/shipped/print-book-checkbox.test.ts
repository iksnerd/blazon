import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright-core';
import { closeBrowser, launchBrowser } from '../../support/chrome';
import { loadConfig } from '../../../src/core/config/index.js';
import { buildSite } from '../../../src/builder/site-builder.js';
import { jobFor } from '../../../src/shipped/print-book/request.js';
import { serve } from '../../../src/shipped/print-book/site.js';
import { tempDir } from '../../support/project';
import { starterProject } from '../../support/init-project';

// A Markdown task list (`- [ ]`, `- [x]`) in the print book: the native checkbox was drawn pale grey and nearly invisible, after a
// bullet. In print the bullet is gone and the box has a border in the text colour; a checked box is filled, so it differs from an
// unchecked one. Both layouts, and the page count of a book with no task list stays what it was (73 compact, 83 roomy).

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to print with');
  console.warn('print-book checkbox test: skipped, no Chrome to print with (set BLAZON_CHROME)');
}

const SLIDE = { width: 1280, height: 720 };
const TASKS =
  '---\ntitle: Tasks\norder: 90\ngroup: System\ndescription: A checklist.\nsection: intro\n---\n\n## Before you ship\n\nText before the list.\n\n- [ ] Logo checked on dark\n- [x] Colors checked\n- [ ] Plain item after\n- A plain bullet\n';

interface Box {
  checked: boolean;
  width: number;
  height: number;
  border: number;
  borderColor: string;
  fill: string;
  listStyle: string;
  ink: string;
  ground: string;
}
interface Seen {
  pages: number;
  boxes: Box[];
  plainListStyle: string;
}

interface Served {
  origin: string;
  dir: string;
  close: () => Promise<void>;
}

let browser: Browser;
let plain: Served;
let tasks: Served;

async function site(withTasks: boolean): Promise<Served> {
  const root = await starterProject();
  if (withTasks) fs.writeFileSync(path.join(root, 'docs', '90-tasks.md'), TASKS);
  const out = tempDir('blazon-checkbox-');
  await buildSite({ ...(await loadConfig(root)), outDir: out }, root, { allowErrors: true });
  const served = await serve(out);
  return { origin: served.origin, dir: out, close: () => served.close() };
}

beforeAll(async () => {
  if (!CHROME) return;
  plain = await site(false);
  tasks = await site(true);
  browser = await launchBrowser(CHROME);
}, 240_000);

afterAll(async () => {
  await closeBrowser(browser);
  await plain?.close();
  await tasks?.close();
}, 30_000);

async function seen(s: Served, layout: string): Promise<Seen> {
  const request = JSON.stringify({ v: 2, type: 'build', options: { layout }, brand: {}, site_dir: s.dir, out_dir: tempDir('o-') });
  const page = await browser.newPage({ viewport: SLIDE });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${s.origin}/index.html${jobFor(request).hash}`);
    await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: 90_000 });
    return await page.evaluate(() => {
      const resolve = (css: string) => {
        const probe = document.createElement('i');
        probe.style.color = css;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-print-slide] li > input[type="checkbox"]')].map((input) => {
        const style = getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        return {
          checked: input.checked,
          width: rect.width,
          height: rect.height,
          border: parseFloat(style.borderTopWidth),
          borderColor: style.borderTopColor,
          fill: style.backgroundColor,
          listStyle: getComputedStyle(input.parentElement!).listStyleType,
          ink: resolve('var(--foreground)'),
          ground: resolve('var(--background)'),
        };
      });
      const plainItem = [...document.querySelectorAll('[data-print-slide] li')].find((li) => !li.querySelector('input') && li.parentElement?.querySelector(':scope > li > input'));
      return {
        pages: document.querySelectorAll('[data-print-slide]').length,
        boxes,
        plainListStyle: plainItem ? getComputedStyle(plainItem).listStyleType : '',
      };
    });
  } finally {
    await page.close();
  }
}

describe.skipIf(!CHROME)('the print book draws a task-list checkbox', () => {
  for (const layout of ['compact', 'roomy']) {
    it(`as a bordered box in the text colour with no bullet, in the ${layout} layout`, async () => {
      const book = await seen(tasks, layout);
      expect(book.boxes.length).toBe(3);
      for (const box of book.boxes) {
        expect(box.listStyle).toBe('none');
        expect(box.width).toBeGreaterThanOrEqual(12);
        expect(box.height).toBeGreaterThanOrEqual(12);
        expect(box.border).toBeGreaterThanOrEqual(1.5);
        expect(box.borderColor).toBe(box.ink);
        expect(box.borderColor).not.toBe(box.ground);
      }
      const unchecked = book.boxes.find((b) => !b.checked)!;
      const checked = book.boxes.find((b) => b.checked)!;
      expect(unchecked.fill).not.toBe(unchecked.ink);
      expect(checked.fill).toBe(checked.ink);
      expect(book.plainListStyle).toBe('disc');
    });
  }

  it('leaves the page count of a book with no task list at 73 compact and 83 roomy', async () => {
    expect((await seen(plain, 'compact')).pages).toBe(73);
    expect((await seen(plain, 'roomy')).pages).toBe(83);
  });
});
