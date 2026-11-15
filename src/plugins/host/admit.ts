import type { Manifest } from '../wire/manifest.js';

// Whether a host starts a plugin, from RFC 0005 sections 3.5 and 3.6. Pure: the label store and the pin
// check stay in the host.

export const LONG_RUNNING = 'long-running';
export const ONE_SHOT_NAMED = 'one-shot-named';

export const LABEL_NOT_ACCEPTED = 'label-not-accepted';
export const FIELD_NOT_MARKED = 'field-not-marked';
export const FIELD_NOT_LISTED = 'field-not-listed';
export const UNPINNED_MUST_PIN = 'unpinned-must-pin';

/**
 * What the operator marked secret for one plugin: environment variable names, and JSON Pointers of request fields
 * the host copies a secret into. It comes from the host's configuration, never from the plugin. `delegated` names
 * the labelled variables the host delivers as a capability in place of the value (section 3.7): such a name does not
 * make the plugin must-pin. The host sets it from what it delivers, never from a claim in the plugin's manifest.
 */
export interface Labels {
  env?: readonly string[];
  fields?: readonly string[];
  delegated?: readonly string[];
}

/** What a role does with data, from the host's profile: a library cannot know it. */
export interface Flows {
  returnsSecret?: boolean;
  authorizes?: boolean;
}

/** The host's decision: admitted, with `warn` when it starts unpinned under section 3.6's one-shot exception, or a reason it refuses. */
export interface Admission {
  admitted: boolean;
  warn: boolean;
  reason: string;
}

const refused = (reason: string): Admission => ({ admitted: false, warn: false, reason });

/**
 * `marked`: the request fields the role's schema marks as able to hold a secret. `pinned`: the plugin passed the
 * section 3.4 pin. `mode` is `long-running` or `one-shot-named`.
 */
export function admit(manifest: Manifest, labels: Labels, marked: readonly string[], pinned: boolean, mode: string, flows: Flows): Admission {
  for (const name of labels.env ?? []) if (!manifest.secretEnv.includes(name)) return refused(LABEL_NOT_ACCEPTED);
  for (const pointer of labels.fields ?? []) {
    if (!marked.includes(pointer)) return refused(FIELD_NOT_MARKED);
    if (!manifest.secretFields.includes(pointer)) return refused(FIELD_NOT_LISTED);
  }

  // A plugin that receives a secret, returns one or authorizes something must be pinned, by what flows through it and
  // not by its role. Every labelled value passed the checks above, so the plugin lists it: a secret_env or
  // secret_fields in the manifest is what receiving a secret looks like here, except a variable the host delivers as
  // a capability instead.
  const delegated = labels.delegated ?? [];
  const mustPin = manifest.secretEnv.some((name) => !delegated.includes(name)) || manifest.secretFields.length > 0 || flows.returnsSecret === true || flows.authorizes === true;
  if (!mustPin || pinned) return { admitted: true, warn: false, reason: '' };
  if (mode === ONE_SHOT_NAMED) return { admitted: true, warn: true, reason: '' };
  return refused(UNPINNED_MUST_PIN);
}
