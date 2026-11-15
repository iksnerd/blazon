import fs from 'node:fs';
import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { androidFiles } from './android.js';
import { readBrand } from './brand.js';
import { composeFiles } from './compose.js';
import { iosFiles } from './ios.js';
import { parseOptions, type Finding, type Platform } from './options.js';
import { planTokens } from './plan.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.platform-tokens: blazon's build role. Reads one request on standard input and writes a brand's color and dimension tokens into out_dir
// as native files: android/ (colors.xml, values-night/colors.xml, dimens.xml), ios/ (BlazonTokens.swift and Colors.xcassets) and compose/
// (Colors.kt, Dimens.kt), with a README.txt that says where each goes. It reads brand.json only; the same brand gives the same bytes. It
// answers {"findings": [...]}. Wrong options are findings, not a failure. A broken request is exit 2 with the reason as the first line of
// standard output, and nothing is written. It needs Node and nothing else.

const WHERE: Record<Platform, { folder: string; line: string }> = {
  android: { folder: 'android/', line: "copy values/ (and values-night/, if there is one) into your module's src/main/res/, beside any file of the same name" },
  ios: { folder: 'ios/', line: 'add BlazonTokens.swift and Colors.xcassets to your Xcode target' },
  compose: { folder: 'compose/', line: "copy Colors.kt and Dimens.kt into your module's source folder and set the package line to yours" },
};

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options, brand.contextNames);
  const plan = planTokens(brand, options);
  findings.push(...plan.findings);

  const files = new Map<string, string>();
  const written: Platform[] = [];
  for (const platform of options.platforms) {
    const made = platform === 'android' ? androidFiles(plan) : platform === 'ios' ? iosFiles(plan) : composeFiles(plan);
    if (made.size) written.push(platform);
    for (const [file, data] of made) files.set(file, data);
  }
  if (written.length)
    files.set(
      'README.txt',
      `Design tokens for apps, written by blazon.platform-tokens from brand.json.\n\n${written.map((platform) => `${WHERE[platform].folder} ${WHERE[platform].line}`).join('\n')}\n`,
    );

  // Written once, whole, in path order, after the work is done: a call that ends earlier leaves out_dir empty
  for (const [file, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    fs.mkdirSync(path.dirname(path.join(job.outDir, file)), { recursive: true });
    fs.writeFileSync(path.join(job.outDir, file), data);
  }
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the tokens could not be written', NAME).then((code) => {
  process.exitCode = code;
});
