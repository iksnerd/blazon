import fs from 'node:fs';
import path from 'node:path';
import { boundFindings } from './bound.js';

// What the plugins blazon ships all do the same way: the reason a call cannot be answered, the first checks of a request, and the
// entry's answer on standard output (the browser is in chrome.ts, for the plugins that draw with one). Each plugin keeps what only it says: its name, manifest, roles and reasons.

/** The plugin cannot do what it was asked; the message is the reason blazon shows. */
export class Cannot extends Error {}

/**
 * An option the request carries is wrong. It is still a Cannot, so a unit test can ask for it as one; the entry answers it with an
 * `option-invalid` finding and exit 0 (nothing drawn), as social-cards does, so a mistake in the config is a finding to read and not a
 * plugin that broke.
 */
export class OptionError extends Cannot {}

/** The finding for a wrong option, under the plugin's name. */
export const optionFinding = (name: string, error: OptionError) => ({ code: `${name}/option-invalid`, severity: 'error' as const, path: 'options', message: error.message });

/** A finding as a plugin answers it: the code carries the plugin's name. */
export interface Finding {
  code: string;
  severity: 'error' | 'warning' | 'info';
  path: string;
  message: string;
}

/** The builder of a plugin's findings: `findingFor(NAME)('code', severity, path, message)` is a finding coded `NAME/code`. */
export const findingFor =
  (name: string) =>
  (code: string, severity: Finding['severity'], path: string, message: string): Finding => ({ code: `${name}/${code}`, severity, path, message });

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The brand.json a plugin reads: the object when its format and version are the ones this reader understands, Cannot otherwise (RFC 0001: a reader checks both before it interprets anything). */
export function requireBrand(raw: unknown): Record<string, unknown> {
  const shown = (value: unknown) => JSON.stringify(value) ?? 'nothing';
  if (!isObject(raw) || raw.format !== 'blazon-brand')
    throw new Cannot(`the brand in the request is not a blazon brand: its format is ${shown(isObject(raw) ? raw.format : undefined)}, not "blazon-brand"`);
  if (raw.version !== 1) throw new Cannot(`the brand in the request is version ${shown(raw.version)}; this reader understands version 1`);
  return raw;
}

/** The request as an object of version 1, or Cannot with the reason. Its role and folders are for the plugin to check. */
export function readRequest(text: string): Record<string, unknown> {
  let request: unknown;
  try {
    request = JSON.parse(text);
  } catch {
    throw new Cannot('the request is not JSON');
  }
  if (!isObject(request)) throw new Cannot('the request is not a JSON object');
  if (request.v !== 1) throw new Cannot(`the request is version ${JSON.stringify(request.v)}; this plugin speaks version 1`);
  return request;
}

/** What every build request carries: the site that was built, the folder to write in, the brand and the options as given. */
export interface BuildJob {
  siteDir: string;
  outDir: string;
  brand: unknown;
  options: unknown;
}

/** The build request in `text`, or Cannot with the reason: version 1, the build role, a site_dir with an index.html and an out_dir that is a folder. The brand and options are not checked here. */
export function buildJob(text: string): BuildJob {
  const request = readRequest(text);
  if (request.type !== 'build') throw new Cannot(`the request is for the ${String(request.type)} role; this plugin is a build plugin`);
  const { site_dir: siteDir, out_dir: outDir } = request;
  if (typeof siteDir !== 'string' || !fs.existsSync(path.join(siteDir, 'index.html'))) throw new Cannot('site_dir has no index.html');
  if (typeof outDir !== 'string' || !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) throw new Cannot('out_dir is not a folder');
  return { siteDir, outDir, brand: request.brand ?? {}, options: request.options ?? {} };
}

/**
 * The entry: `--blazon-manifest` prints the manifest; otherwise one request on standard input gets the answer of `build` as
 * JSON, or exit 2 with the reason as the first line of standard output. `failure` starts the reason for an error that is
 * not a Cannot. `name` is the plugin's, for the summary when the findings are bounded to what a call may print (bound.ts). Returns the exit status.
 */
export async function runPlugin(argv: string[], manifest: object, build: (text: string) => Promise<unknown>, failure: string, name: string): Promise<number> {
  if (argv[0] === '--blazon-manifest') {
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return 0;
  }
  try {
    const answer = await build(fs.readFileSync(0, 'utf-8'));
    const bounded = isObject(answer) && Array.isArray(answer.findings) ? { ...answer, findings: boundFindings(answer.findings, name) } : answer;
    process.stdout.write(`${JSON.stringify(bounded)}\n`);
    return 0;
  } catch (error) {
    const reason =
      error instanceof Cannot
        ? error.message
        : `${failure}: ${String((error as Error).message ?? error)
            .split('\n')[0]!
            .slice(0, 500)}`;
    process.stdout.write(`${reason}\n`);
    return 2;
  }
}
