// The limits the wire fixes (RFC 0005 section 6, and 3.8 for the manifest call).

/** What a plugin may print on stdout in one answer, in bytes. A profile MAY raise it for a named role. */
export const STDOUT_LIMIT = 65536;

/** How much of a plugin's stderr a call keeps, in bytes. */
export const STDERR_KEEP = 8192;

/** Seconds one call may take when the manifest says nothing. */
export const DEFAULT_TIMEOUT = 5;

/** The most a manifest's `timeout_ms` can ask for, in seconds. A profile MAY raise it for a role whose call waits on a person. */
export const TIMEOUT_CAP = 60;

/** The manifest call has a fixed 15 seconds and 64 KB of stdout (section 3.8). */
export const MANIFEST_TIMEOUT = 15;
