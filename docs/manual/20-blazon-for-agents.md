# Blazon for agents (MCP)

← [Manual index](index.md)

A coding agent that builds a site from a brand can ask blazon questions as tool calls over the Model Context Protocol (MCP), instead of running commands and reading their output. The server is a small program of its own, `blazon-mcp`, that ships inside the blazon package. It runs the read commands of [chapter 19](19-building-a-website.md) with `--json` and returns what they print. It is one file (`mcp/dist/index.js` in the package) with the MCP SDK and zod bundled in at build time, so `npm install @iksnerd/blazon` adds no package for it, and `blazon-mcp` is one more program npm links next to `blazon`. The npm package `@iksnerd/blazon-mcp` is not published; the server is part of `@iksnerd/blazon`.

## Start the server

Install blazon, and the server is there:

```bash
npm install @iksnerd/blazon
npx blazon mcp --check --brand ./my-brand
```

A clone of the repository builds it with `npm ci && npm run build`, which writes `mcp/dist/index.js` (or `npm run build -w mcp` for the server alone).

Then let blazon print the config for your client. `blazon mcp --print-config` writes no file; it prints what to paste or run:

```bash
blazon mcp --print-config --client claude-code --brand ./my-brand
```

`--client` is `claude-code` (the default), `claude-desktop`, `cursor` or `vscode`; an unknown client exits 2. `--brand` is the brand folder, written into the config as an absolute path; without it the server reads the folder the client starts it in. `--json` prints the same as one document, `command` and `passed` first, with a `snippets` list of `{ kind, label, text }`.

