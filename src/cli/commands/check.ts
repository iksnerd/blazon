import pc from '../../core/colors.js';
import { loadProject } from '../project.js';
import { blazonPinFindings } from '../../core/blazon-pin.js';
import { compileBlazonData } from '../../core/index.js';
import { fixOf } from '../../core/checker/fixes.js';
import { findingLocation } from '../../core/checker/location.js';
import { summarizeFindings, type CheckResult } from '../../core/checker/index.js';
import type { Finding, BlazonData } from '../../types/index.js';
import { applyCheckPlugins } from '../../plugins/roles/integrate.js';
import { PluginRun } from '../../plugins/roles/roles.js';
import { BlazonError, type ErrorCode } from '../errors.js';
import { blazonCommand, inDir, shownDir } from '../where.js';

/** A check found errors. The findings travel with it, for `--json`, which prints them before the command ends. */
export class CheckFailed extends BlazonError {
  constructor(
    message: string,
    readonly findings: Finding[],
    fix?: string,
    code: ErrorCode = 'check-failed',
  ) {
    super(message, fix, code);
  }
}

/** What a command may be told about plugins: programs named on the command line, which run unpinned, once, with a warning. */
export interface PluginOptions {
  plugin?: string | string[];
  /** `--no-plugins`: false when given, so no plugin runs at all, whatever the config lists. */
  plugins?: boolean;
}

/** Whether `--no-plugins` was given. */
export const pluginsOff = (options?: PluginOptions): boolean => options?.plugins === false;

export const namedPlugins = (options?: PluginOptions): string[] => (options?.plugin === undefined ? [] : [options.plugin].flat());

function where(f: { path: string; context?: string }): string {
  return f.context ? `${f.path} (${f.context})` : f.path;
}

const NAMES_SHOWN = 5;

/** The first few names, then how many more: "a, b, c, d, e and 3 more". */
function listNames(names: string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).join(', ');
  return names.length > NAMES_SHOWN ? `${shown} and ${names.length - NAMES_SHOWN} more` : shown;
}

const folderOf = (f: Finding): string => f.path.split('/')[0]!;

/**
 * The text of one severity's findings, a line each, except two kinds that would repeat: `starter-file-unchanged` notes (one line
 * for each folder), `review-pending` warnings with one message (one line) and `page-review-pending` warnings (one line
 * with the page count, each page's own message stays in the findings). The findings themselves stay one for each file.
 * A finding that names a file starts with `file:line` from where blazon was run (`dir`), as compilers print it, so a terminal
 * or an editor opens it at the line.
 */
function lines(findings: Finding[], dir: string): string[] {
  const out: string[] = [];
  const folded = new Set<Finding>();
  const starters = new Map<string, Finding[]>();
  const reviews = new Map<string, Finding[]>();
  const inUse = findings.filter((f) => f.code === 'page-review-pending');
  for (const f of findings) {
    if (f.code === 'starter-file-unchanged') starters.set(folderOf(f), [...(starters.get(folderOf(f)) ?? []), f]);
    if (f.code === 'review-pending') reviews.set(f.message, [...(reviews.get(f.message) ?? []), f]);
  }

  for (const f of findings) {
    if (folded.has(f)) continue;
    const star = f.code === 'starter-file-unchanged' ? starters.get(folderOf(f))! : undefined;
    const review = f.code === 'review-pending' ? reviews.get(f.message)! : undefined;
    if (f.code === 'page-review-pending' && inUse.length > 1) {
      inUse.forEach((x) => folded.add(x));
      out.push(
        `${pc.bold(`page-review-pending (${inUse.length} pages)`)}: ${listNames(inUse.map(where))}: show assets still marked needs-review ${pc.dim('[page-review-pending]')}`,
      );
    } else if (star && star.length > 1) {
      star.forEach((x) => folded.add(x));
      const folder = folderOf(f);
      const names = star.map((x) => x.path.slice(folder.length + 1));
      out.push(`${pc.bold(`${folder}/`)}: ${star.length} files are still the starter's text (${listNames(names)}) ${pc.dim('[starter-file-unchanged]')}`);
    } else if (review && review.length > 1) {
      review.forEach((x) => folded.add(x));
      out.push(`${pc.bold(`review-pending (${review.length})`)}: ${listNames(review.map(where))}: ${f.message} ${pc.dim('[review-pending]')}`);
    } else {
      const at = findingLocation(f, dir);
      const subject = at === undefined ? pc.bold(where(f)) : f.path === f.file ? pc.bold(at) : `${pc.bold(at)}  ${where(f)}`;
      out.push(`${subject}: ${f.message} ${pc.dim(`[${f.code}]`)}`);
    }
  }
  return out;
}

