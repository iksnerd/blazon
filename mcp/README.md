# blazon-mcp

An MCP (Model Context Protocol) server that lets a coding agent ask blazon about a brand as tool calls, instead of reading token files. It runs the blazon command line with `--json` and returns what blazon printed. It does not import blazon's code and needs no blazon dependency, only a `blazon` program it can run. What each tool is called, takes and answers comes from blazon's operations list (`src/core/operations/list.ts`); `mcp/src/generated/` is a copy of it that `npm run gen:mcp` writes, because this package cannot import `src/`. It ships inside the `@iksnerd/blazon` npm package as the single built file `mcp/dist/index.js`, with the SDK and zod bundled in, so a consumer installs no package for it; `blazon-mcp` is a `bin` of `@iksnerd/blazon`. `mcp/` itself is a private workspace of the repository and is not published on its own (the name `@iksnerd/blazon-mcp` is not on npm).

The tools are read-only. None of them writes a file or builds the brand. The manual page for users is [chapter 20](../docs/manual/20-blazon-for-agents.md); it says the same as this file.

## Trust

Use a `--brand` folder you trust. The server runs no plugin: `check_brand` is `blazon check --no-plugins`, and the other tools run read commands that never start one, so the plugins a `blazon.json` names are not run (a test keeps this true for every tool). `blazon.json` is plain JSON, read as data, and the folders and files it names must be inside the brand folder: a path or link that leaves it is refused with `config-path-outside` and nothing from it is read, so a brand cannot make a tool result carry a file from elsewhere on your machine (an asset category's `dir` may name a shared folder only when you approved it: set `BLAZON_ALLOW_DIRS` to that folder in the `env` of the server's entry in your client's config, as an absolute path, because the server runs blazon in the brand folder; the server hands blazon the variable as you set it and a brand cannot set it; only image files in it are read). What a brand says does reach your agent: token names and values, rule text and finding messages come back as tool results, and a brand can try to put instructions in them. The server's instructions tell the model to read that text as data, and the server removes zero-width, bidirectional and Unicode tag characters from every answer and says how many it removed in `warnings`. That makes an instruction harder to hide; it does not stop a plain sentence in a rule, so use a brand you trust.

The server hands the blazon program only an allowlist of its environment: `PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LC_*`, `BLAZON_*`, `NO_COLOR`, `SystemRoot`, `windir`, `COMSPEC`, `PATHEXT`. Tokens and cloud keys in the client's environment do not reach it.

## Tools

The server's instructions give the order: `check_brand` once per session, `list_tokens` to find a path, `get_token` for its value, `can_use` for each text and background pair.

| Tool | Arguments | Wraps | Use it to |
|---|---|---|---|
| `check_brand` | `severity`, `limit` (default 50, at most 500) | `blazon check --no-plugins` | see the brand's own findings and counts, and whether it `passed`. Plugins in `blazon.json` do not run, so `warning` and `info` counts can be lower than `blazon check` prints (a plugin with a `check` role, such as `blazon.copy`, raises its own findings; a build-only one such as `blazon.tailwind` raises none); when the config lists plugins, `pluginsSkipped` and a line in `warnings` name all of them, since a role is known only by starting the plugin |
| `list_tokens` | `group`, `type`, `tier`, `theme` (all optional) | `blazon list [group] [--type t] [--tier t] [--theme name]` | find a token path, or read many values at once; `tier` keeps one of primitive, semantic or component; `theme` gives the values in a resolver theme, and `themes` in the answer names the themes the brand has; cut to whole tokens at the size limit |
| `get_token` | `path`, `theme` (optional) | `blazon get <path> [--theme name]` | read a token's value, type, CSS variable names and rules, optionally as a resolver theme resolves it |
| `get_rules` | `path` (optional) | `blazon rules` | learn what a token, a group or the whole brand allows and forbids |
| `can_use` | `fg` and `bg`, or `pairs` (up to 50), `role`, `theme`, `verbose` | `blazon can` | ask whether one color may be text on another (`pairs` answers `results`, one for each pair in order; `verbose: false` drops the `checks` of an allowed answer), or with `role: "ui"` a focus ring, border or icon stroke judged at 3:1 with no pairs. A denied answer is a result with `allowed: false`, not an error |
| `measure_contrast` | `fg` and `bg`, `with` and `withAlpha` (together), `alpha`, `theme` | `blazon contrast` | measure the contrast of one color on another, optionally with one translucent token blended over the background, for a color no token names. A measurement with no `allowed`: only `can_use` says whether the brand allows a pair |
| `get_fonts` | none | `blazon fonts` | find the stylesheets and files to load, and whether each family a token names is loaded |
| `get_logo` | none | `blazon logo` | read the logo variants and their clear space, minimum size and forbidden backgrounds |

Every tool has a title, `readOnlyHint: true` and an input schema that refuses extra arguments. A number or boolean sent as a string (`"5"`, `"true"`) is accepted when it reads as one. A token path is dot-separated segments of ASCII letters, digits, `_` and `-`; a segment starts with a letter, digit or `_`. So `a..b`, `a.`, `-x` and `.x` are refused, and an argument can never become a flag.

An error from blazon, such as an unknown token, comes back as a tool error carrying blazon's message and the next step ("To find a token path, call list_tokens."). A group path given to `get_token` is refused the same way.

### Results

Each answer has `structuredContent`, validated against the tool's `outputSchema`, and the same compact JSON as a text block. Two fields are always there:

- `warnings`: the lines blazon printed on standard error. A read command prints "this brand has N error(s), so a value below may be wrong" there when the brand has errors. When `warnings` is not empty it also comes first as its own text block, so the model reads it before the value.
- `brandHasErrors`: true when the brand's own data has error findings, so a value may be wrong. The same in every tool. The `pin-*` findings (`blazon.lock` names another blazon build) do not set it.
- `pinMismatch`: present only when `blazon.lock` names another blazon build than the one running: `pinned` and `running` (as blazon prints them) and a one-line `message`. It means the book and the build disagree, not that a value is wrong. `check_brand` still lists the `pin-mismatch` finding, and its `passed` is true when that is the only error.

The size cap is 40 000 characters, about 10 000 tokens, the point where Claude Code starts to warn about a tool result. An answer over it is cut in the text block with a notice that says how to narrow the question ("narrow with a path" for `get_rules`; a tool with no argument that narrows it says so), and the structured result then holds only `truncated`, `notice`, `warnings`, `brandHasErrors` and, when there is one, `pinMismatch`. `check_brand` and `list_tokens` instead keep whole items: `check_brand` keeps `counts` and `passed` whole and cuts `findings` to `limit` (default 50, at most 500, and fewer if still too large); `list_tokens` cuts `tokens` to fit. Both add `findingsTotal` or `tokensTotal`, `truncated` and `notice`.

### Resources and prompt

| Name | What it is |
|---|---|
| `blazon://rules` | every rule of the brand (`blazon rules --json`), `application/json` |
| `blazon://brand` | the compiled brand as `brand.json` holds it (`blazon brand`), `application/json` |
| prompt `build_page` (argument `description`) | the workflow of the manual's chapter 19: check first, read the rules, fonts and logo, find paths with `list_tokens`, never hard-code a value, `can_use` for each pair, and list the questions the brand does not answer |

Resources are not cut to the size limit. A warning from blazon comes as a separate `text/plain` entry before the JSON entry.

## Not built

- No separate npm package: the server is part of `@iksnerd/blazon`.
- Only the stdio transport. There is no HTTP server and no sign-in.
- No tool writes, builds or runs a plugin, so findings that only a plugin raises are not in `check_brand`.
- No paging: a list is cut to whole items and says how many were left out, and you narrow it (`group`, `type`, `severity`). An `offset` argument is proposed, not built.

## Limits

- Each blazon command is killed with SIGKILL after 30 seconds, and its output is capped at 16 MB.
- At most 2 blazon commands run at once; others wait.
- An answer is reused for 2 seconds for the same arguments. A time limit, not file modification times, because a brand config can import files from anywhere, and a 2-second window cannot be stale for long while it saves a second compile when an agent asks the same thing twice.
- On SIGTERM, SIGINT or when the client closes standard input, the server kills commands in flight and exits.

## Build

```bash
npm install            # at the repository root: mcp/ is a workspace, so this installs its dependencies too
npm run build -w mcp   # or npm run build, which also builds blazon and runs this
```

This runs `scripts/build-mcp.mjs`, which bundles `mcp/src/index.ts`, the MCP SDK and zod into `mcp/dist/index.js`: one ES module with a shebang, nothing resolved from `node_modules` when it runs, no source map and no machine path in it. The output is a pure function of the sources and the two pinned versions (two builds give the same bytes). The SDK and zod stay in `mcp/package.json` `dependencies` for the build and the tests, and in no dependency list of `@iksnerd/blazon`. `npm run build` runs it, so `npm pack` and `npm publish` ship the file (`package.json` `files`, and `scripts/check-pack.mjs` requires it). `blazon-mcp --version` prints the versions the file carries. It needs Node 24 or later.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `--brand <folder>` or `--brand=<folder>`, or `BLAZON_BRAND` | the current folder | The brand folder. Every command runs there. A value starting with `--` is refused |
| `BLAZON_BIN` | the `bin/blazon.js` two folders above the server file when it exists (inside `@iksnerd/blazon`), else `blazon` on `PATH` | The blazon program to run |
| `--version` | | Print blazon's version and the versions of the MCP SDK and zod bundled in, and exit |

## Print the config

`blazon mcp --print-config [--client claude-code|claude-desktop|cursor|vscode] [--brand <dir>] [--name <name>] [--json]` prints the command or JSON that registers this server in a client, with an absolute brand folder when `--brand` is given, under a name taken from the brand's title (`acme-brand`; `blazon` when there is none) or `--name`. It writes no file. It names `node`, the `mcp/dist/index.js` of the blazon that runs it (an installed package ships it) and `BLAZON_BIN`. If an install has lost that file it prints nothing and says to reinstall. `blazon dev` offers the same in a "Connect your agent" panel. The sections below show the formats by hand.

A registration made earlier against a source clone keeps running that clone after `npm install` moves a book to a newer blazon, so an agent can keep getting the old tool schemas. `blazon mcp --check` now says when the registered file is not this install's, and `blazon mcp --print-config` prints the command that registers this one. What changed between versions is in `CHANGELOG.md` in the installed package (`node_modules/@iksnerd/blazon/CHANGELOG.md`).

## Claude Code

Options go before the name; `-e` must not be followed directly by the name.

```bash
claude mcp add --scope project -e BLAZON_BIN=/path/to/node_modules/@iksnerd/blazon/bin/blazon.js --transport stdio blazon -- node /path/to/node_modules/@iksnerd/blazon/mcp/dist/index.js --brand .
```

Leave out `-e BLAZON_BIN=...` when the file is the one inside `@iksnerd/blazon` (it finds the `bin/blazon.js` beside it) or `blazon` is on `PATH`. `--scope project` writes `.mcp.json` at the project root.

## Cursor and other clients

Add this to the client's MCP settings (for Cursor, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "blazon": {
      "command": "node",
      "args": ["/path/to/node_modules/@iksnerd/blazon/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/node_modules/@iksnerd/blazon/bin/blazon.js" }
    }
  }
}
```

Leave out `env` when the file is the one inside `@iksnerd/blazon` or `blazon` is on the client's `PATH`. Use an absolute path for `--brand` when the client does not start the server in the brand folder.

## VS Code

`.vscode/mcp.json` uses `servers`, and a stdio server needs `type` (checked against the VS Code MCP configuration reference):

```json
{
  "servers": {
    "blazon": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/node_modules/@iksnerd/blazon/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/node_modules/@iksnerd/blazon/bin/blazon.js" }
    }
  }
}
```

## SDK version

The server uses `@modelcontextprotocol/sdk` 1.x, pinned to an exact version (1.32.2). The 1.x line is in maintenance, with v2 (split packages, a different server API) in development. The pin is deliberate: v1 is the line with a stable API today, and this server uses only `McpServer`, `registerResource`, `registerPrompt`, the `tools/list` and `tools/call` request handlers of its low-level `Server` (the tools come from the operations list as JSON Schema, not as Zod objects) and the stdio transport. Migration note for v2: move the imports to the v2 packages, re-check how the request handlers are set and how `tools/list` is shaped (the server sends JSON Schema it holds itself; Zod is used for the prompt's arguments only), and re-run the tests, which exercise every tool, the resources and the prompt through a real client. Zod is pinned alongside it. Both are frozen into the built file at build time: a consumer gets the versions of the release they installed, `blazon-mcp --version` names them, and a fix for either needs a new blazon release ([SECURITY.md](../SECURITY.md)). TypeScript is the repository's own compiler (`npm run typecheck -w mcp`); the workspace adds no second one.

## Tests

`npm test` at the repository root runs `mcp/test/`. The tests start the real blazon command line from source on a project `blazon init` wrote. They are skipped, with a notice, when the SDK is not installed.

`mcp/test/bundle.test.ts` builds the file into a temporary folder and runs it from there, where no `node_modules` can be found: it checks the file (a shebang, no source map, no import of a package, no machine path, the same bytes from two builds, `--version`), then calls every tool over stdio, refuses an extra argument, proves that no tool starts a plugin the brand names, that the blazon child gets only the environment allowlist, and that the file finds the `bin/blazon.js` beside it. A bundling mistake fails there and not on a user's machine.

`mcp/test/surface.test.ts` checks what a client receives from `tools/list`, the checks of the owner's MCP design playbook: every tool has a title and `readOnlyHint`, every input and output field has a description, no schema uses `anyOf`, `oneOf` or `allOf`, names are snake_case, a description is at most 2 KB, there are at most 12 tools, the instructions name only registered tools, and the numbers in the text are the constants the code enforces. `mcp/test/__snapshots__/tools-list.json` is the committed `tools/list`, so a change to the surface shows in review; after a deliberate change run `UPDATE_SNAPSHOT=1 npx vitest run mcp/test/surface.test.ts` and review the diff. `mcp/test/operations.test.ts` checks that the tools are the operations of the list that have one, in its order, with its words, and the blazon command each tool runs. One test in `server-process.test.ts` starts the real entry point over stdio, lists tools, resources and prompts, and calls tools.
