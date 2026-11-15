import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.js';
import { pptxOf } from './pptx.js';
import { BUDGET_SECONDS, printBook, waitSeconds, type Printed } from './print.js';
import { Cannot, jobFor, MANIFEST, NAME, OptionError, type Job } from './request.js';
import { findingFor, optionFinding, runPlugin, type Finding } from '../shared/plugin.js';

// blazon.print-book: blazon's build role. Reads one request on standard input, prints the brand book to a PDF and a
// PowerPoint file of the same slides in out_dir, and answers {"findings": [...]}. When it cannot print, it exits 2 with
// the reason as the first line of standard output, and writes nothing. When the site holds blazon.favicons' copy, the book has a
// Favicons chapter, so that plugin is listed first.

function findings(job: Job, printed: Printed): Finding[] {
  const finding = (message: string): Finding => findingFor(NAME)('page-count', 'warning', `${job.name}.pdf`, message);
  const { claimed, pages } = printed;
  if (typeof claimed !== 'number' || !Number.isInteger(claimed) || claimed < 0) {
    return [finding(`the page did not say how many slides it laid out (window.__blazonPrint.pages is ${JSON.stringify(claimed) ?? 'undefined'})`)];
  }
  return claimed === pages ? [] : [finding(`the page laid out ${claimed} slides, and the PDF has ${pages} pages`)];
}

/** Slides whose content is taller than a slide even drawn at the smallest size: it is cut off at the foot, so say where. */
function clipped(job: Job, printed: Printed): Finding[] {
  const pages = Array.isArray(printed.clipped) ? printed.clipped.filter((n): n is number => Number.isInteger(n)) : [];
  if (pages.length === 0) return [];
  const message = `${pages.length === 1 ? 'page' : 'pages'} ${pages.join(', ')} of the PDF ${pages.length === 1 ? 'is' : 'are'} cut off at the foot: a block that cannot be split over slides (one tall figure, a long code block) is taller than a slide even drawn at half size; shorten it or split it in the page's Markdown`;
  return [{ code: `${NAME}/slide-clipped`, severity: 'warning', path: `${job.name}.pdf`, message }];
}

/**
 * The Favicons chapter comes from the copy blazon.favicons leaves in the site, so that plugin must run first. When its
 * folder beside this one holds a favicons.json and the site has no copy, it did not run first (or is no longer listed,
 * and its folder is left over). It cannot be seen on the first build in the wrong order, when that folder is not there yet.
 */
function favicons(job: Job): Finding[] {
  const drawn = fs.existsSync(path.join(path.dirname(job.outDir), 'blazon.favicons', 'favicons.json'));
  if (!drawn || fs.existsSync(path.join(job.siteDir, 'favicons', 'favicons.json'))) return [];
  const message = `a blazon.favicons folder with a favicons.json sits beside this plugin's, but the site has no favicons/ copy, so the book has no Favicons chapter; list blazon.favicons before ${NAME} in plugins, or delete that folder if the plugin is no longer used`;
  return [{ code: `${NAME}/favicons-not-in-site`, severity: 'warning', path: `${job.name}.pdf`, message }];
}

const started = Date.now();

async function build(text: string): Promise<{ findings: Finding[] }> {
  let job: Job;
  try {
    job = jobFor(text);
  } catch (error) {
    // A wrong option is a finding to read, not a plugin that broke: nothing is printed, and no browser is needed to say so
    if (error instanceof OptionError) return { findings: [optionFinding(NAME, error)] };
    throw error;
  }
  const deadline = started + BUDGET_SECONDS * 1000;
  const browser = await launch(process.env);
  let printed: Printed;
  try {
    printed = await printBook(browser, job, waitSeconds(process.env.BLAZON_PRINT_SECONDS), deadline);
  } finally {
    await browser.close();
  }
  if (deadline - Date.now() < 2000)
    throw new Cannot(
      `the book was printed, but not in time to build the PowerPoint file in ${BUDGET_SECONDS} seconds; print a smaller part of it with preset essentials or reference, or with pages`,
    );
  const pptx = await pptxOf(printed.pictures);
  // Written once, whole, after the browser is done: a call that ends earlier leaves out_dir empty
  fs.writeFileSync(path.join(job.outDir, `${job.name}.pdf`), printed.pdf);
  fs.writeFileSync(path.join(job.outDir, `${job.name}.pptx`), pptx);
  return { findings: [...findings(job, printed), ...clipped(job, printed), ...favicons(job)] };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the browser could not print the book', NAME).then((code) => {
  process.exitCode = code;
});
