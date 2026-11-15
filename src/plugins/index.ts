// Blazon as a host of the plugin protocol (RFC 0005) (RFC 0002 section 2): the core of the host. The roles,
// the `plugins` config and the lock file are built on this.

export { STDOUT_LIMIT, STDERR_KEEP, DEFAULT_TIMEOUT, TIMEOUT_CAP, MANIFEST_TIMEOUT } from './wire/limits.js';
export { isPluginName } from '../core/plugin-name.js';
export { ManifestError, decodeManifest, manifestTimeout, profileTimeoutCap, type Manifest, type Profile } from './wire/manifest.js';
export { message, graphemeCount, truncateGraphemes } from './wire/text.js';
export { BASE_ENV, environment } from './wire/environment.js';
export { run, requestFile, type Call, type Result } from './host/call.js';
export { Breaker, DEFAULT_THRESHOLD } from './roles/breaker.js';
export { encodings } from './wire/forms.js';
export { scrub, REDACTED } from './host/scrub.js';
export { admit, type Admission, type Flows, type Labels } from './host/admit.js';
export { Pin, PinMismatch, Refused, fileDigest, treeDigest, MAX_BYTES, MAX_ENTRIES } from './pins/pin.js';
export { check, setPointer, type CheckConfig, type CheckResult } from './host/check.js';
export { BLAZON_PROFILE, BLAZON_CORE_PROFILE, blazonRequests } from './wire/profile.js';
