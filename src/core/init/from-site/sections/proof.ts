import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import { pickColors } from '../colors.js';
import { evidenceOf, type Counted, type Sheet } from '../evidence.js';
import { fontOf, weightOf } from '../fonts.js';
import { metaContent, pageTitle } from '../html.js';
import { favicon, headerLogo } from '../logo.js';
import { writeJson, type Json } from '../tree.js';
import { pickRadii } from './radius.js';

// extract.json: what `init --from` and `--from-dir` read, value by value, with where each came from, and what the site's rules use most,
// counted. It sits at the top of the new project, where no loader reads (only tokens/, docs/, assets/ and fonts/ are), so `blazon check`
// and the starter-file notes never see it. It is written once: a file of that name already there is kept.

export const PROOF_FILE = 'extract.json';

/** Where a value of the stylesheets came from: the last sheet whose own text gives it, else every sheet that was read. */
function sheetOf(sheets: Sheet[], found: (css: string) => boolean): string {
  for (let i = sheets.length - 1; i >= 0; i--) if (found(sheets[i]!.css)) return sheets[i]!.source;
  return sheets.map((s) => s.source).join(', ');
}

/** How many times the stylesheets read a custom property with `var()`. */
const references = (css: string, cssVar: string): number => [...css.matchAll(new RegExp(`var\\(\\s*${cssVar.replace(/[-]/g, '\\-')}\\s*[,)]`, 'g'))].length;

const ranked = (list: Counted[]) =>
  list.slice(0, 40).map((c) => ({ value: c.value, count: c.count, uses: c.uses.map(({ source, selector, property, value }) => ({ source, selector, property, value })) }));

export function writeProof(ctx: Ctx, skipVars?: Set<string>): void {
  const { destDir, site, date, page, vars, result, note } = ctx;
  const file = path.join(destDir, PROOF_FILE);
  if (fs.existsSync(file)) {
    result.missing.push(`${PROOF_FILE} already existed, so it was kept as it was and no record of what was read was written`);
    return;
  }
  const sheets: Sheet[] = page.sheets ?? [{ source: page.sources.join(', '), css: page.css }];
  const evidence = evidenceOf(sheets);
  const declared = (cssVar: string) => evidence.declaredIn.get(cssVar);
  const pageSource = site.offline ? site.label.replace(/ \(a saved copy\)$/, '') : site.label;
  const values: Json[] = [];

  for (const p of pickColors(vars)) {
    const at = declared(p.cssVar);
    values.push({
      kind: 'color',
      ...(skipVars?.has(p.cssVar) ? { skipped: 'unticked in the review' } : {}),
      value: vars.get(p.cssVar),
      hex: p.hex,
      source: at?.source ?? sheetOf(sheets, (css) => css.includes(p.cssVar)),
      selector: at?.selector ?? ':root',
      property: p.cssVar,
      count: references(page.css, p.cssVar),
    });
  }
  for (const r of pickRadii(vars).picks) {
    const at = declared(r.cssVar);
    values.push({
      kind: 'radius',
      token: `radius.${r.name}`,
      value: vars.get(r.cssVar),
      source: at?.source ?? '',
      selector: at?.selector ?? ':root',
      property: r.cssVar,
      count: references(page.css, r.cssVar),
    });
  }
  const fontRoles: [string, RegExp, string | undefined][] = [
    ['body', /^(body|html)$/, undefined],
    ['headings', /^h[1-6]$/, 'h1'],
  ];
  for (const [role, selectors, prefer] of fontRoles) {
    const family = fontOf(page.css, vars, selectors);
    if (family) {
      values.push({
        kind: 'font-family',
        role,
        value: family.family,
        stack: family.stack,
        source: sheetOf(sheets, (css) => fontOf(css, vars, selectors)?.family === family.family),
        selector: family.locator.replace(/ \{ font-family \}$/, ''),
        property: family.cssVar ? `font-family, from ${family.cssVar}` : 'font-family',
        count: evidence.families.find((f) => f.value.toLowerCase() === family.family.toLowerCase())?.count ?? 1,
        license: 'not set: blazon writes the family name only, and a person records the license (font.license) after checking it',
      });
    }
    const weight = weightOf(page.css, vars, selectors, prefer);
    if (weight) {
      values.push({
        kind: 'font-weight',
        role,
        value: weight.weight,
        source: sheetOf(sheets, (css) => weightOf(css, vars, selectors, prefer)?.weight === weight.weight),
        selector: weight.locator.replace(/ \{ font-weight \}$/, ''),
        property: 'font-weight',
        count:
          evidence.weights.find((w) => Number(w.value) === weight.weight || (w.value === 'bold' && weight.weight === 700) || (w.value === 'normal' && weight.weight === 400))
            ?.count ?? 1,
      });
    }
  }
  const logo = headerLogo(page.html, site);
  const icon = logo ? undefined : favicon(page.html, site);
  if (logo)
    values.push({
      kind: 'logo',
      value: logo.kind === 'inline' ? 'an inline SVG' : logo.url,
      source: pageSource,
      selector: logo.locator,
      property: logo.kind === 'inline' ? 'svg' : 'src',
      count: 1,
      ...(ctx.logoRefused ? { refused: ctx.logoRefused } : {}),
    });
  else if (icon)
    values.push({
      kind: 'icon',
      value: icon.url,
      source: pageSource,
      selector: icon.locator,
      property: 'href',
      count: 1,
      ...(ctx.logoRefused ? { refused: ctx.logoRefused } : {}),
    });
  const metas: [string, string | undefined, string, string][] = [
    ['title', pageTitle(page.html), 'title', 'text'],
    ['description', metaContent(page.html, 'description'), 'meta[name="description"]', 'content'],
    ['theme-color', metaContent(page.html, 'theme-color'), 'meta[name="theme-color"]', 'content'],
  ];
  for (const [kind, value, selector, property] of metas) if (value) values.push({ kind, value, source: pageSource, selector, property, count: 1 });

  writeJson(file, {
    format: 'blazon-extract',
    version: 1,
    readFrom: site.label,
    readOn: date,
    offline: site.offline,
    status: 'needs-review',
    review: `${note.replace('in this review', "in each token's review")} Nothing in this file and nothing init wrote is approved.`,
    sources: { page: pageSource, stylesheets: page.sources, notRead: page.notRead ?? [] },
    values,
    candidates: {
      note: 'Counts are evidence, not a decision. These are the values the rules use most, as candidates for a person to look at: the most frequent color is usually a gray or the link color, not the primary. blazon wrote no token from a count, and chose no role from one.',
      colorsByFrequency: ranked(evidence.colors),
      radiiByFrequency: ranked(evidence.radii),
      weightsByFrequency: ranked(evidence.weights),
    },
  });
  result.written.push(PROOF_FILE);
}
