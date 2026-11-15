interface Section {
  title?: string;
  body: string;
}

/** What the exit status of `blazon` means, for the help of the whole tool. */
export const EXIT_STATUS = [
  '  0  it did what it was asked (for check, no errors)',
  '  1  the check found errors (or warnings, with --strict), `blazon can` denied the combination, `blazon doctor` found a failing check, or the command failed',
  '  2  it was used wrongly and did nothing: an unknown command or option, an unknown token, a bad port, no brand book in the folder',
].join('\n');

/** Where the help of the whole tool says how to look up a finding code. */
export const CODES_HELP = ['  blazon explain <code>   what a finding code means, the fix, and where to read more', '  blazon explain         list every code'].join('\n');

/** What `--cwd` does and what `blazon doctor` checks, for the help of the whole tool. */
export const WORKING_FOLDER = [
  '  --cwd <dir> sets the folder every command works from, the same as running blazon there. A folder argument is then relative to it:',
  '  `blazon --cwd ./brands check acme` checks ./brands/acme. A --cwd that is not a folder exits 2.',
  '  `blazon doctor` checks the environment (Node, brand folder, plugin folder safety, Chrome, blazon.lock): one line each, ok, warn or fail, with a fix.',
].join('\n');

const PLUGIN_ACTIONS: Record<string, string> = {
  check: `blazon plugin check <program> [--core] [--json]

Starts the program the way blazon does and runs the protocol's core cases against it, then blazon's own cases for each role it declares and, for a shipped plugin's layout, the file name rule. Prints one line for each case: ok, skip or FAIL.
With --core, only the core cases (1 to 5) run: no role cases and no layout line. Use it to check a plugin against the protocol alone.

Exit status:
  0  every case passed
  1  a case failed
  2  no program was given

Example:
  $ blazon plugin check ./blazon-acme.house-style`,
  pin: `blazon plugin pin <path> [--name <plugin>] [--digest <digest>] [--entry <path>]

Prints the digest that pins a plugin: sha256: for a file, t1: for a directory.
With --name, records the pin in blazon.plugins.lock instead. --digest says what the bytes must be, and the pin is refused when they are not. --entry names the program inside a directory when it is not blazon-<plugin>.

Exit status:
  0  printed, or recorded
  1  the path is one a host must refuse, or the digest does not match
  2  no path was given, or --digest or --entry without --name

Example:
  $ blazon plugin pin ./blazon-acme.house-style --name acme.house-style`,
  profile: `blazon plugin profile

Prints blazon's profile of the plugin protocol as JSON: the roles it defines and its limits. It is the same for every install.

Exit status:
  0  printed`,
};

/**
 * The help text, changed in three ways: `blazon plugin <action> --help` says what that action does and returns, the help of the
 * whole tool ends with how to look up a finding code and what each exit status means, and `--no-input` is not shown as on by default (it is only implied
 * when there is no terminal).
 */
export function helpSections(sections: Section[], command: string | undefined, action: string | undefined): Section[] {
  if (command === 'plugin' && action !== undefined && Object.hasOwn(PLUGIN_ACTIONS, action)) return [{ body: PLUGIN_ACTIONS[action]! }];
  const cleaned = sections.map((section) => ({ ...section, body: section.body.replace(/(--no-[a-z-]+[^\n]*?) *\(default: true\)/g, '$1') }));
  return command === undefined
    ? [...cleaned, { title: 'Finding codes', body: CODES_HELP }, { title: 'Working folder and environment', body: WORKING_FOLDER }, { title: 'Exit status', body: EXIT_STATUS }]
    : cleaned;
}
