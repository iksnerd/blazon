import os from 'node:os';
import type { Profile } from './manifest.js';

// Blazon's profile of the plugin protocol (RFC 0005): the roles it defines and its own decisions under the core
// (RFC 0005 section 2; RFC 0002, section 2). It is written in the shape of the profile document
// (RFC 0005 section 2), so the command that prints the profile can print this value as it is.

/** One role of the document (RFC 0005 section 2). */
export interface RoleDocument {
  name: string;
  /** For each exit code the role defines, what it means. A code that is not here is a break */
  exit_codes: Record<string, string>;
  /** Behind the breaker: stops being called for the rest of a run after three breaks in a row */
  breaker?: boolean;
  pinned?: 'always' | 'by_rule';
  /** The cap on one call, in milliseconds, when the role raises the core's */
  timeout_cap_ms?: number;
  /** The most one call may print, in bytes, when the role raises the core's */
  stdout_limit_bytes?: number;
}

export interface ProfileDocument {
  v: 1;
  host: string;
  check_command: string;
  roles: RoleDocument[];
  adopts: string[];
  secret_fields?: string[];
  secret_env_prefixes: string[];
  request_cap_bytes: number;
}

export const BLAZON_PROFILE: ProfileDocument = {
  v: 1,
  host: 'blazon',
  check_command: 'blazon plugin check',
  roles: [
    {
      name: 'check',
      // Exit 1 is not an answer for either role, so a plugin that dies on an uncaught exception is a break.
      exit_codes: { '0': 'an answer: the findings', '2': 'cannot answer, with the reason as the first line' },
      breaker: true,
      // 500 findings fit; the core's 64 KB would not.
      stdout_limit_bytes: 1048576,
    },
    {
      name: 'build',
      exit_codes: { '0': 'an answer: the plugin wrote its files to out_dir', '2': 'cannot answer, with the reason as the first line' },
      breaker: true,
    },
  ],
  adopts: [],
  secret_env_prefixes: ['BLAZON_SECRET_'],
  request_cap_bytes: 4 * 1024 * 1024,
};

/** What a manifest must fit, built from the document: its roles, the request fields marked as able to hold a secret, and a role's raised timeout cap in seconds. */
export const BLAZON_CORE_PROFILE: Profile = {
  roles: BLAZON_PROFILE.roles.map((role) => role.name),
  secretFields: BLAZON_PROFILE.secret_fields ?? [],
  timeoutCaps: Object.fromEntries(BLAZON_PROFILE.roles.flatMap((role) => (role.timeout_cap_ms === undefined ? [] : [[role.name, role.timeout_cap_ms / 1000]]))),
};

/** How one call of a role is held, read from the document: the exit codes that are answers, the stdout limit when the role raises it, and whether the role is behind the breaker. */
export function roleRuntime(role: string): { answers: number[]; stdoutLimit?: number; breaker: boolean } {
  const document = BLAZON_PROFILE.roles.find((candidate) => candidate.name === role);
  if (!document) throw new Error(`the profile defines no role ${role}`);
  return { answers: Object.keys(document.exit_codes).map(Number), stdoutLimit: document.stdout_limit_bytes, breaker: document.breaker === true };
}

/** A valid request for each role, as the check command sends it with a canary set. A plugin answers it with its findings. */
export function blazonRequests(): Record<string, string> {
  const brand = { format: 'blazon-brand', version: 1 };
  return {
    check: JSON.stringify({ v: 1, type: 'check', options: {}, brand }),
    build: JSON.stringify({ v: 1, type: 'build', options: {}, brand, site_dir: os.tmpdir(), tokens_dir: os.tmpdir(), out_dir: os.tmpdir() }),
  };
}
