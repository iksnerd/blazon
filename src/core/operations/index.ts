// The operations list and what is derived from it. Pure data and pure functions: this folder imports nothing.
export { OPERATIONS } from './list.js';
export { DEFAULT_LIMIT, MAX_LIMIT, MAX_TEXT } from './limits.js';
export { checkAgainst } from './check.js';
export { commandOperations, toolInput, toolOf, toolOperations } from './project.js';
export { validateOperations } from './validate.js';
export type { CliOption, CliSpec, InputSchema, JsonSchema, McpSpec, Operation, Prop, Tool } from './types.js';
