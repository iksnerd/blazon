// RFC 0005 section 3.1. The pattern is anchored by the whole string, not by a line: a name with a final
// newline must be refused. The dot keeps a name apart from every built-in, and a name can never be a path.
const NAME = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/;

/** Whether `name` is a plugin name: dotted lowercase words, such as `acme.house-style`. */
export function isPluginName(name: string): boolean {
  return NAME.test(name);
}

/** The longest an instance id may be (RFC 0014 section 3.1): every id, whether it is an `as` or a plugin's name. */
export const MAX_INSTANCE_ID = 64;

/** Why `id` cannot be an instance id, or undefined when it can: the length, for an id that has the form of a plugin name. */
export function instanceIdTooLong(id: string): string | undefined {
  return id.length > MAX_INSTANCE_ID ? `"${id}" is ${id.length} characters; an instance id is at most ${MAX_INSTANCE_ID}` : undefined;
}

/** The extension of a plugin's program in a plugin folder (RFC 0005 section 3.6): `bin/blazon-<name>.🔌`. */
export const PLUGIN_EXTENSION = '.🔌';

/** The path, inside its folder, of the program of the plugin `name` that ships in blazon's package. */
export function pluginEntry(name: string): string {
  return `bin/blazon-${name}${PLUGIN_EXTENSION}`;
}

/** The plugin name in a program's file name (`blazon-acme.first.🔌` gives `acme.first`), or undefined for any other name. */
export function pluginNameOfEntry(file: string): string | undefined {
  if (!file.startsWith('blazon-') || !file.endsWith(PLUGIN_EXTENSION)) return undefined;
  const name = file.slice('blazon-'.length, -PLUGIN_EXTENSION.length);
  return isPluginName(name) ? name : undefined;
}

/**
 * Whether the program at `program` sits in the layout of a shipped plugin (`<name>/bin/blazon-<something>`, RFC 0005
 * section 3.6) with a file name other than `blazon-<name>.🔌`, and if so what the file name should be. Undefined for
 * a correct name and for any path that is not in that layout: a plugin kept anywhere else, such as one script beside
 * its README or a pinned copy under `.blazon/plugins/`, is not the business of this rule. The folder must itself be a
 * plugin name, so `bin/blazon-x` in an ordinary project is left alone.
 */
export function shippedLayoutProblem(program: string): string | undefined {
  const parts = program.split(/[\\/]+/).filter((part) => part !== '');
  const file = parts[parts.length - 1];
  const folder = parts[parts.length - 3];
  if (file === undefined || folder === undefined || parts[parts.length - 2] !== 'bin' || !file.startsWith('blazon-') || !isPluginName(folder)) return undefined;
  const want = `blazon-${folder}${PLUGIN_EXTENSION}`;
  return file === want ? undefined : `the program of the plugin ${folder} is in ${folder}/bin, so its file name should be ${want}, not ${file}`;
}
