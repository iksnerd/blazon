import fs from 'node:fs';
import path from 'node:path';
import { inputsWithin } from '../../core/outputs.js';
import { closest } from '../../core/suggest.js';
import type { Finding, BlazonConfig } from '../../types/index.js';
import { admit, LABEL_NOT_ACCEPTED, LONG_RUNNING, ONE_SHOT_NAMED, UNPINNED_MUST_PIN } from '../host/admit.js';
import { run, type Call, type Result } from '../host/call.js';
import { RunBreakers, type Gate } from './gate.js';
import { MANIFEST_TIMEOUT } from '../wire/limits.js';
import { LOCK_FILE, pinFor, readLock, type Lock } from '../pins/lock.js';
import { ManifestError, decodeManifest, manifestTimeout, type Manifest } from '../wire/manifest.js';
import { instanceIdTooLong, isPluginName } from '../../core/plugin-name.js';
import { BLAZON_CORE_PROFILE, BLAZON_PROFILE, roleRuntime } from '../wire/profile.js';
import { scrub } from '../host/scrub.js';
import { findShipped, shippedDirectory, type Shipped } from '../pins/shipped.js';
import { message, truncateGraphemes } from '../wire/text.js';
import { finding } from '../../core/checker/catalogue.js';
import { COULD_NOT_FIX, CONFIG_FIX, MANIFEST_EXIT_FIX, OUT_DIR_FIX, PROTOCOL_FIX, STOPPED_FIX, breakFix, labelFix, notFoundFix, pinFix, writableFix } from './fixes.js';

// The check and build roles (RFC 0002 section 2; RFC 0005). A PluginRun is one unit of work, a run
// of one blazon command: it reads the lock once, keeps a breaker for each plugin, and turns whatever happens into
// findings. A plugin that cannot answer is a finding about the plugin, never a pass.

export type Role = 'check' | 'build';

/** Labelled secret without the operator's help: the profile's prefix (the profile's `secret_env_prefixes`). */
const SECRET_PREFIXES: readonly string[] = BLAZON_PROFILE.secret_env_prefixes;
/** The most findings one answer may hold; more is an answer blazon refuses. */
export const MAX_FINDINGS = 500;
const MAX_MESSAGE = 1000;
const MAX_PATH = 500;
/** How much of a broken plugin's stderr a finding shows: its last lines, at most this many, and at most this many characters */
const STDERR_LINES = 5;
const STDERR_CHARS = 500;
const SEVERITIES = ['error', 'warning', 'info'];
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/gu;

export interface PluginRunOptions {
  /** Programs the operator named on the command line: they run unpinned, once, with a warning */
  named?: readonly string[];
  /** Where a warning goes. Default: stderr */
  log?: (line: string) => void;
  /** The environment variables a plugin may be given; default: this process's */
  env?: NodeJS.ProcessEnv;
  /** Where verified copies of pinned plugins are made; default: the system's temporary directory */
  store?: string;
  /** What stops a plugin that keeps breaking; default: three breaks in a row stop it for this run. The dev server passes a cooldown */
  gate?: Gate;
  /** The folder that holds the plugins shipped with blazon and their lock; default: plugins/ at blazon's package root. For tests, so no variable or key sets it */
  shipped?: string;
}

interface Target {
  /** The plugin: its program and its pin (RFC 0014 section 4) */
  name: string;
  /** The instance: what the entry is called, and what owns its output folder and its breaker (sections 5.3, 5.4). The plugin's name when the entry has no `as` */
  id: string;
  /** Whether a person needs the id to tell this use from another: the plugin is listed more than once, or the id is not its name (section 6.1) */
  shown: boolean;
  options: Record<string, unknown>;
  /** The program the operator named on the command line, when there is one */
  named?: string;
  /** Where the id came from, for a person: `plugins[0].as`, `plugins[1].name` or `--plugin <program>` */
  from: string;
  /** Why the target is refused before it is started, when it is */
  problem?: string;
}

const NOT_A_PROGRAM = '--plugin must name a program called blazon-<plugin name>, such as blazon-acme.house-style';

type Located = { pin: ReturnType<typeof pinFor>; path: string } | { shipped: Shipped } | { program: string } | { problem: string; fix: string };

/**
 * A finding about the plugin. Its `path` is the plugin's name, which the message does not repeat: it reads "acme.a: is not pinned…". For an instance the path is its id and the message starts with the plugin.
 * `fix` is what to do about this cause; without one the catalogue's fix for plugin-failed stands.
 */
