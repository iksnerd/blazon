import fs from 'node:fs';
import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { readBrand, type TokenRead } from './brand.js';
import { clashFindings, foregroundFindings } from './clash.js';
import { convertColor, type ColorFormat } from './color.js';
import { formatShadcnCss, formatShadcnJson, formatShadcnTheme, type ColorWriter } from './css.js';
import { deriveShadcn, type ShadcnVariable } from './derive.js';
import { finding, parseOptions, type Finding } from './options.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.shadcn: blazon's check and build role for shadcn/ui. The build reads one request on standard input and writes shadcn.json (which token
// each shadcn variable takes, its value, where the pick came from, the variables nothing supplies and which text-on-surface pairs a contrast
// rule covers) and shadcn.css (the variables as CSS, with a block for each context that changes one) into out_dir; with the `themeInline`
// option it writes shadcn-theme.css too, and the `format` option writes the colors in shadcn.css as OKLCH or hex. The check judges the same
// mapping and warns when `destructive` is the same color as `primary`, `accent` or `ring`. It reads brand.json only, and no site, so `blazon
// tokens` runs it; the same brand gives the same bytes. It answers {"findings": [...]}. Wrong options and a pick that names no token are
// findings, not a failure. A broken request is exit 2 with the reason as the first line of standard output, and nothing is written. It
// needs Node and nothing else.

const CHARTS: readonly ShadcnVariable[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];

/** The first five color tokens under a group, in source order, as picks for `chart-1` to `chart-5`; a warning when there are fewer. */
function chartPicks(group: string, tokens: readonly TokenRead[], findings: Finding[]): Partial<Record<ShadcnVariable, string>> {
  const inGroup = tokens.filter((token) => token.type === 'color' && token.path.startsWith(`${group}.`));
  const picks: Partial<Record<ShadcnVariable, string>> = {};
  CHARTS.forEach((name, index) => {
    const token = inGroup[index];
    if (token) picks[name] = token.path;
  });
  if (inGroup.length < CHARTS.length)
    findings.push(
      finding(
        'chart-group-short',
        'warning',
        group,
        `chart "${group}" has ${inGroup.length} color token${inGroup.length === 1 ? '' : 's'}, so ${CHARTS.slice(inGroup.length).join(', ')} ${inGroup.length === 4 ? 'is' : 'are'} not supplied by it`,
      ),
    );
  return picks;
}

/** The writer for the `format` option. A value it cannot read as a color is kept as authored and named in a warning, once. */
function writerFor(format: ColorFormat, findings: Finding[]): ColorWriter {
  if (format === 'as-authored') return (_variable, value) => value;
  const reported = new Set<string>();
  return (variable, value) => {
    if (variable === 'radius') return value;
    const converted = convertColor(value, format);
    if (converted !== undefined) return converted;
    if (!reported.has(value)) {
      reported.add(value);
      findings.push(finding('format-unconverted', 'warning', variable, `--${variable} is ${value}, which is not a color ${format} can write: the authored value is kept`));
    }
    return value;
  };
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options);

  // The chart group fills chart-1 to chart-5 under the picks of `variables`, which win
  const chart = options.chart ? chartPicks(options.chart, brand.tokens, findings) : {};
  const picks = { ...chart, ...options.variables };
  const mapping = deriveShadcn(brand.roles, brand.roleTokens, picks, brand.tokens, brand.pairs);

  // The check role judges; the build role writes. A finding is in one of them, so a `blazon build` does not say it twice
  if (job.type === 'check') return { findings: [...clashFindings(mapping, brand.contexts, options.allowSame), ...foregroundFindings(mapping, options.themeInline)] };

  // A pick that names no token is reported and left out, so the variable falls back to its role
  const known = new Set(brand.tokens.map((token) => token.path));
  for (const [name, tokenPath] of Object.entries(options.variables))
    if (!known.has(tokenPath)) findings.push(finding('token-missing', 'error', tokenPath, `variables.${name} points at {${tokenPath}}, which is not a token`));

  const files = new Map([
    ['shadcn.json', formatShadcnJson(mapping)],
    ['shadcn.css', formatShadcnCss(mapping, brand.contexts, writerFor(options.format, findings))],
  ]);
  if (options.themeInline) files.set('shadcn-theme.css', formatShadcnTheme(mapping));
  // Written once, whole, after the work is done: a call that ends earlier leaves out_dir empty
  for (const [file, data] of files) fs.writeFileSync(path.join(job.outDir, file), data);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the shadcn files could not be written', NAME).then((code) => {
  process.exitCode = code;
});
