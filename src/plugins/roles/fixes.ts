import type { BreakCause } from '../host/call.js';
import { TIMEOUT_CAP } from '../wire/limits.js';

// What to do about each cause of a plugin-failed finding. The catalogue gives the code one fix, which cannot be right for
// every cause (pinning does not help a plugin that crashed), so each finding carries the fix for its own cause. Each is one
// sentence or two a person or an agent can act on without the manual.

const AUTHOR = "fix the program, or send the message to the plugin's author";
const PROTOCOL_PAGE = 'docs/manual/13-writing-a-plugin.md';

/** The plugin's entry in blazon.json or a --plugin argument cannot be used as it is. */
export const CONFIG_FIX = 'Change the plugins entry in blazon.json, or the --plugin argument, that the message names.';

/** No program was found for a plugin that is not pinned or shipped. */
export const notFoundFix = (name: string): string =>
  `Pin the plugin with blazon plugin pin <path> --name ${name}, or put a program called blazon-${name} in .blazon/plugins or on PATH; if the name is wrong, correct it in blazon.json.`;

/** An unpinned program that group or others can write. It is the user's own file or the project's own folder, never a shared one. */
export const writableFix = (place: string): string =>
  `If ${place} is yours, run chmod go-w ${place}; if it is not, put the plugin in a folder under your own home folder.`;

/** A check or build plugin that must be pinned and is not. */
export const pinFix = (program: string, name: string): string => `Pin it: blazon plugin pin ${program} --name ${name}, then commit blazon.plugins.lock.`;

/** A plugin that takes a labelled variable without listing it as secret. */
export const labelFix = (variable: string): string => `Add ${variable} to secret_env in the plugin's manifest, or take it out of env.`;

/** A build plugin whose output folder holds an input. */
export const OUT_DIR_FIX = 'Move the file out of the output folder, or set tokensOutDir to another folder.';

/** A plugin stopped by its breaker after earlier breaks. */
export const STOPPED_FIX = 'Fix the failure reported for this plugin before it was stopped; blazon starts it again on the next run.';

/** A plugin that answered with exit 2: it could not judge, and said why. */
export const COULD_NOT_FIX = 'Fix what the plugin names in the message, then run the command again.';

/** A manifest or an answer that breaks the plugin protocol. */
export const PROTOCOL_FIX = `The plugin does not follow the plugin protocol (${PROTOCOL_PAGE}): ${AUTHOR}.`;

/** A manifest call that answered with an exit code other than 0. */
export const MANIFEST_EXIT_FIX = `The plugin must answer --blazon-manifest with exit 0 (${PROTOCOL_PAGE}): ${AUTHOR}.`;

/** The fix for a call that broke, by the kind of cause. `pin` is the project lock's path of the plugin, when it is pinned there. */
export function breakFix(cause: BreakCause | undefined, name: string, pin?: string): string | undefined {
  switch (cause) {
    case 'place':
      return 'Install blazon under your own home folder, as the user who runs it, and run the command again: a folder that other users can write, such as /tmp, lets them replace the plugin. Do not change the permissions of a shared folder. Until then, --no-plugins skips the plugins.';
    case 'install':
      return 'Reinstall blazon; in a checkout of blazon, run npm run build:plugins.';
    case 'pin':
      return `If you changed the plugin on purpose, review the change and pin it again: blazon plugin pin ${pin ?? '<path>'} --name ${name}; if not, put back the version you pinned.`;
    case 'interpreter':
      return 'Install the interpreter in a folder that only you or root can write, and name that folder in BLAZON_PLUGIN_PATH (docs/manual/12-plugins.md).';
    case 'start':
      return 'Make sure the program the message names exists and is executable, or pin the plugin again with the right path.';
    case 'timeout':
      return `Make the plugin answer sooner, or raise timeout_ms in its manifest (at most ${TIMEOUT_CAP} seconds): ${AUTHOR}.`;
    case 'output':
      return `Make the plugin print less on stdout: ${AUTHOR}.`;
    case 'pipe':
      return `The plugin left a process running that holds its output open; it must wait for what it starts before it exits: ${AUTHOR}.`;
    case 'exit':
      return `The plugin failed on its own side, and its stderr, when it wrote any, ends the message: ${AUTHOR}.`;
    default:
      return undefined; // the host's own fault: the catalogue's fix
  }
}
