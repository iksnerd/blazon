import crypto from 'node:crypto';
import { run, type Result } from './call.js';
import { encodings } from '../wire/forms.js';
import { MANIFEST_TIMEOUT } from '../wire/limits.js';
import { ManifestError, decodeManifest, manifestTimeout, type Manifest, type Profile } from '../wire/manifest.js';

// The core cases of RFC 0005 section 9, run against a plugin program. It reads the plugin's raw output,
// before any scrubbing by the host, so a plugin that leaks cannot pass by relying on the scrubber. Case 4 is a test,
// not a proof: a plugin that encodes the value passes it.

/** How much stderr the check keeps from one call. The host keeps STDERR_KEEP; the check keeps more, so a canary written after the host's cut is still found. */
const CHECK_STDERR_KEEP = 1 << 20;

const NOT_JSON = Buffer.from('this is not JSON');
const BAD_VERSION = Buffer.from('{"v":999999}');

/** How to check one plugin program. A host's own check command is this with its profile filled in. */
export interface CheckConfig {
  /** Names the manifest flag, `--<host>-manifest` */
  host: string;
  profile: Profile;
  program: string;
  /** True when the plugin's roles have a validation (`--validate`), so case 5 applies */
  validate?: boolean;
  /** Values for the variables the manifest lists, besides the secret ones, which get a random value of their own */
  env?: Readonly<Record<string, string>>;
  /** A valid request for each role. Case 4 sends it with the canary set; without one it sends only the inputs that fail */
  requests?: Readonly<Record<string, Uint8Array | string>>;
  /**
   * For a role with no secret: a request for it with `$canary` where the request carries data. Case 4 sends it with a
   * random value in that place and looks for the value in everything the plugin prints. Leave a role out when its
   * answer repeats request data by design: it has no case 4.
   */
  dataRequests?: Readonly<Record<string, string>>;
  /** Returns a role's answer without the one field the role defines for the secret, which is the only place the canary may appear. Absent exempts nothing */
  exempt?: (role: string, stdout: Buffer) => Buffer;
  /** The host's own cases for a role the manifest declares, run after the core cases and numbered after them. Absent runs none */
  roleCases?: RoleCases;
}

/** Calls the plugin with a request, as the check does: the manifest's variables and timeout, at most `stdoutLimit` bytes of stdout (the core's when absent). */
export type RoleCall = (stdin: Uint8Array, stdoutLimit?: number) => Promise<Result>;
/** The cases a host adds for one of its roles. */
export type RoleCases = (role: string, call: RoleCall) => Promise<CheckResult[]>;

/** One case. `skipped` means it did not apply or could not run, and is neither a pass nor a failure. */
export interface CheckResult {
  case: number;
  name: string;
  role: string;
  passed: boolean;
  skipped: boolean;
  detail: string;
  /** A passed case with something the plugin's author should know: it does not fail the check */
  warning?: boolean;
}

export const result = (caseNumber: number, name: string, role: string, state: Partial<Pick<CheckResult, 'passed' | 'skipped' | 'detail' | 'warning'>> = {}): CheckResult => ({
  case: caseNumber,
  name,
  role,
  passed: state.passed ?? false,
  skipped: state.skipped ?? false,
  detail: state.detail ?? '',
  ...(state.warning && { warning: true }),
});

/** What makes a canary able to tell its encoded forms apart: characters that come out differently as base64, as a query and as a path. */
const CANARY_TAIL = '>>>???/+ &=';

/** A random, secret-shaped value for case 4. */
const canary = (): string => `sk_check_${crypto.randomBytes(16).toString('hex')}${CANARY_TAIL}`;

function describe(res: Result): string {
  if (!res.answered) return `a break: ${res.breakReason}`;
  const first = res.stdout.toString('utf-8').split('\n')[0];
  return `exit ${res.code} (${JSON.stringify(first)})`;
}

const timeout = (cfg: CheckConfig, manifest: Manifest) => manifestTimeout(manifest, cfg.profile);

