import fs from 'node:fs';
import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { readBrand } from './brand.js';
import { optionFindings, type Finding } from './options.js';
import { collisions, formatTailwindReset, formatTailwindTheme } from './theme.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.tailwind: blazon's build role for Tailwind v4. Reads one request on standard input and writes tailwind.css (a `@theme` block of the
// brand's colors, font families, font sizes and weights, radii, spacing, shadows and easings) and tailwind-reset.css (a `@theme` block that
// sets each namespace the brand fills to `initial`) into out_dir. It reads brand.json only, and no site, so `blazon tokens` runs it; the same
// brand gives the same bytes. It answers {"findings": [...]}. Wrong options and two tokens that write one variable are findings, not a
// failure. A broken request is exit 2 with the reason as the first line of standard output, and nothing is written. It needs Node and nothing else.

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const tokens = readBrand(job.brand);
  const findings = [...optionFindings(job.options), ...collisions(tokens)];

  const files = new Map<string, string>();
  const theme = formatTailwindTheme(tokens);
  if (theme) files.set('tailwind.css', theme);
  const reset = formatTailwindReset(tokens);
  if (reset) files.set('tailwind-reset.css', reset);

  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  for (const [file, data] of files) fs.writeFileSync(path.join(job.outDir, file), data);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the Tailwind files could not be written', NAME).then((code) => {
  process.exitCode = code;
});