const failedFinding = (name: string, reason: string, of?: string, fix?: string): Finding =>
  finding('plugin-failed', { path: name, message: of === undefined ? reason : `instance of ${of}: ${reason}`, ...(fix !== undefined && { fix }) });
/** A finding about a call of `target`: the instance's id and the plugin when the plugin is listed more than once (RFC 0014 section 6.1), the plugin's name otherwise. */
const failedFor = (target: Target, reason: string, fix?: string): Finding => (target.shown ? failedFinding(target.id, reason, target.name, fix) : failedFinding(target.name, reason, undefined, fix));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unsafe = (stat: fs.Stats) => (stat.mode & 0o022) !== 0;

/** What a plugin printed, as text: the secrets and the characters a person should not see taken out, and cut to a length. */
function plain(value: string, secrets: readonly string[], limit: number): string {
  return truncateGraphemes(scrub(value, secrets).replace(CONTROL_OR_FORMAT, '').trim(), limit);
}

/**
 * The end of what a call that broke wrote to stderr, as one line to add to the reason: its last non-empty lines, scrubbed of
 * every labelled value and of the characters a terminal acts on, joined with " | " so no line of it can pass for a line of
 * blazon's, and cut from the front to a length. Empty when it wrote nothing. Never used for a call that answered.
 */
export function stderrTail(stderr: Buffer, secrets: readonly string[]): string {
  const lines = scrub(stderr, secrets)
    .toString('utf-8')
    .split(/\r?\n|\r/)
    .map((line) => line.replace(CONTROL_OR_FORMAT, '').trim())
    .filter((line) => line !== '');
  const text = lines.slice(-STDERR_LINES).join(' | ');
  const chars = Array.from(text);
  return chars.length <= STDERR_CHARS ? text : `…${chars.slice(chars.length - STDERR_CHARS + 1).join('')}`;
}

/** What to add to the reason a call failed: the end of its stderr, or nothing when it wrote none. */
function tailOf(result: Result, secrets: readonly string[]): string {
  const tail = stderrTail(result.stderr, secrets);
  return tail === '' ? '' : `; stderr: ${tail}`;
}

/** The reason a call broke, with the end of its stderr when it wrote any. */
const brokeWith = (result: Result, secrets: readonly string[]): string => `${result.breakReason}${tailOf(result, secrets)}`;

export class PluginRun {
  private readonly lock: Lock;
  private lockProblems: Finding[];
  private readonly gate: Gate;
  private readonly env: NodeJS.ProcessEnv;
  private readonly log: (line: string) => void;

  constructor(
    private readonly config: BlazonConfig,
    private readonly cwd: string,
    private readonly options: PluginRunOptions = {}
  ) {
    const { lock, problems } = readLock(cwd);
    this.lock = lock;
    this.lockProblems = problems;
    this.env = options.env ?? process.env;
    this.gate = options.gate ?? new RunBreakers();
    this.log = options.log ?? ((line) => console.error(line));
  }

  /** Whether the config or the command line allows any plugin at all. Without one, nothing is read, built or run. */
  get active(): boolean {
    return this.targets().length > 0 || this.lockProblems.length > 0;
  }

  /** The `check` role: every plugin that fills it judges the brand. `brand` is the content of brand.json. */
  check(brand: unknown): Promise<Finding[]> {
    return this.each('check', brand);
  }

  /** The `build` role: every plugin that fills it makes something from the brand, in its own out_dir. */
  build(brand: unknown, siteDir: string): Promise<Finding[]> {
    return this.each('build', brand, path.resolve(siteDir));
  }

  private async each(role: Role, brand: unknown, siteDir?: string): Promise<Finding[]> {
    const findings = this.lockProblems;
    this.lockProblems = []; // reported once, with the first role that runs
    for (const target of this.targets()) findings.push(...(await this.one(target, role, brand, siteDir)));
    return findings;
  }