What each client takes (checked against the clients' documentation on 2026-11-09):

| Client | What blazon prints |
|---|---|
| Claude Code | a `claude mcp add --scope project ... --transport stdio blazon -- ...` command, which writes `.mcp.json` at the project root, and the `.mcp.json` entry (`mcpServers`) |
| Claude Desktop | an entry for `claude_desktop_config.json` (`mcpServers`; macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`) |
| Cursor | an entry for `.cursor/mcp.json`, or `~/.cursor/mcp.json` for every project (`mcpServers`, with `type`) |
| VS Code | a `code --add-mcp` command, and an entry for `.vscode/mcp.json` (`servers`, with `type`) |

The command is the same from an npm install and from a clone: `node`, the server file of the blazon that runs the command (`<blazon>/mcp/dist/index.js`), `--brand`, and `BLAZON_BIN` naming that blazon's `bin/blazon.js`. If that file is missing from an install (a stale or damaged install), `blazon mcp --print-config` prints no command: it says that the install is incomplete and to reinstall, and exits 1 (`--json` answers `passed: false` with the same `note`). `blazon mcp --check` fails the `built` check with the same words. In a clone that has not built the server, it prints the command with a note to run `npm run build -w mcp`.

To start the server without writing a config, `npx -y -p @iksnerd/blazon blazon-mcp --brand ./my-brand` runs it from the package. `blazon-mcp --version` prints blazon's version and the versions of the MCP SDK and zod that the file carries.

`blazon dev` shows the same snippets in the brand book: the "Connect your agent" button in the top bar opens a panel with a tab for each client and a copy button on each snippet, with this project's folder as the brand. The dev server provides them at `/__blazon/mcp-config`. A static site has no such answer, so it has no button.

A hand-written entry looks like this (Cursor and other clients that read a JSON file):

```json
{
  "mcpServers": {
    "blazon": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/node_modules/@iksnerd/blazon/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/node_modules/@iksnerd/blazon/bin/blazon.js" }
    }
  }
}
```

VS Code's `.vscode/mcp.json` uses `servers` in place of `mcpServers`. Leave out `env` when `blazon` is on the client's `PATH`.

The server talks over standard input and output. `--brand <folder>` or `--brand=<folder>` (or the environment variable `BLAZON_BRAND`) names the brand folder; it defaults to the folder the client starts the server in. `BLAZON_BIN` names the blazon program; without it the server runs the `bin/blazon.js` of the package it ships in, and only when that file is not there, `blazon` on `PATH`.

**Use a brand folder you trust.** The server runs no plugin: `check_brand` is `blazon check --no-plugins`, and the other tools run read commands that never start one, so the plugins `blazon.json` names are not run, and `blazon.json` is plain JSON that is read as data. What the brand says does reach your agent, as tool results: token names and values, rule text and finding messages. A brand can try to put instructions there. The server's instructions tell the model to read that text as data, and the server removes zero-width, bidirectional and Unicode tag characters from every answer and says how many in `warnings`. That makes an instruction harder to hide; it does not stop a plain sentence in a rule. The server hands the blazon program only an allowlist of the environment (`PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LC_*`, `BLAZON_*`, `NO_COLOR` and a few Windows names), so secrets in the client's environment do not reach it.

## Check that it works

An agent can learn in one command whether the server is ready. `blazon mcp --check` writes no file and changes no config:

```bash
blazon mcp --check --brand ./my-brand
```

It runs four checks, and each one that does not pass names a `fix` command:

| Check | What it tests | Fix when it fails |
|---|---|---|
| `built` | `mcp/dist/index.js` exists in this blazon's package (an npm install ships it; a clone builds it; an install that lost it says it is incomplete) | `npm install @iksnerd/blazon` for an install, `npm ci && npm run build -w mcp` at the root of a clone |
| `blazon` | the server can find blazon: `BLAZON_BIN` when set, else this package's `bin/blazon.js`, else `blazon` on `PATH`; the answer says which was used | `export BLAZON_BIN=<this blazon's bin/blazon.js>` |
| `handshake` | the server starts on the brand, answers `initialize` and `tools/list` with every tool by name, and answers `check_brand` with a limit of 1. The server is stopped afterwards, and killed after 30 seconds if it does not answer | rebuild, then run the check again |
| `registered` | the chosen client's config has a server named `blazon` (`--client`, default `claude-code`). Only server names are read: no command, argument or environment value is kept or printed | `blazon mcp --print-config --client <client> --brand <dir>` |

`registered: false` is a finding, not a failure: the server works, and the client has not been told about it yet. `passed` covers the first three checks only. `--brand` defaults to the current folder. It looks for the client's files in the current folder and the brand folder (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) and in the user's files (`~/.claude.json`, Claude Desktop's `claude_desktop_config.json`, `~/.cursor/mcp.json`, VS Code's user `mcp.json`).

`--json` prints one document, `command` and `passed` first, then `mode`, `client`, `brand`, `runsPlugins` (always `false`), `trust`, `registered` and the `checks` list of `{ name, passed, detail, fix }`. Exit status: 0 when the server is ready, 1 when it is not, 2 for an unknown client, a brand folder that does not exist, or `--check` given with `--print-config` or with neither flag.

**The check reads the brand.** The handshake makes the server compile the brand and check it without plugins. It starts no plugin, but run `--check` only on a brand folder you trust, as described above.

## The tools

All seven are read-only (`readOnlyHint: true`) and write nothing.

| Tool | Runs | Use it to |
|---|---|---|
| `check_brand` | `blazon check --no-plugins` | see the findings and counts, once per session, before you trust a value; the server's instructions put it first. Plugins do not run, so the counts can be lower than `blazon check` prints, but only for a plugin with a `check` role (`blazon.copy`); build-only plugins such as `blazon.tailwind` add no finding. When `blazon.json` lists plugins, `pluginsSkipped` and a line in `warnings` name all of them, since a role is known only by starting the plugin Not for reading a value |
| `list_tokens` | `blazon list [group] [--type t]` | find a token path, or read many values at once, for the brand, a group or one type |
| `get_token` | `blazon get <path>` | read the value, type, CSS variable names and rules of one token whose path you know |
| `get_rules` | `blazon rules [path]` | learn what a token, a group or the whole brand allows and forbids |
| `can_use` | `blazon can <fg> <bg>` | ask whether one color token may be text on another (`role: "ui"` for a border or focus ring), with the rule behind the answer |
| `get_fonts` | `blazon fonts` | find the stylesheets and font files to load, and whether each family a token names is loaded |
| `get_logo` | `blazon logo` | read the logo variants and their rules before you place a logo |

Every tool returns blazon's JSON twice: as structured content that matches the tool's output schema, and as the same compact JSON in a text block. Differences from the command line:

- A denied `can_use` is a normal answer with `allowed: false` and the reason. The command exits 1 for it; the tool does not fail.
- An error, such as a token that does not exist, comes back as a tool error with blazon's own message and the next step: `list_tokens` finds a path. A group path given to `get_token` is refused, and the error names `list_tokens`.
- When the brand has errors, a read command says so on standard error. The tool returns that as a leading text block and as `warnings` in the structured result, with `brandHasErrors: true`. Values from such a brand may be wrong; run `check_brand` and fix the errors first.
- `brandHasErrors` means the same in every tool: the brand's own data has error findings, so a value may be wrong. A `blazon.lock` that names another blazon build is not that. It is reported on its own as `pinMismatch` (`pinned`, `running`, `message`; absent when the pin is met), the same way in every tool, and `check_brand` lists the `pin-mismatch` finding but its `passed` stays true when that is the only error. The book and the blazon build disagree; no value is wrong because of it, so do not re-check values, tell the user. A read command prints it as one warning line and exits 0; `blazon check`, `build` and `tokens` still refuse until the pin is met.
- A number or boolean sent as a string (`"5"`, `"true"`) is accepted when it reads as one.
- An answer over 40 000 characters (about 10 000 tokens) is cut and says so, with the way to narrow it ("narrow with a path" for `get_rules`; a tool with no argument that narrows it says that). `check_brand` takes `limit` (default 50, at most 500) and keeps its `counts` and `passed` whole. `list_tokens` keeps whole tokens and says how many it left out; narrow it with `group` or `type`.

The server also offers two resources, `blazon://rules` (every rule of the brand) and `blazon://brand` (the compiled brand), and a prompt, `build_page`, that carries the workflow of [chapter 19](19-building-a-website.md) for a page you describe. The server's instructions are short: the order `check_brand`, `list_tokens`, `get_token`, `can_use`, and the two limits above.

## A skill for the agent

The blazon repository holds an Agent Skill, `skills/blazon/SKILL.md`, that teaches an agent the working loop on a brand book: `blazon check`, `blazon can` for contrast, the tools above and when to use each, where tokens live, what never to edit, how to read a finding and how to add a token or a page. It points at this manual instead of repeating it. To install it, copy the `skills/blazon` folder into the agent's skills directory (for Claude Code, `.claude/skills/` in the project or `~/.claude/skills/` for every project). It works with or without the MCP server.

## A folder outside the brand

A category's `dir` outside the brand folder is read only when you approve it. The server passes `BLAZON_*` variables from its own environment to blazon, so set `BLAZON_ALLOW_DIRS` in the `env` of the server's entry in your client's config, with absolute folders (blazon runs in the brand folder): `"env": { "BLAZON_ALLOW_DIRS": "/path/to/shared" }`. The server's environment is yours, not the brand's and not the agent's: nothing the agent or the brand sends can add a folder. See [An extra folder](06-assets-and-icons.md#an-extra-folder).

## Limits

A blazon command is stopped after 30 seconds and its output is capped at 16 MB. At most 2 run at once. An answer is reused for 2 seconds for the same arguments. On SIGTERM, SIGINT or when the client closes standard input, the server kills the commands in flight and exits.

## What is not built

There is no separate npm package: the server ships inside `@iksnerd/blazon`. The server speaks stdio only: no HTTP and no sign-in. No tool writes, builds or runs a plugin. A list has no paging: it is cut to whole items and says how many were left out. An `offset` argument is proposed, not built.

## What the server will not do

It writes nothing and does not build. It runs the blazon program without a shell, passes the arguments as a list, and accepts a token path only when it is dot-separated segments of ASCII letters, digits, `_` and `-`, each starting with a letter, digit or `_`, so an argument cannot become a flag. A tool refuses any argument it does not list. It stops a blazon command after 30 seconds, runs at most two at once, and reuses an answer for two seconds. It does not start blazon plugins: `check_brand` is `blazon check --no-plugins`, so findings that only a plugin raises, such as those of `blazon.copy`, are not in its answer. When `blazon.json` lists plugins, the answer says so: `pluginsSkipped` holds their names and `warnings` carries the line "N plugin(s) in blazon.json did not run". Run `blazon check` yourself for the full counts.
