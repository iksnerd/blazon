import { PDFDocument } from 'pdf-lib';
import type { Browser, Page } from 'playwright-core';
import type { Brand } from './brand.js';
import type { Favicons } from './favicons.js';
import type { FontTable } from './fonts.js';
import { Images } from './images.js';
import { Measure } from './measure.js';
import { Painter } from './paint/index.js';
import { PAGE, plan, type Slide } from './plan/index.js';

// Draws the deck in a real browser: lays the slides out as HTML (paint/), measures what the layout needed to know, lays them out
// again until nothing new is asked, and prints the page to a PDF with the slide as the page size, as blazon.print-book prints the book.

const ORIGIN = 'http://deck.local';
const MAX_PASSES = 12;
const RESOURCE_SECONDS = 20;

const STYLE = `@page{size:${PAGE.width}pt ${PAGE.height}pt;margin:0}
html,body{margin:0;padding:0}
*{box-sizing:border-box}
.s{position:relative;width:${PAGE.width}pt;height:${PAGE.height}pt;overflow:hidden;break-after:page}
.s:last-child{break-after:auto}
.t{position:absolute;white-space:pre;line-height:normal;font-variant-ligatures:none}
.t i{display:inline-block;width:0;height:200pt}
.r{position:absolute;display:block}
.l{position:absolute;margin:0;padding:0;list-style:disc outside;white-space:pre;font-variant-ligatures:none}
.l li::marker{color:var(--m)}
.l i{display:inline-block;width:0;height:200pt}`;

export interface Deck {
  /** The PDF, with its title and dates fixed so the same brand is the same bytes */
  pdf: Buffer;
  slides: Slide[];
  pages: number;
}

export interface Drawing {
  brand: Brand;
  siteDir: string;
  favicons: Favicons | null;
  table: FontTable;
  skip: readonly string[];
}

async function serveFrom(page: Page, answer: (path: string) => { type: string; body: Buffer | string } | undefined): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) => {
    const found = answer(new URL(route.request().url()).pathname);
    return found ? route.fulfill({ contentType: found.type, body: found.body }) : route.fulfill({ status: 404, body: '' });
  });
}

/** Draws every slide of the brand. The browser is the caller's to close. */
export async function drawDeck(browser: Browser, drawing: Drawing): Promise<Deck> {
  const { brand, table } = drawing;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // tsx wraps functions with a __name helper that does not exist in the page; the built plugin has none, and this is harmless there
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  try {
    const measure = new Measure();
    const images = new Images(measure);
    const pages = { deck: '', probe: '' };
    const answer = (path: string) => {
      if (path === '/deck.html') return { type: 'text/html; charset=utf-8', body: pages.deck };
      if (path === '/probe.html') return { type: 'text/html; charset=utf-8', body: pages.probe };
      const image = path.startsWith('/img/') ? images.file(path) : undefined;
      if (image) return { type: image.mime, body: image.bytes };
      const font = path.startsWith('/fonts/') ? table.file(path.slice('/fonts/'.length)) : undefined;
      return font && { type: font.mime, body: font.bytes };
    };

    const probe = await context.newPage();
    probe.setDefaultTimeout(RESOURCE_SECONDS * 1000);
    await serveFrom(probe, answer);
    let probeRules: string | undefined;

    let slides: Slide[] = [];
    let sections: string[] = [];
    for (let pass = 1; ; pass++) {
      const painter = new Painter({ brand, measure, images, table, siteDir: drawing.siteDir });
      slides = plan(brand, drawing.favicons, painter.wrap, drawing.skip);
      for (const slide of slides) painter.draw(slide);
      sections = painter.sections;
      if (measure.settled) break;
      if (pass === MAX_PASSES) throw new Error(`the layout did not settle in ${MAX_PASSES} passes`);
      const rules = table.rules('/fonts');
      if (rules !== probeRules) {
        pages.probe = `<!doctype html><meta charset="utf-8"><style>${rules}</style><body>`;
        await probe.goto(`${ORIGIN}/probe.html`, { waitUntil: 'load' });
        probeRules = rules;
      }
      await measure.fill(probe, ORIGIN);
    }
    await probe.close();

    pages.deck = `<!doctype html><meta charset="utf-8"><title>${brand.brand.title.replace(/</g, '&lt;')}</title><style>${table.rules('/fonts')}\n${STYLE}</style><body>${sections.join('')}`;
    const page = await context.newPage();
    page.setDefaultTimeout(RESOURCE_SECONDS * 1000);
    await serveFrom(page, answer);
    await page.goto(`${ORIGIN}/deck.html`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    });
    const printed = await page.pdf({ width: `${(PAGE.width * 4) / 3}px`, height: `${(PAGE.height * 4) / 3}px`, printBackground: true, preferCSSPageSize: true });
    const pdf = await PDFDocument.load(printed);
    const count = pdf.getPageCount();
    // The same brand is the same bytes: the dates and the producer are the browser's own, so they are fixed
    pdf.setTitle(brand.brand.title);
    pdf.setCreator('blazon.brand-deck');
    pdf.setProducer('blazon.brand-deck');
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    return { pdf: Buffer.from(await pdf.save({ useObjectStreams: false })), slides, pages: count };
  } finally {
    await context.close();
  }
}
