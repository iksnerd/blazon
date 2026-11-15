# blazon-mcp

An MCP (Model Context Protocol) server that lets a coding agent ask blazon about a brand as tool calls, instead of reading token files. It runs the blazon command line with `--json` and returns what blazon printed. It does not import blazon's code and needs no blazon dependency, only a `blazon` program it can run. What each tool is called, takes and answers comes from blazon's operations list (`src/core/operations/list.ts`); `mcp/src/generated/` is a copy of it that `npm run gen:mcp` writes, because this package cannot import `src/`. It is not published to npm yet.

The tools are read-only. None of them writes a file or builds the brand. The manual page for users is [chapter 20](../docs/manual/20-blazon-for-agents.md); it says the same as this file.

## Trust

`--brand` must be a folder you trust. Reading a brand loads its `blazon.config.ts` (or `.js`, `.mjs`) as code: blazon imports it with Vite's `runnerImport` (`src/core/config/index.ts`), so a brand folder can run any code as your user. The server gives the blazon child only an allowlist of the environment (`PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LC_*`, `NODE_*`, `BLAZON_*`, `NO_COLOR`, `SystemRoot`, `windir`, `COMSPEC`, `PATHEXT`), so tokens and cloud keys in the client's environment do not reach that code. That limits the damage; it does not make an untrusted brand safe.

## Tools

The server's instructions give the order: `check_brand` once per session, `list_tokens` to find a path, `get_token` for its value, `can_use` for each text and background pair.

| Tool | Arguments | Wraps | Use it to |
|---|---|---|---|
| `check_brand` | `severity`, `limit` (default 50, at most 500) | `blazon check --no-plugins` | see the brand's own findings and counts, and whether it `passed` |
| `list_tokens` | `group` (optional), `type` (optional) | `blazon list [group] [--type t]` | find a token path, or read many values at once; cut to whole tokens at the size limit |
| `get_token` | `path` | `blazon get <path>` | read a token's value, type, CSS variable names and rules |
| `get_rules` | `path` (optional) | `blazon rules` | learn what a token, a group or the whole brand allows and forbids |
| `can_use` | `fg`, `bg`, `role` | `blazon can` | ask whether one color may be text on another, or with `role: "ui"` a focus ring, border or icon stroke judged at 3:1 with no pairs. A denied answer is a result with `allowed: false`, not an error |
| `get_fonts` | none | `blazon fonts` | find the stylesheets and files to load, and whether each family a token names is loaded |
| `get_logo` | none | `blazon logo` | read the logo variants and their clear space, minimum size and forbidden backgrounds |
| `get_shadcn` | none | `blazon brand --key theme.shadcn` | read the shadcn/ui variables the brand supplies, compiled now, so no build is needed |

Every tool has a title and an input schema that refuses extra arguments. A token path is dot-separated segments of ASCII letters, digits, `_` and `-`; a segment starts with a letter, digit or `_`. So `a..b`, `a.`, `-x` and `.x` are refused, and an argument can never become a flag.

An error from blazon, such as an unknown token, comes back as a tool error carrying blazon's message and the next step ("To find a token path, call list_tokens."). A group path given to `get_token` is refused the same way.

### Results

Each answer has `structuredContent`, validated against the tool's `outputSchema`, and the same compact JSON as a text block. Two fields are always there:

- `warnings`: the lines blazon printed on standard error. A read command prints "this brand has N error(s), so a value below may be wrong" there when the brand has errors. When `warnings` is not empty it also comes first as its own text block, so the model reads it before the value.
- `brandHasErrors`: true when the brand has errors.

The size cap is 40 000 characters, about 10 000 tokens, the point where Claude Code starts to warn about a tool result. An answer over it is cut in the text block with a notice ("narrow with a path"), and the structured result then holds only `truncated`, `notice`, `warnings` and `brandHasErrors`. `check_brand` and `list_tokens` instead keep whole items: `check_brand` keeps `counts` and `passed` whole and cuts `findings` to `limit` (default 50, at most 500, and fewer if still too large); `list_tokens` cuts `tokens` to fit. Both add `findingsTotal` or `tokensTotal`, `truncated` and `notice`.

### Resources and prompt

| Name | What it is |
|---|---|
| `blazon://rules` | every rule of the brand (`blazon rules --json`), `application/json` |
| `blazon://brand` | the compiled brand as `brand.json` holds it (`blazon brand`), `application/json` |
| prompt `build_page` (argument `description`) | the workflow of the manual's chapter 19: check first, read the rules, fonts, logo and shadcn variables, find paths with `list_tokens`, never hard-code a value, `can_use` for each pair, and list the questions the brand does not answer |

