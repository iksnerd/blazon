// The numbers the tool descriptions state. The MCP server enforces the same numbers from its own copy (mcp/src/result.ts), and a test keeps the two equal.

/** The largest text block a tool returns, in characters. A bigger answer is cut and says so. */
export const MAX_TEXT = 40_000;

/** The default and the largest number of findings `check_brand` returns. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

/** The most pairs one `can_use` call may carry. */
export const MAX_PAIRS = 50;
