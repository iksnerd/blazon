import { PDFDocument } from 'pdf-lib';
import { errors, type Browser } from 'playwright-core';
import { guardNetwork } from '../shared/network.js';
import { Cannot, type Job } from './request.js';
import { serve } from './site.js';

/** One printed page of the book, 1280 x 720 CSS px; slide pictures are taken at 1.5x, 1920 px wide. */
const SLIDE = { width: 1280, height: 720 };
const PICTURE_SCALE = 1.5;
/** Blazon ends a call at 60 s: the page gets this long at most to lay itself out, and printing gets the rest. */
const DEFAULT_WAIT_SECONDS = 30;
const MAX_WAIT_SECONDS = 30;
const PRINT_SECONDS = 25;
/**
 * What the whole call may take. The manifest gives blazon's 60 s; the last five are the margin to write the files and answer in, so a book
 * that is too slow ends with this plugin's own reason (exit 2) and not killed by the host, which counts it as a break.
 */
export const BUDGET_SECONDS = 55;
/** Under this much left, a step does not start: there is no time to finish it. */
const MIN_STEP_MS = 1500;

/** How long a wait of `seconds` may last: that, or what is left of the call. */
export function waitFor(seconds: number, deadline: number, now: number = Date.now()): number {
  return Math.max(0, Math.min(seconds * 1000, deadline - now));
}

export interface Printed {
  pdf: Buffer;
  /** Each frame ([data-print-slide]) as a JPEG, in order */
  pictures: Buffer[];
  /** What the page said it laid out, as window.__blazonPrint.pages */
  claimed: unknown;
  /** The PDF's pages */
  pages: number;
  /** What the page said it cut off at the foot, as window.__blazonPrint.clipped: the page numbers */
  clipped: unknown;
}

/** Seconds the page may take to lay itself out: BLAZON_PRINT_SECONDS if it is a whole number from 1 to 30. */
export function waitSeconds(value: string | undefined): number {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_WAIT_SECONDS ? seconds : DEFAULT_WAIT_SECONDS;
}

/**
 * Serves the site on 127.0.0.1, turns print media on before the page loads (so the viewer lays out and counts its slides
 * as they print), opens index.html<hash>, waits for window.__blazonPrint.ready, then prints with the page's own @page size
 * and takes a picture of each frame.
 */
export async function printBook(browser: Browser, job: Job, seconds: number, deadline: number = Date.now() + BUDGET_SECONDS * 1000): Promise<Printed> {
  const tooSlow = (step: string) =>
    new Cannot(`the book did not finish in ${BUDGET_SECONDS} seconds (${step}); print a smaller part of it with preset essentials or reference, or with pages`);
  const left = () => deadline - Date.now();
  if (left() < MIN_STEP_MS) throw tooSlow('no time was left to start');
  const site = await serve(job.siteDir);
  try {
    const page = await browser.newPage({ viewport: SLIDE, deviceScaleFactor: PICTURE_SCALE });
    page.setDefaultTimeout(Math.min(PRINT_SECONDS * 1000, left()));
    await guardNetwork(page, { page: `${job.name}.pdf`, origins: [site.origin] });
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${site.origin}/index.html${job.hash}`, { waitUntil: 'domcontentloaded', timeout: waitFor(seconds, deadline) });
    try {
      await page.waitForFunction(() => (window as { __blazonPrint?: { ready?: unknown } }).__blazonPrint?.ready === true, undefined, { timeout: waitFor(seconds, deadline) });
    } catch (error) {
      if (error instanceof errors.TimeoutError)
        throw left() < 1000 ? tooSlow('the page was still laying out') : new Cannot(`the page did not set window.__blazonPrint.ready in ${seconds} seconds`);
      throw error;
    }
    const said = await page.evaluate(async () => {
      // document.fonts.ready is already resolved while a font stylesheet is still on its way, because no face is loading
      // until its rules arrive: wait for every stylesheet first, or a slow one prints the fallback font.
      await Promise.all(
        [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')]
          .filter((link) => !link.sheet)
          .map(
            (link) =>
              new Promise((done) => {
                link.addEventListener('load', done);
                link.addEventListener('error', done);
              }),
          ),
      );
      await document.fonts.ready;
      const laid = (window as { __blazonPrint?: { pages?: unknown; clipped?: unknown } }).__blazonPrint;
      return { pages: laid?.pages, clipped: laid?.clipped };
    });
    if (left() < MIN_STEP_MS) throw tooSlow('the page was laid out, and the PDF was not started');
    page.setDefaultTimeout(Math.min(PRINT_SECONDS * 1000, left()));
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, width: `${SLIDE.width}px`, height: `${SLIDE.height}px` });
    const pictures: Buffer[] = [];
    const frames = await page.locator('[data-print-slide]').all();
    for (const frame of frames) {
      if (left() < MIN_STEP_MS) throw tooSlow(`${pictures.length} of ${frames.length} slides were pictured`);
      pictures.push(await frame.screenshot({ type: 'jpeg', quality: 85, timeout: Math.min(PRINT_SECONDS * 1000, left()) }));
    }
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    return { pdf, pictures, claimed: said.pages, clipped: said.clipped, pages };
  } finally {
    await site.close();
  }
}
