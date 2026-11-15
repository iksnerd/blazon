import { DEFAULT_TIMEOUT, TIMEOUT_CAP } from './limits.js';
import { plainText } from './text.js';

// The manifest a plugin prints for `--<host>-manifest` (RFC 0005 section 3.8). A field that is present must
// be valid; a field the host does not know is ignored, so a plugin written for a newer host still loads.

/** A manifest that section 3.8 refuses. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** What a host defines for itself and a manifest must fit. */
export interface Profile {
  roles: readonly string[];
  /** The request fields a role's schema marks as able to hold a secret, as JSON Pointers. None until a schema marks one */
  secretFields?: readonly string[];
  /** Seconds, for a role whose profile raises the cap on one call. A role not listed has the core's cap */
  timeoutCaps?: Readonly<Record<string, number>>;
}

export interface Manifest {
  roles: string[];
  /** 0 when the manifest has none. A value too large for a double is held as the largest safe integer, since a host caps it */
  timeoutMs: number;
  env: string[];
  secretEnv: string[];
  secretFields: string[];
  title: string;
  description: string;
  version: string;
  homepage: string;
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
// ASCII white space only, as the schema means it.
const SPACE = ' \\t\\n\\r\\f\\v';
const HOMEPAGE = new RegExp(`^https?://[^/?#@${SPACE}:][^/?#@${SPACE}]*(?:[/?#][^${SPACE}]*)?$`);
const POINTER = /^(\/([^~/]|~[01])*)*$/;

/** A JSON number as the text it was written with, so `5000.0` and `5e3` are not mistaken for the integer 5000. */
class Num {
  constructor(readonly source: string) {}
  /** The integer it names, or undefined when it is written with a fraction or an exponent. */
  integer(): bigint | undefined {
    return /^-?\d+$/.test(this.source) ? BigInt(this.source) : undefined;
  }
}

function parse(raw: string | Uint8Array): unknown {
  let text: string;
  try {
    text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (err) {
    throw new ManifestError(`the manifest is not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    // The reviver's source text needs Node 22 or later. Without it every number would look like the float it is held as.
    return JSON.parse(text, function (this: unknown, _key, value, context?: { source?: string }) {
      if (typeof value !== 'number') return value;
      if (context?.source === undefined) throw new Error('this Node cannot read the text of a JSON number; the plugin host needs Node 22 or later');
      return new Num(context.source);
    });
  } catch (err) {
    throw new ManifestError(`the manifest is not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function strings(fields: Record<string, unknown>, name: string, required = false): string[] {
  if (!(name in fields)) {
    if (required) throw new ManifestError(`${name} is required`);
    return [];
  }
  const value = fields[name];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new ManifestError(`${name} must be a list of strings`);
  return value as string[];
}

function string(fields: Record<string, unknown>, name: string): string {
  if (!(name in fields)) return '';
  if (typeof fields[name] !== 'string') throw new ManifestError(`${name} must be a string`);
  return fields[name];
}

function plain(fields: Record<string, unknown>, name: string, maximum: number): string {
  const value = string(fields, name);
  if (name in fields) {
    try {
      plainText(name, value, maximum);
    } catch (err) {
      throw new ManifestError(err instanceof Error ? err.message : String(err));
    }
  }
  return value;
}

/** Read the one JSON object a plugin printed and refuse anything section 3.8 refuses. */
export function decodeManifest(raw: string | Uint8Array, profile: Profile): Manifest {
  const fields = parse(raw);
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) throw new ManifestError('the manifest is not a JSON object');
  const manifest = fields as Record<string, unknown>;

  const version = manifest.v instanceof Num ? manifest.v.integer() : undefined;
  if (version !== 2n) throw new ManifestError('v must be the integer 2');

  const roles = strings(manifest, 'roles', true);
  if (roles.length === 0) throw new ManifestError('roles must name at least one role');
  if (new Set(roles).size !== roles.length) throw new ManifestError('a role is listed twice');
  for (const role of roles) if (!profile.roles.includes(role)) throw new ManifestError(`role ${JSON.stringify(role)} is not one this host defines`);

  let timeoutMs = 0;
  if ('timeout_ms' in manifest) {
    const value = manifest.timeout_ms instanceof Num ? manifest.timeout_ms.integer() : undefined;
    if (value === undefined || value < 1n) throw new ManifestError('timeout_ms must be a positive integer written without a fraction');
    timeoutMs = value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
  }

  const env = strings(manifest, 'env');
  const secretEnv = strings(manifest, 'secret_env');
  for (const name of [...env, ...secretEnv]) if (!ENV_NAME.test(name)) throw new ManifestError(`${JSON.stringify(name)} is not a variable name`);
  for (const name of secretEnv) if (!env.includes(name)) throw new ManifestError(`secret_env names ${name}, which is not in env`);

  const secretFields = strings(manifest, 'secret_fields');
  for (const pointer of secretFields) {
    if (!POINTER.test(pointer) || !(profile.secretFields ?? []).includes(pointer)) {
      throw new ManifestError(`secret_fields lists ${JSON.stringify(pointer)}, which no role's schema marks as able to hold a secret`);
    }
  }

  const title = plain(manifest, 'title', 60);
  const description = plain(manifest, 'description', 160);
  const versionText = string(manifest, 'version');
  if ('version' in manifest && !VERSION.test(versionText)) throw new ManifestError(`version ${JSON.stringify(versionText)} is not 1 to 32 letters, digits, dots, plus and minus`);
  const homepage = string(manifest, 'homepage');
  if ('homepage' in manifest && (homepage.length > 200 || !HOMEPAGE.test(homepage))) {
    throw new ManifestError(`homepage ${JSON.stringify(homepage)} is not an http or https URL of at most 200 characters with a host and no user or password`);
  }

  return { roles, timeoutMs, env, secretEnv, secretFields, title, description, version: versionText, homepage };
}

/** The cap on one call of a plugin with these roles: the highest any of them has, never under the core's. */
export function profileTimeoutCap(profile: Profile, roles: readonly string[]): number {
  return Math.max(TIMEOUT_CAP, ...roles.map((role) => profile.timeoutCaps?.[role] ?? 0));
}

/** Seconds one call may take: the manifest's `timeout_ms`, or 5 when it has none, never more than the cap. `cap` is a number of seconds, or the profile that gives it. */
export function manifestTimeout(manifest: Manifest, cap: number | Profile): number {
  const seconds = typeof cap === 'number' ? cap : profileTimeoutCap(cap, manifest.roles);
  if (manifest.timeoutMs === 0) return DEFAULT_TIMEOUT;
  return Math.min(manifest.timeoutMs, Math.floor(seconds * 1000)) / 1000;
}