/** Start the plugin the way a host does and run the core cases of section 9. */
export async function check(cfg: CheckConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Case 1: --<host>-manifest prints a manifest the host loads.
  const name1 = 'the manifest call prints a manifest the host loads';
  const res = await run({ program: cfg.program, args: [`--${cfg.host}-manifest`], timeout: MANIFEST_TIMEOUT });
  if (!res.answered || res.code !== 0) return [result(1, name1, '', { detail: `the manifest call did not exit 0 (${describe(res)})` })];
  let manifest: Manifest;
  try {
    manifest = decodeManifest(res.stdout, cfg.profile);
  } catch (err) {
    if (err instanceof ManifestError) return [result(1, name1, '', { detail: err.message })];
    throw err;
  }
  results.push(result(1, name1, '', { passed: true }));

  const canaries = Object.fromEntries(manifest.secretEnv.map((variable) => [variable, canary()]));
  const env = checkEnv(manifest, cfg.env ?? {}, canaries);

  for (const role of manifest.roles) {
    const expectExit2 = async (caseNumber: number, name: string, stdin: Buffer, ...args: string[]) => {
      const answer = await run({ program: cfg.program, args, stdin, env, timeout: timeout(cfg, manifest), stderrKeep: CHECK_STDERR_KEEP });
      results.push(answer.answered && answer.code === 2 ? result(caseNumber, name, role, { passed: true }) : result(caseNumber, name, role, { detail: `want exit 2, got ${describe(answer)}` }));
    };
    await expectExit2(2, 'a request that is not JSON exits 2', NOT_JSON);
    await expectExit2(3, 'a request of a version the host does not send exits 2', BAD_VERSION);
    if (cfg.validate) await expectExit2(5, '--validate with input that is not JSON exits 2', NOT_JSON, '--validate');
    else results.push(result(5, '--validate with input that is not JSON exits 2', role, { skipped: true, detail: 'the role has no validation' }));
  }

  results.push(...(await noninterference(cfg, manifest, env, canaries)));
  if (cfg.roleCases) {
    const call: RoleCall = (stdin, stdoutLimit) => run({ program: cfg.program, stdin, env, timeout: timeout(cfg, manifest), stdoutLimit, stderrKeep: CHECK_STDERR_KEEP });
    for (const role of manifest.roles) results.push(...(await cfg.roleCases(role, call)));
  }
  return results;
}

/**
 * Case 4. For each name in secret_env the check supplies a random secret-shaped value, calls the plugin with a valid
 * request and with the inputs that make it answer with a message, and looks for the value in the raw stderr, the
 * message, every other field and stdout outside the one field the role defines for the secret. For each pointer in
 * secret_fields it puts a value of its own at that place in the role's valid request, one pointer at a time, and
 * looks for it in the same places and every form section 3.5 scrubs. A pointer the request has no place for is
 * skipped, and the result says so.
 */
