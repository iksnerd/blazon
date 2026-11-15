// The environment a plugin starts with (RFC 0005 section 4).

/** The only part of the host's environment a plugin sees: the ones the host has set. */
export const BASE_ENV = ['PATH', 'HOME', 'LANG', 'TMPDIR'] as const;

/** BASE_ENV from this process, then the variables the manifest lists, with the values the host resolved. */
export function environment(listed: Readonly<Record<string, string>> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of BASE_ENV) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return Object.assign(env, listed);
}