  /**
   * The plugins that may run: those in the config, in its order, then programs named on the command line. This is the one list
   * of the ids that run, so every id is checked here (RFC 0014 sections 3.1 and 3.3), whichever place it came from: it is at
   * most 64 characters, and no two targets share one, because the id owns an output folder and a breaker. The first to take an
   * id keeps it; a later target that breaks a rule is refused with a finding and never started.
   */
  private targets(): Target[] {
    const named = new Map<string, string>();
    const refused: Target[] = [];
    for (const given of this.options.named ?? []) {
      const program = path.resolve(this.cwd, given);
      const name = path.basename(program).replace(/^blazon-/, '');
      const first = named.get(name);
      if (!isPluginName(name)) refused.push({ name: path.basename(program), id: path.basename(program), from: `--plugin ${program}`, shown: false, options: {}, problem: NOT_A_PROGRAM });
      else if (first !== undefined && first !== program)
        refused.push({ name, id: name, from: `--plugin ${program}`, shown: false, options: {}, problem: `--plugin ${program} names the plugin ${name}, which --plugin ${first} names already: one run takes one program for a plugin` });
      else named.set(name, program);
    }
    const entries = this.config.plugins ?? [];
    const targets: Target[] = entries.map((entry, index) => {
      const id = entry.as ?? entry.name;
      const from = `plugins[${index}]${entry.as === undefined ? '.name' : '.as'}`;
      return { name: entry.name, id, from, shown: id !== entry.name || entries.filter((other) => other.name === entry.name).length > 1, options: entry.options ?? {}, ...(named.has(entry.name) && { named: named.get(entry.name) }) };
    });
    for (const [name, program] of named) if (!targets.some((target) => target.name === name)) targets.push({ name, id: name, from: `--plugin ${program}`, shown: false, options: {}, named: program });
    const owners = new Map<string, Target>();
    const checked = targets.map((target): Target => {
      const long = instanceIdTooLong(target.id);
      if (long) return { ...target, problem: `the id ${long}` };
      const owner = owners.get(target.id);
      if (owner)
        return { ...target, problem: `the id ${target.id} of ${target.from} is already the id of ${owner.from} (an instance of ${owner.name}): two instances with one id would share the output folder and the breaker. Give one of them another "as"` };
      owners.set(target.id, target);
      return target;
    });
    return [...checked, ...refused];
  }

