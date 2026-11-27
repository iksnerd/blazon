import fs from 'node:fs';
import path from 'node:path';
import pc from '../../core/colors.js';
import { errorText, BlazonError, jsonError, jsonMessage, type ErrorCode } from '../errors.js';
import { loadProject } from '../project.js';
import { compileBlazonData } from '../../core/index.js';
import { customProperties, driftFinding, type DriftFinding } from '../../core/drift/compare.js';
import { readCss } from '../../core/drift/read.js';
import type { Network } from '../../core/drift/fetch.js';

export interface DriftOptions {
  /** The project folder; the current folder by default */
  cwd?: string;
  /** Print the findings as JSON */
  json?: boolean;
  /** The tokens folder, instead of the one the config names */
  tokens?: string;
  /** Where a fetch may connect. Only a test passes one; the command line has no flag for it */
  network?: Network;
}

/** Compares every token that names a `cssVar` with the live CSS. Returns the exit status: 0 no drift, 1 drift or missing, 2 usage or fetch error. */
export async function runDrift(target: string | undefined, options: DriftOptions = {}): Promise<number> {
  /** The command could not compare: the reason on standard error in the one shape of an error, and under --json as an error object on standard output. Exit 2. */
  const cannot = (code: ErrorCode, what: string, fix?: string): number => {
    console.error(errorText('drift', what, fix).replace(/^blazon drift:/, (prefix) => pc.red(prefix)));
    if (options.json) console.log(JSON.stringify({ command: 'drift', passed: false, error: { ...jsonError(code, jsonMessage(what, fix), fix) } }));
    return 2;
  };
  if (!target) return cannot('missing-argument', 'needs the address of a page or the path of a CSS file', 'Run blazon drift <url-or-css-file>.');
  const cwd = options.cwd ?? process.cwd();
  // A file that is not there is a typo in what was typed: say it as typed, not as Node's ENOENT with the absolute path
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target) && !fs.existsSync(path.resolve(target)))
    return cannot('no-file', `there is no file "${target}"`, 'Give the path of a CSS file, or the http(s) address of a page.');
  let sources: string[];
  let findings: DriftFinding[];
  try {
    const config = await loadProject(cwd, options.tokens ? { tokensDir: options.tokens } : undefined);
    const data = await compileBlazonData(config, cwd);
    const css = await readCss(target, options.network);
    sources = css.sources;
    const vars = customProperties(css.css);
    findings = data.tokens.items.flatMap((item) => {
      const cssVar = item.blazon.source?.cssVar;
      return typeof cssVar === 'string' ? [driftFinding(item, cssVar, vars)] : [];
    });
  } catch (err) {
    return cannot(err instanceof BlazonError ? err.code : 'error', err instanceof Error ? err.message : String(err), err instanceof BlazonError ? err.fix : undefined);
  }
  // A gate that compares nothing passes for the wrong reason: the project has no token that says where the site's value is
  if (findings.length === 0)
    return cannot(
      'error',
      'no token declares a source.cssVar, so there is nothing to compare',
      "Name the site's custom property in a token's dev.blazon source.cssVar (manual chapter 2).",
    );

  const count = (status: DriftFinding['status']) => findings.filter((f) => f.status === status).length;
  const summary = { ok: count('ok'), drift: count('drift'), missing: count('missing') };
  const code = summary.drift + summary.missing > 0 ? 1 : 0;

  if (options.json) {
    console.log(JSON.stringify({ target, sources, summary, tokens: findings }, null, 2));
    return code;
  }
  const width = Math.max(...findings.map((f) => f.path.length));
  for (const f of findings) {
    const name = f.path.padEnd(width);
    if (f.status === 'ok') console.log(`${pc.green('ok     ')} ${name}  ${pc.dim(f.cssVar)}`);
    else if (f.status === 'drift') console.log(`${pc.red('drift  ')} ${name}  ${f.cssVar}: token ${f.expected}, site ${f.actual}`);
    else console.log(`${pc.yellow('missing')} ${name}  ${f.cssVar} is not declared (token ${f.expected})`);
  }
  console.log(`\n${summary.ok} ok, ${summary.drift} drifted, ${summary.missing} missing`);
  return code;
}
