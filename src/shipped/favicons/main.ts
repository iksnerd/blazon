import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.js';
import { checks, safeZones, type Finding } from './check.js';
import { headSnippet, previewData, webManifest } from './files.js';
import { planFor, type Plan } from './plan.js';
import { ico, png, reach, sheet } from './raster.js';
import { MANIFEST, requestFrom, NAME } from './request.js';
import { OptionError, optionFinding, runPlugin } from '../shared/plugin.js';
import { checkSite, copyToSite } from './site.js';
import { tileSvg } from './symbol.js';
import { ADAPTIVE, masksView, sizesView, STYLE, tabsView, VIEWS } from './views.js';

// blazon.favicons: blazon's check and build role. The check judges the brand's symbol as an icon. The build draws the
// favicon and app-icon set from the symbol in a browser on this computer (no network, nothing uploaded) into out_dir,
// and answers {"findings": [...]}. The build also draws three views and the Android adaptive layers, and warns when the
// symbol leaves the safe zones, measured on the pixels. It also copies favicons.json and the three views to favicons/ in site_dir,
// which is how the web book finds them (site.ts). When it cannot, it exits 2 with the reason as the first line of standard
// output, and writes nothing.

/** Files made once, whole, after the browser is done: a call that ends earlier leaves out_dir empty. */
async function draw(plan: Plan): Promise<{ files: Map<string, Buffer | string>; reach: number }> {
  const glyph = plan.glyph!;
  const files = new Map<string, Buffer | string>();
  const browser = await launch(process.env);
  try {
    const favicon = (size: number) => tileSvg(glyph, size, plan.share.favicon, plan.favicon);
    const app = (size: number) => tileSvg(glyph, size, plan.share.app, plan.ink, plan.ground);
    files.set('favicon.svg', `${favicon(32)}\n`);
    const small = new Map<number, Buffer>();
    for (const size of [16, 32, 48]) small.set(size, await png(browser, favicon(size), size, true));
    files.set('favicon.ico', ico([...small].map(([size, data]) => ({ size, png: data }))));
    files.set('favicon-16.png', small.get(16)!);
    files.set('favicon-32.png', small.get(32)!);
    for (const [size, file] of [
      [1024, 'app-icon-1024.png'],
      [180, 'apple-touch-icon.png'],
      [192, 'icon-192.png'],
      [512, 'icon-512.png'],
    ] as const) {
      files.set(file, await png(browser, app(size), size, false));
    }
    // The Android adaptive layers: the symbol alone on a transparent layer, and the ground alone
    const foreground = await png(browser, tileSvg(glyph, ADAPTIVE.size, plan.share.app, plan.ink), ADAPTIVE.size, true);
    files.set('android-adaptive-foreground.png', foreground);
    files.set(
      'android-adaptive-background.png',
      await png(
        browser,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${ADAPTIVE.size}" height="${ADAPTIVE.size}"><rect width="${ADAPTIVE.size}" height="${ADAPTIVE.size}" fill="${plan.ground}"/></svg>`,
        ADAPTIVE.size,
        false,
      ),
    );
    // What the project supplied is used as it is, in place of the file drawn: the views show it too
    for (const [file, bytes] of plan.supplied) files.set(file, bytes);
    const master = files.get('app-icon-1024.png') as Buffer;
    const html = { tabs: tabsView(plan, { 16: small.get(16)!, 32: small.get(32)! }), masks: masksView(master), sizes: sizesView(master) };
    for (const view of VIEWS) files.set(view.file, await sheet(browser, html[view.id], view.width, view.height, STYLE));
    return { files, reach: await reach(browser, foreground, ADAPTIVE.size) };
  } finally {
    await browser.close();
  }
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  let request: ReturnType<typeof requestFrom>;
  let plan: ReturnType<typeof planFor>;
  try {
    request = requestFrom(text);
    plan = planFor(request);
  } catch (error) {
    // A wrong option is a finding to read, not a plugin that broke: nothing is drawn, and no browser is needed to say so
    if (error instanceof OptionError) return { findings: [optionFinding(NAME, error)] };
    throw error;
  }
  if (request.type === 'check') return { findings: checks(plan) };
  checkSite(request.siteDir);
  const findings: Finding[] = [];
  const { files, reach: far } = await draw(plan);
  const supplied = [...plan.supplied.keys()].sort();
  files.set('head.html', headSnippet(plan));
  files.set('site.webmanifest', webManifest(plan));
  files.set('favicons.json', previewData(plan, supplied, far));
  findings.push(...safeZones(plan, far));
  for (const file of supplied)
    findings.push({ code: `${NAME}/supplied`, severity: 'info', path: file, message: `${file} is the project's own file, used in place of the one drawn from ${plan.symbolId}` });
  for (const [file, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) fs.writeFileSync(path.join(request.outDir, file), data);
  // After out_dir, the one thing written outside it: the copy the web book's Favicons page reads
  copyToSite(request.siteDir, files);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the icons could not be drawn', NAME).then((code) => {
  process.exitCode = code;
});