  /** Where a plugin is: pinned in the project's lock, shipped with blazon, or a program found by name. A pinned or shipped plugin is never searched for. */
  private locate(target: Target): Located {
    const entry = this.lock.plugins[target.name];
    if (entry) return { pin: pinFor(this.cwd, entry), path: entry.path };
    const shipped = this.shipped(target.name);
    if (shipped) return shipped;
    if (target.named) return { program: target.named };
    const program = `blazon-${target.name}`;
    const directory = path.join(this.cwd, '.blazon', 'plugins');
    const places = [path.join(directory, program), ...(this.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, program))];
    for (const candidate of places) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (!stat.isFile() || (stat.mode & 0o111) === 0) continue;
      if (unsafe(stat)) return { problem: `${candidate} is writable by group or others, so blazon will not run it`, fix: writableFix(candidate) };
      if (candidate.startsWith(directory) && unsafe(fs.statSync(directory))) return { problem: `${directory} is writable by group or others, so blazon will not run a plugin from it`, fix: writableFix(directory) };
      return { program: candidate };
    }
    const meant = closest(target.name, this.pluginNames());
    return { problem: `no program found: it is not pinned (see blazon plugin pin), and there is no ${program} in .blazon/plugins or on PATH${meant ? `; did you mean "${meant}"?` : ''}`, fix: notFoundFix(target.name) };
  }

  /** The names a plugin could have been meant by: those pinned in the lock, shipped with blazon, or found as programs in .blazon/plugins. */
  private pluginNames(): string[] {
    const names = new Set(Object.keys(this.lock.plugins));
    const add = (directory: string, toName: (entry: string) => string): void => {
      try {
        for (const entry of fs.readdirSync(directory)) if (isPluginName(toName(entry))) names.add(toName(entry));
      } catch {
        // no such folder: nothing to suggest from it
      }
    };
    try {
      add(this.options.shipped ?? shippedDirectory(), (entry) => entry);
    } catch {
      // not run from a package: nothing ships
    }
    add(path.join(this.cwd, '.blazon', 'plugins'), (entry) => entry.replace(/^blazon-/, ''));
    return [...names];
  }

  /** The plugin of that name in blazon's package, ahead of every program found by name, so nothing in .blazon/plugins or on PATH can take its place. */
  private shipped(name: string): Located | undefined {
    let directory: string;
    try {
      directory = this.options.shipped ?? shippedDirectory();
    } catch {
      return undefined; // not run from a package: nothing ships
    }
    const found = findShipped(directory, name);
    if (found === undefined) return undefined;
    return 'problem' in found ? { problem: found.problem, fix: breakFix('install', name)! } : { shipped: found };
  }

  private callFor(located: Located, base: Call): Call {
    if ('pin' in located) return { ...base, pin: located.pin, store: this.options.store };
    if ('shipped' in located) return { ...base, shipped: located.shipped };
    return { ...base, program: (located as { program: string }).program };
  }

  private async one(target: Target, role: Role, brand: unknown, siteDir: string | undefined): Promise<Finding[]> {
    const { name, id } = target;
    const failed = (reason: string, fix?: string): Finding => failedFor(target, reason, fix);
    if (target.problem) return [failed(target.problem, CONFIG_FIX)];
    if (target.name.length > 0 && !isPluginName(name)) return [failed(NOT_A_PROGRAM, CONFIG_FIX)];

    const located = this.locate(target);
    if ('problem' in located) return [failed(located.problem, located.fix)];
    const pinPath = 'pin' in located ? located.path : undefined;
    const pinned = 'pin' in located || 'shipped' in located;

    // A plugin that has been stopped is not started at all, not even for its manifest
    const runtime = roleRuntime(role);
    const stopped = runtime.breaker ? this.gate.stopped(id) : undefined;
    if (stopped) return [failed(stopped, STOPPED_FIX)];

    // The manifest call: what the plugin is, before anything else is asked of it.
    const manifestAnswer = await run(this.callFor(located, { args: [`--${BLAZON_PROFILE.host}-manifest`], timeout: MANIFEST_TIMEOUT }));
    // A manifest call that broke counts as a break; one that answered says nothing, so it does not reset a count
    if (runtime.breaker && !manifestAnswer.answered) this.gate.record(id, 'break');
    // The manifest call is given no variables, so no labelled value can be in its stderr; scrub every one this process holds all the same
    const held = Object.entries(this.env).flatMap(([variable, value]) => (value && SECRET_PREFIXES.some((prefix) => variable.startsWith(prefix)) ? [value] : []));
    if (!manifestAnswer.answered) return [failed(`the manifest call did not exit 0 (${manifestAnswer.breakReason})${tailOf(manifestAnswer, held)}`, breakFix(manifestAnswer.cause, name, pinPath))];
    if (manifestAnswer.code !== 0) return [failed(`the manifest call did not exit 0 (exit ${manifestAnswer.code})${tailOf(manifestAnswer, held)}`, MANIFEST_EXIT_FIX)];
    let manifest: Manifest;
    try {
      manifest = decodeManifest(manifestAnswer.stdout, BLAZON_CORE_PROFILE);
    } catch (err) {
      return [failed(`its manifest is not one blazon loads: ${err instanceof ManifestError ? err.message : String(err)}`, PROTOCOL_FIX)];
    }
    if (!manifest.roles.includes(role)) return [];

    // Admission (3.5 and 3.6): a check plugin authorizes, so it must be pinned unless the operator named it.
    const labelled = manifest.env.filter((variable) => SECRET_PREFIXES.some((prefix) => variable.startsWith(prefix)));
    const admission = admit(manifest, { env: labelled }, [], pinned, target.named ? ONE_SHOT_NAMED : LONG_RUNNING, { authorizes: role === 'check' });
    if (!admission.admitted) {
      if (admission.reason === LABEL_NOT_ACCEPTED) {
        const variable = labelled.find((candidate) => !manifest.secretEnv.includes(candidate));
        return [failed(`takes ${variable}, which is labelled secret, but its manifest does not list it in secret_env, so it is not started`, labelFix(variable!))];
      }
      if (admission.reason === UNPINNED_MUST_PIN)
        return [failed(`is not pinned, and a ${role} plugin must be: run blazon plugin pin <path> --name ${name}`, pinFix('program' in located ? located.program : '<path>', name))];
      return [failed(`is not admitted (${admission.reason})`)];
    }
    if (admission.warn) this.log(`  warning: ${name} runs unpinned because it was named on the command line`);

    // The request. A build plugin gets a directory of its own, emptied for each run.
    const request: Record<string, unknown> = { v: 1, type: role, options: target.options, brand };
    if (role === 'build') {
      const outDir = path.resolve(this.cwd, this.config.tokensOutDir, id);
      // Emptying the folder is the plugin writer's own act, so it asks here as well as in the output check, which only knows the plugins the
      // config lists: a plugin named on the command line has a folder too
      const held = inputsWithin(this.config, this.cwd, outDir);
      if (held.length > 0)
        return [failed(`its output folder ("${path.relative(this.cwd, outDir) || outDir}") holds ${held.map((i) => `${i.name} ("${i.as}")`).join(', ')}, which the brand reads: blazon empties that folder before a build plugin runs and would delete ${held.length === 1 ? 'it' : 'them'}. Move the file, or move tokensOutDir`, OUT_DIR_FIX)];
      fs.rmSync(outDir, { recursive: true, force: true });
      fs.mkdirSync(outDir, { recursive: true });
      // tokens_dir: where `blazon build` has already written the token files (theme.css, tokens.json...), which are the plugin's input when it works from the tokens
      Object.assign(request, { site_dir: siteDir, tokens_dir: path.resolve(this.cwd, this.config.tokensOutDir), out_dir: outDir });
    }
    const body = Buffer.from(JSON.stringify(request));
    if (body.length > BLAZON_PROFILE.request_cap_bytes) return [failed(`the request is ${body.length} bytes, over the cap of ${BLAZON_PROFILE.request_cap_bytes}`)];

    const env = Object.fromEntries(manifest.env.flatMap((variable) => (this.env[variable] === undefined ? [] : [[variable, this.env[variable]!]])));
    const secrets = labelled.flatMap((variable) => (env[variable] ? [env[variable]] : []));
    const result = await run(this.callFor(located, { stdin: body, env, timeout: manifestTimeout(manifest, BLAZON_CORE_PROFILE), stdoutLimit: runtime.stdoutLimit, answers: runtime.answers }));

    const outcome = this.outcome(target, role, result, secrets, pinPath);
    if (runtime.breaker) this.gate.record(id, 'failure' in outcome ? outcome.ended : 'answer');
    return 'failure' in outcome ? [outcome.failure] : outcome.findings;
  }

  /** What a call that ended means: the findings it answered with, or one finding about the plugin. */
  private outcome(target: Target, role: Role, result: Result, secrets: readonly string[], pinPath?: string): { findings: Finding[] } | { failure: Finding; ended: 'break' | 'exit-2' } {
    const { name } = target;
    const failed = (reason: string, fix?: string): Finding => failedFor(target, reason, fix);
    if (!result.answered) return { failure: failed(brokeWith(result, secrets), breakFix(result.cause, name, pinPath)), ended: 'break' };
    if (result.code === 2) {
      const reason = message(scrub(result.stdout, secrets), `plugin ${name} could not answer`);
      return { failure: failed(`could not answer: ${reason}`, COULD_NOT_FIX), ended: 'exit-2' };
    }
    const parsed = readAnswer(role, name, result.stdout, secrets, target.shown ? target.id : undefined);
    return 'problem' in parsed ? { failure: failed(parsed.problem, PROTOCOL_FIX), ended: 'break' } : { findings: parsed.findings };
  }
}

