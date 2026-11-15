// The environment a plugin starts with (RFC 0005 section 4).

/**
 * The only part of the host's environment a plugin sees without asking: `PATH`, which the host sets itself for a pinned script (the
 * trusted interpreter directories) and which an unpinned program needs to find its own tools. Anything else, `HOME` and `TMPDIR`
 * included, is a name the manifest lists and the project's config approves.
 */
export const BASE_ENV = ['PATH'] as const;

/** BASE_ENV from this process, then the variables the manifest lists and the config approves, with the values the host resolved. */
export function environment(listed: Readonly<Record<string, string>> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of BASE_ENV) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return Object.assign(env, listed);
}
