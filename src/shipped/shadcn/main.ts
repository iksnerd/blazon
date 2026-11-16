import fs from 'node:fs';
import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { readBrand } from './brand.js';
import { formatShadcnCss, formatShadcnJson } from './css.js';
import { deriveShadcn } from './derive.js';
import { finding, parseOptions, type Finding } from './options.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.shadcn: blazon's build role for shadcn/ui. Reads one request on standard input and writes shadcn.json (which token each shadcn
// variable takes, its value, where the pick came from, the variables nothing supplies and which text-on-surface pairs a contrast rule covers)
// and shadcn.css (the variables as CSS, with a block for each context that changes one) into out_dir. It reads brand.json only, and no site,
// so `blazon tokens` runs it; the same brand gives the same bytes. It answers {"findings": [...]}. Wrong options and a pick that names no
// token are findings, not a failure. A broken request is exit 2 with the reason as the first line of standard output, and nothing is
// written. It needs Node and nothing else.

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options);

  // A pick that names no token is reported and left out, so the variable falls back to its role
  const known = new Set(brand.tokens.map((token) => token.path));
  for (const [name, tokenPath] of Object.entries(options.variables))
    if (!known.has(tokenPath)) findings.push(finding('token-missing', 'error', tokenPath, `variables.${name} points at {${tokenPath}}, which is not a token`));

  const mapping = deriveShadcn(brand.roles, brand.roleTokens, options.variables, brand.tokens, brand.pairs);
  const files = new Map([
    ['shadcn.json', formatShadcnJson(mapping)],
    ['shadcn.css', formatShadcnCss(mapping, brand.contexts)],
  ]);
  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  for (const [file, data] of files) fs.writeFileSync(path.join(job.outDir, file), data);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the shadcn files could not be written', NAME).then((code) => {
  process.exitCode = code;
});