async function noninterference(cfg: CheckConfig, manifest: Manifest, env: Record<string, string>, canaries: Record<string, string>): Promise<CheckResult[]> {
  const name = 'a secret value appears nowhere but the field the role defines for it';
  if (Object.keys(canaries).length === 0 && manifest.secretFields.length === 0) return Promise.all(manifest.roles.map((role) => dataCanary(cfg, manifest, env, role, name)));

  const results: CheckResult[] = [];
  for (const role of manifest.roles) {
    const inputs: Record<string, Buffer> = { 'a request that is not JSON': NOT_JSON, 'a request of another version': BAD_VERSION };
    const valid = cfg.requests?.[role];
    if (valid !== undefined) inputs['a valid request'] = Buffer.from(valid);

    const leaks: string[] = [];
    const call = (stdin: Buffer) => run({ program: cfg.program, stdin, env, timeout: timeout(cfg, manifest), stderrKeep: CHECK_STDERR_KEEP });
    for (const label of Object.keys(inputs).sort()) {
      const answer = await call(inputs[label]!);
      const stdout = label === 'a valid request' && cfg.exempt ? cfg.exempt(role, answer.stdout) : answer.stdout;
      for (const [variable, value] of Object.entries(canaries)) {
        for (const form of encodings(value)) {
          if (stdout.includes(form)) leaks.push(`${label}: ${variable} is in stdout`);
          if (answer.stderr.includes(form)) leaks.push(`${label}: ${variable} is in stderr`);
        }
      }
    }
    let tested = Object.keys(canaries).length > 0;
    const unplaced: string[] = [];
    for (const pointer of manifest.secretFields) {
      const value = canary();
      let body: Buffer;
      try {
        body = setPointer(valid === undefined ? undefined : Buffer.from(valid), pointer, value);
      } catch (err) {
        unplaced.push(`${pointer} (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      tested = true;
      const answer = await call(body);
      const stdout = cfg.exempt ? cfg.exempt(role, answer.stdout) : answer.stdout;
      for (const form of encodings(value)) {
        if (stdout.includes(form)) leaks.push(`a valid request with ${pointer} set: the value is in stdout`);
        if (answer.stderr.includes(form)) leaks.push(`a valid request with ${pointer} set: the value is in stderr`);
      }
    }
    if (leaks.length > 0) results.push(result(4, name, role, { detail: [...new Set(leaks)].join('; ') }));
    else if (!tested) results.push(result(4, name, role, { skipped: true, detail: `the role's valid request has no place for ${unplaced.join(', ')}` }));
    else results.push(result(4, name, role, { passed: true, detail: unplaced.length > 0 ? `not tried, the request has no place for ${unplaced.join(', ')}` : '' }));
  }
  return results;
}

/** The JSON document `raw` with `value` at the JSON Pointer `pointer` (RFC 6901). A key an object lacks is added, and so is an object on the way; an array element must exist, and a value that is neither an object nor an array has no place. Throws an Error saying why. Written back compact. */
export function setPointer(raw: Uint8Array | undefined, pointer: string, value: string): Buffer {
  if (!pointer.startsWith('/')) throw new Error('not a pointer into the request');
  if (raw === undefined) throw new Error('the role gives no valid request');
  let doc: unknown;
  try {
    doc = JSON.parse(Buffer.from(raw).toString('utf-8'));
  } catch {
    throw new Error('the valid request is not JSON');
  }
  const segments = pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));

  const place = (node: unknown, index: number): unknown => {
    const segment = segments[index]!;
    const last = index === segments.length - 1;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(segment) || Number(segment) >= node.length) throw new Error(`no element ${JSON.stringify(segment)}`);
      node[Number(segment)] = last ? value : place(node[Number(segment)], index + 1);
      return node;
    }
    if (typeof node === 'object' && node !== null) {
      const object = node as Record<string, unknown>;
      object[segment] = last ? value : place(object[segment] ?? {}, index + 1);
      return object;
    }
    throw new Error(`${JSON.stringify(segments.slice(0, index).join('/'))} is not an object or an array`);
  };
  return Buffer.from(JSON.stringify(place(doc, 0)));
}

/**
 * Case 4 for a role with no secret_env and no secret_fields: a canary in the request's data, looked for in the raw
 * stdout and stderr in every form section 3.5 scrubs. The role gives the request; without one the case does not apply.
 */
async function dataCanary(cfg: CheckConfig, manifest: Manifest, env: Record<string, string>, role: string, name: string): Promise<CheckResult> {
  const template = cfg.dataRequests?.[role];
  if (template === undefined) return result(4, name, role, { skipped: true, detail: 'the manifest lists no secret_env and the role gives no request data to put a canary in' });
  const value = canary();
  const answer = await run({ program: cfg.program, stdin: Buffer.from(template.replaceAll('$canary', value)), env, timeout: timeout(cfg, manifest), stderrKeep: CHECK_STDERR_KEEP });
  const leaks: string[] = [];
  for (const form of encodings(value)) {
    if (answer.stdout.includes(form)) leaks.push('request data is in stdout');
    if (answer.stderr.includes(form)) leaks.push('request data is in stderr');
  }
  return leaks.length > 0 ? result(4, name, role, { detail: [...new Set(leaks)].join('; ') }) : result(4, name, role, { passed: true });
}

function checkEnv(manifest: Manifest, given: Readonly<Record<string, string>>, canaries: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(manifest.env.map((variable) => [variable, canaries[variable] || given[variable] || 'check']));
}