/** Every command that reports findings in text (check, tokens, build) prints them here. `dir` is the project as shownDir gives it. */
export function printFindings(result: CheckResult, dir: string = ''): void {
  for (const line of lines(result.errors, dir)) console.log(`  ${pc.bgRed(pc.white(' ERROR '))} ${line}`);
  for (const line of lines(result.warnings, dir)) console.log(`  ${pc.bgYellow(pc.black(' WARN '))}  ${line}`);
  for (const line of lines(result.infos, dir)) console.log(`  ${pc.bgCyan(pc.black(' NOTE '))}  ${line}`);
}

/** A project that is still mostly the starter gets three steps to begin with. A nearly finished brand sees nothing extra. */
const STARTER_NOTES_FOR_NEXT = 5;

export function printNext(result: CheckResult, dir: string = ''): void {
  if (result.infos.filter((f) => f.code === 'starter-file-unchanged').length < STARTER_NOTES_FOR_NEXT) return;
  console.log(pc.bold('Next:'));
  console.log(`  1. Edit ${pc.cyan(inDir(dir, 'tokens/colors.json'))} with your colors`);
  console.log(`  2. Run ${pc.cyan(blazonCommand('dev', dir))} to see the book`);
  console.log(`  3. Replace blazon's artwork in ${pc.cyan(inDir(dir, 'assets/'))} and the text in ${pc.cyan(inDir(dir, 'docs/'))}`);
  console.log();
}

const FIXES_SHOWN = 3;

/** After a failed check: what to do about each kind of error found, so the next step is on the screen. Two findings of one code with different causes (plugin-failed) each give their own fix. */
export function printFailed(result: CheckResult, dir: string = ''): void {
  const steps = new Map<string, { code: string; fix: string }>();
  for (const f of result.errors) {
    const fix = fixOf(f);
    if (fix && !steps.has(`${f.code}\n${fix}`)) steps.set(`${f.code}\n${fix}`, { code: f.code, fix });
  }
  const shown = [...steps.values()].slice(0, FIXES_SHOWN);
  console.log(pc.bold('Next:'));
  shown.forEach(({ code, fix }, i) => console.log(`  ${i + 1}. ${pc.cyan(code)}: ${fix}`));
  console.log(`  ${shown.length + 1}. Run ${pc.cyan(blazonCommand('check', dir))} again`);
  console.log();
}

/**
 * Runs before `blazon tokens` and `blazon build`: prints findings and throws if any are errors.
 * Uses the compiled findings, which cover every resolver context and the theme and logo config.
 */
export function assertTokensPass(data: BlazonData, cwd: string = process.cwd()): void {
  const result = summarizeFindings(data.findings);
  if (result.all.length === 0) return;
  const dir = shownDir(cwd);
  console.log();
  printFindings(result, dir);
  console.log();
  if (result.errors.length > 0) {
    throw new CheckFailed(`blazon check found ${result.errors.length} error(s)`, data.findings, `Fix them, or run ${blazonCommand('check', dir)} for details.`);
  }
}

/** Prints what it found. Returns the findings and whether the check passed; the caller sets the exit status. */
export async function runCheck(cwd: string = process.cwd(), strict: boolean = false, options?: PluginOptions): Promise<{ findings: Finding[]; passed: boolean }> {
  const config = await loadProject(cwd);
  console.log(pc.cyan(`\n[blazon] Checking design tokens...`));
  const data = await compileBlazonData(config, cwd);
  data.findings.push(...blazonPinFindings(cwd));
  if (!pluginsOff(options)) await applyCheckPlugins(data, config, cwd, new PluginRun(config, cwd, { named: namedPlugins(options) }));
  const result = summarizeFindings(data.findings, { strict });

  if (result.all.length === 0) {
    console.log(pc.green(`\n  ✔ ${data.tokens.items.length} tokens, no findings.\n`));
    return { findings: result.all, passed: true };
  }

  const counts = [
    result.errors.length > 0 && `${result.errors.length} error(s)`,
    result.warnings.length > 0 && `${result.warnings.length} warning(s)`,
    result.infos.length > 0 && `${result.infos.length} note(s)`,
  ].filter(Boolean);
  // Errors and warnings are always named, even at zero, as before; notes only when there are some
  const headline =
    result.errors.length + result.warnings.length > 0
      ? `${result.errors.length} error(s) and ${result.warnings.length} warning(s)${result.infos.length > 0 ? ` and ${result.infos.length} note(s)` : ''}`
      : counts.join(' and ');
  const dir = shownDir(cwd);
  console.log(`\nFound ${headline}:\n`);
  printFindings(result, dir);
  console.log();
  // The starter's three steps are for a book that checks out; with errors, the next step is to fix them
  if (result.errors.length > 0) printFailed(result, dir);
  else printNext(result, dir);

  if (!result.passed) {
    console.error(pc.red(`✖ Check failed${strict ? ' (--strict treats warnings as errors)' : ''}.\n`));
    return { findings: result.all, passed: false };
  }
  console.log(result.warnings.length > 0 ? pc.yellow(`✔ Check passed with warnings.\n`) : pc.green(`✔ Check passed.\n`));
  return { findings: result.all, passed: true };
}