/** The findings in a plugin's answer of `role`, if the answer follows the rules; otherwise what is wrong with it. `name` is the plugin's, the prefix of its codes; `instance` is the id to name when the plugin is listed more than once. */
export function readAnswer(role: Role, name: string, stdout: Buffer, secrets: readonly string[], instance?: string): { findings: Finding[] } | { problem: string } {
  const text = stdout.toString('utf-8');
  if (role === 'build' && text.trim() === '') return { findings: [] };
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch {
    return { problem: 'its answer is not JSON' };
  }
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return { problem: 'its answer must be a JSON object' };
  const list = (answer as Record<string, unknown>).findings;
  if (list === undefined && role === 'build') return { findings: [] };
  if (!Array.isArray(list)) return { problem: "its answer's findings must be a list" };
  if (list.length > MAX_FINDINGS) return { problem: `its answer has more than ${MAX_FINDINGS} findings` };

  // The code prefix is the plugin's own. A plugin listed more than once also says which instance, at the end of the message, and the suffix counts toward the message cap
  const suffix = instance === undefined ? '' : ` (instance ${instance})`;
  const prefix = `${name}/`;
  const findings: Finding[] = [];
  for (const [index, item] of list.entries()) {
    const wrong = (reason: string) => ({ problem: `finding ${index + 1}: ${reason}` });
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return wrong('must be an object');
    const { code, severity, path: where, message: what } = item as Record<string, unknown>;
    if (typeof code !== 'string' || !code.startsWith(prefix)) return wrong(`code must start with "${prefix}"`);
    if (!new RegExp(`^${escapeRegExp(prefix)}[a-z0-9-]+$`).test(code)) return wrong(`code must be "${prefix}" followed by lowercase letters, digits and hyphens`);
    if (typeof severity !== 'string' || !SEVERITIES.includes(severity)) return wrong('severity must be error, warning or info');
    const cleanPath = typeof where === 'string' ? plain(where, secrets, MAX_PATH) : '';
    if (cleanPath === '') return wrong('path must be a non-empty string');
    const cleanMessage = typeof what === 'string' ? plain(what, secrets, MAX_MESSAGE - Array.from(suffix).length) : '';
    if (cleanMessage === '') return wrong('message must be a non-empty string');
    findings.push({ code, severity: severity as Finding['severity'], path: cleanPath, message: `${cleanMessage}${suffix}` });
  }
  return { findings };
}

export { LOCK_FILE };