Resources are not cut to the size limit. A warning from blazon comes as a separate `text/plain` entry before the JSON entry.

## Limits

- Each blazon command is killed with SIGKILL after 30 seconds, and its output is capped at 16 MB.
- At most 2 blazon commands run at once; others wait.
- An answer is reused for 2 seconds for the same arguments. A time limit, not file modification times, because a brand config can import files from anywhere, and a 2-second window cannot be stale for long while it saves a second compile when an agent asks the same thing twice.
- On SIGTERM, SIGINT or when the client closes standard input, the server kills commands in flight and exits.

## Build

```bash
npm install            # at the repository root: mcp/ is a workspace, so this installs its dependencies too
npm run build -w mcp
```

This writes `mcp/dist/index.js`. It needs Node 24 or later.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `--brand <folder>` or `--brand=<folder>`, or `BLAZON_BRAND` | the current folder | The brand folder. Every command runs there. A value starting with `--` is refused |
| `BLAZON_BIN` | `blazon` on `PATH` | The blazon program to run |

## Print the config

`blazon mcp --print-config [--client claude-code|claude-desktop|cursor|vscode] [--brand <dir>] [--json]` prints the command or JSON that registers this server in a client, with an absolute brand folder when `--brand` is given. It writes no file, and it uses this build (`mcp/dist/index.js`) when it exists. Without a build it prints the proposed `npx -y @iksnerd/blazon-mcp` form and says the package is not published. `blazon dev` offers the same in a "Connect your agent" panel. The sections below show the formats by hand.

## Claude Code

Options go before the name; `-e` must not be followed directly by the name.

```bash
claude mcp add --scope project -e BLAZON_BIN=/path/to/blazon --transport stdio blazon -- node /path/to/mcp/dist/index.js --brand .
```

Leave out `-e BLAZON_BIN=...` when `blazon` is on `PATH`. `--scope project` writes `.mcp.json` at the project root.

## Cursor and other clients

Add this to the client's MCP settings (for Cursor, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "blazon": {
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/blazon" }
    }
  }
}
```

Leave out `env` when `blazon` is on the client's `PATH`. Use an absolute path for `--brand` when the client does not start the server in the brand folder.

## VS Code

`.vscode/mcp.json` uses `servers`, and a stdio server needs `type` (checked against the VS Code MCP configuration reference):

```json
{
  "servers": {
    "blazon": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/blazon" }
    }
  }
}
```

## SDK version

The server uses `@modelcontextprotocol/sdk` 1.x, pinned to an exact version (1.32.2). The 1.x line is in maintenance, with v2 (split packages, a different server API) in development. The pin is deliberate: v1 is the line with a stable API today, and this server uses only `McpServer`, `registerResource`, `registerPrompt`, the `tools/list` and `tools/call` request handlers of its low-level `Server` (the tools come from the operations list as JSON Schema, not as Zod objects) and the stdio transport. Migration note for v2: move the imports to the v2 packages, re-check how the request handlers are set and how `tools/list` is shaped (the server sends JSON Schema it holds itself; Zod is used for the prompt's arguments only), and re-run the tests, which exercise every tool, the resources and the prompt through a real client. Zod is pinned alongside it. TypeScript is the repository's own compiler (`npm run typecheck -w mcp`); the workspace adds no second one.

## Tests

`npm test` at the repository root runs `mcp/test/`. The tests start the real blazon command line from source on a project `blazon init` wrote. They are skipped, with a notice, when the SDK is not installed.

`mcp/test/surface.test.ts` checks what a client receives from `tools/list`, the checks of the owner's MCP design playbook: every tool has a title and `readOnlyHint`, every input and output field has a description, no schema uses `anyOf`, `oneOf` or `allOf`, names are snake_case, a description is at most 2 KB, there are at most 12 tools, the instructions name only registered tools, and the numbers in the text are the constants the code enforces. `mcp/test/__snapshots__/tools-list.json` is the committed `tools/list`, so a change to the surface shows in review; after a deliberate change run `UPDATE_SNAPSHOT=1 npx vitest run mcp/test/surface.test.ts` and review the diff. `mcp/test/operations.test.ts` checks that the tools are the operations of the list that have one, in its order, with its words, and the blazon command each tool runs. One test in `server.test.ts` starts the real entry point over stdio, lists tools, resources and prompts, and calls tools.
