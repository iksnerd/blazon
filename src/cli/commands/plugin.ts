import fs from 'node:fs';
import path from 'node:path';
import pc from '../../core/colors.js';
import { UsageError } from '../errors.js';
import { shippedLayoutProblem } from '../../core/plugin-name.js';
import { check, type CheckResult } from '../../plugins/host/check.js';
import { LOCK_FILE, recordPin } from '../../plugins/pins/lock.js';
import { Refused, fileDigest, treeDigest } from '../../plugins/pins/pin.js';
import { blazonRoleCases } from '../../plugins/roles/check-cases.js';
import { BLAZON_CORE_PROFILE, BLAZON_PROFILE, blazonRequests } from '../../plugins/wire/profile.js';

// The two commands of blazon as a host of the plugin protocol (RFC 0005) (RFC 0002 section 2).

const USAGE = {
  plugin: 'usage: blazon plugin check <program> [--core] | blazon plugin pin <path> [--name <plugin name>] | blazon plugin profile',
  check: 'usage: blazon plugin check <program> [--core]',
  pin: 'usage: blazon plugin pin <path> [--name <plugin name> [--digest <digest>] [--entry <path>]]',
};

/** The flags of `blazon plugin pin`: with `name`, the pin is recorded in the lock. */
export interface PinOptions {
  name?: string;
  /** A digest the operator vouches for: the bytes must be those */
  digest?: string;
  /** The program inside a directory, when it is not blazon-<name> */
  entry?: string;
}

function line(result: CheckResult): string {
  const mark = result.warning ? pc.yellow('warn') : result.passed ? pc.green('ok  ') : result.skipped ? pc.dim('skip') : pc.red('FAIL');
  const role = result.role ? `${result.role}: ` : '';
  const detail = result.detail ? ` (${result.detail})` : '';
  return `  ${mark}  ${result.case}  ${role}${result.name}${detail}`;
}

/**
 * Start the plugin the way blazon does and run the core cases of section 9, then blazon's cases for each role the manifest
 * declares (6 to 9). With `core`, only the core cases run: no role cases and no layout line, so a plugin that does not follow blazon's own
 * rules (the code prefix, the layout of a shipped plugin) can still be checked against the protocol. Prints the host and what it adopts first, so the output says which members of the family it covers.
 * Returns the exit status: 0 when every case passed (a warning is a pass), 1 when one failed; bad arguments throw a UsageError (exit 2).
 */
export async function runPluginCheck(program?: string, options: { json?: boolean; core?: boolean } = {}): Promise<number> {
  if (!program) throw new UsageError(USAGE.check, undefined, 'missing-argument');
  const core = options.core === true;
  if (!options.json) {
    console.log(`${BLAZON_PROFILE.host} plugin check: host ${BLAZON_PROFILE.host}, adopts: ${BLAZON_PROFILE.adopts.length > 0 ? BLAZON_PROFILE.adopts.join(', ') : 'none'}`);
    if (core) console.log('core cases only (1 to 5): no role cases, no layout line');
  }
  const results = await check({
    host: BLAZON_PROFILE.host,
    profile: BLAZON_CORE_PROFILE,
    program,
    validate: false,
    requests: blazonRequests(),
    ...(core ? {} : { roleCases: blazonRoleCases(program) }),
  });
  const warnings = results.filter((result) => result.warning).length;
  const failed = results.filter((result) => !result.passed && !result.skipped);
  // Not a protocol case: a program in the layout of a shipped plugin (RFC 0005 section 3.6) must have the file name that layout gives it.
  const layout = core ? undefined : shippedLayoutProblem(path.resolve(program));
  if (options.json) {
    const status = (result: CheckResult): 'ok' | 'warn' | 'skip' | 'fail' => (result.warning ? 'warn' : result.passed ? 'ok' : result.skipped ? 'skip' : 'fail');
    const cases = results.map((result) => ({ case: result.case, name: result.name, role: result.role, status: status(result), detail: result.detail }));
    process.stdout.write(
      `${JSON.stringify({ command: 'plugin check', passed: failed.length === 0 && !layout, host: BLAZON_PROFILE.host, adopts: BLAZON_PROFILE.adopts, ...(core ? { core: true } : {}), cases, ...(layout ? { layout } : {}) })}\n`,
    );
    return failed.length === 0 && !layout ? 0 : 1;
  }
  for (const result of results) console.log(line(result));
  if (layout) console.log(`  ${pc.red('FAIL')}  layout: ${layout}`);
  if (failed.length > 0) console.log(pc.red(`\n${failed.length} case${failed.length === 1 ? '' : 's'} failed`));
  else
    console.log(
      layout
        ? pc.red('\nFailed: the file name does not follow the layout of a shipped plugin')
        : pc.green(`\nPassed${warnings > 0 ? `, with ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}`),
    );
  return failed.length === 0 && !layout ? 0 : 1;
}

/**
 * Print the digest of a file (`sha256:`) or a directory (`t1:`) that a pin names. With `--name`, record it in
 * blazon.plugins.lock as computed, or as vouched when `--digest` says what the bytes must be. Returns the exit status:
 * 0, 1 for a path a host must refuse or a digest that does not match; bad arguments throw a UsageError (exit 2).
 */
export function runPluginPin(target?: string, options: PinOptions = {}, cwd: string = process.cwd()): number {
  if (!target) throw new UsageError(USAGE.pin, undefined, 'missing-argument');
  if (!options.name && (options.digest || options.entry))
    throw new UsageError(`--digest and --entry say what to record, so they need --name; ${USAGE.pin}`, undefined, 'conflicting-options');
  if (!fs.existsSync(target)) {
    console.error(`blazon plugin pin: there is nothing at ${target}.`);
    return 2;
  }
  try {
    if (options.name) {
      const entry = recordPin(cwd, options.name, target, { digest: options.digest, entry: options.entry });
      console.log(`pinned ${options.name}: ${entry.digest} (${entry.source}) in ${LOCK_FILE}`);
      return 0;
    }
    const stat = fs.lstatSync(target);
    console.log(stat.isDirectory() && !stat.isSymbolicLink() ? treeDigest(target) : fileDigest(target));
    return 0;
  } catch (err) {
    console.error(err instanceof Refused ? err.message : `cannot read ${target}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** Print the profile blazon enforces, as the document RFC 0005 section 2 describes: the same for every install, with no secret and no path of the operator. */
export function runPluginProfile(): number {
  console.log(JSON.stringify(BLAZON_PROFILE, null, 2));
  return 0;
}

/** `blazon plugin <action> [target]`. Returns the exit status; an action that does not exist is a bad argument. */
export async function runPlugin(action?: string, target?: string, options: PinOptions & { json?: boolean; core?: boolean } = {}): Promise<number> {
  if (action === 'check') return runPluginCheck(target, { json: options.json, core: options.core });
  if (action === 'pin') return runPluginPin(target, options);
  if (action === 'profile') return runPluginProfile();
  throw new UsageError(USAGE.plugin, undefined, 'missing-argument');
}
