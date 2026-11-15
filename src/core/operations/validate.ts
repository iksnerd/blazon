import type { Operation } from './types.js';

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
/** Claude Code cuts a tool description at 2 KB. */
const MAX_DESCRIPTION = 2048;

/** What is wrong with a list of operations, one sentence each; empty when it is sound. Run by a test, and by the script that writes the MCP copy. */
export function validateOperations(operations: readonly Operation[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const commands = new Set<string>();
  for (const op of operations) {
    const here = (what: string) => `${op.name}: ${what}`;
    if (!NAME.test(op.name)) problems.push(here('the name is not lower case, digits and _, starting with a letter'));
    if (names.has(op.name)) problems.push(here('the name is used twice'));
    names.add(op.name);
    if (!op.title.trim()) problems.push(here('no title'));
    if (!op.description.trim() || op.description.length > MAX_DESCRIPTION) problems.push(here(`the description is empty or over ${MAX_DESCRIPTION} characters`));
    if (!op.annotations.readOnlyHint) problems.push(here('a read operation must set readOnlyHint'));
    const { properties, required = [] } = op.inputSchema;
    for (const [name, prop] of Object.entries(properties)) if (!prop.description.trim()) problems.push(here(`the property ${name} has no description`));
    for (const name of required) if (!(name in properties)) problems.push(here(`${name} is required but is not a property`));
    if (op.outputSchema === undefined && op.mcp !== false) problems.push(here('a tool needs an output schema'));
    if (JSON.stringify(op.outputSchema ?? {}).match(/"(anyOf|oneOf|allOf)"/)) problems.push(here('the output schema uses anyOf, oneOf or allOf'));
    if (op.cli === false) continue;
    const cli = op.cli;
    const key = cli.command.join(' ');
    if (commands.has(key)) problems.push(here(`the command ${key} is used twice`));
    commands.add(key);
    for (const name of cli.positional) if (!(name in properties)) problems.push(here(`the positional ${name} is not a property`));
    for (const name of cli.cliOnly) if (!(name in properties)) problems.push(here(`the command-line-only ${name} is not a property`));
    if (cli.folder !== undefined && !cli.positional.includes(cli.folder)) problems.push(here(`the folder argument ${cli.folder} is not a positional`));
    for (const option of cli.options) {
      if (option.property !== 'json' && !(option.property in properties)) problems.push(here(`the option ${option.property} is not a property`));
      if (cli.positional.includes(option.property)) problems.push(here(`${option.property} is both a positional and an option`));
    }
    const typed = new Set([...cli.positional, ...cli.options.map((o) => o.property)]);
    for (const name of Object.keys(properties)) if (!typed.has(name)) problems.push(here(`the property ${name} cannot be typed on the command line`));
  }
  return problems;
}
