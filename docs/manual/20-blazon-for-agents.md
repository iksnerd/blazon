# Blazon for agents (MCP)

← [Manual index](index.md)

A coding agent that builds a site from a brand can ask blazon questions as tool calls over the Model Context Protocol (MCP), instead of running commands and reading their output. The server is a small separate program, `mcp/` in the blazon repository. It runs the read commands of [chapter 19](19-building-a-website.md) with `--json` and returns what they print. Blazon itself gains no dependency, and the server is not part of the blazon package. It is not published to npm yet: build it from the repository.

## Start the server

```bash
npm ci
npm run build -w mcp
```

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

The command blazon prints comes from how this blazon is installed. In a source checkout with `mcp/dist/index.js` built, it is `node` with that file, and `BLAZON_BIN` names this blazon's `bin/blazon.js`. Without a build it prints the proposed form, `npx -y @iksnerd/blazon-mcp`, and says that the package is not published to npm yet, so that command fails until it is.

`blazon dev` shows the same snippets in the brand book: the "Connect your agent" button in the top bar opens a panel with a tab for each client and a copy button on each snippet, with this project's folder as the brand. The dev server provides them at `/__blazon/mcp-config`. A static site has no such answer, so it has no button.

A hand-written entry looks like this (Cursor and other clients that read a JSON file):

```json
{
  "mcpServers": {
    "blazon": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js", "--brand", "/path/to/brand"],
      "env": { "BLAZON_BIN": "/path/to/blazon" }
    }
  }
}
```

VS Code's `.vscode/mcp.json` uses `servers` in place of `mcpServers`. Leave out `env` when `blazon` is on the client's `PATH`.

The server talks over standard input and output. `--brand <folder>` or `--brand=<folder>` (or the environment variable `BLAZON_BRAND`) names the brand folder; it defaults to the folder the client starts the server in. `BLAZON_BIN` names the blazon program when it is not on `PATH`.

**Use a brand folder you trust.** Reading a brand loads its `blazon.config.ts` as code, so a brand folder can run any code as your user. The server hands the blazon program only an allowlist of the environment (`PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LC_*`, `BLAZON_*`, `NO_COLOR` and a few Windows names), so secrets in the client's environment do not reach that code. That limits the harm; it does not make an untrusted brand safe.

## Check that it works

An agent can learn in one command whether the server is ready. `blazon mcp --check` writes no file and changes no config:

```bash
blazon mcp --check --brand ./my-brand
```

It runs four checks, and each one that does not pass names a `fix` command:

| Check | What it tests | Fix when it fails |
|---|---|---|
| `built` | `mcp/dist/index.js` exists beside this blazon | `npm ci && npm run build -w mcp`, run at the repository root |
| `blazon` | the server can find blazon: `BLAZON_BIN` when set, else `blazon` on `PATH`; the answer says which was used | `export BLAZON_BIN=<this blazon's bin/blazon.js>` |
| `handshake` | the server starts on the brand, answers `initialize` and `tools/list` with every tool by name, and answers `check_brand` with a limit of 1. The server is stopped afterwards, and killed after 30 seconds if it does not answer | rebuild, then run the check again |
| `registered` | the chosen client's config has a server named `blazon` (`--client`, default `claude-code`). Only server names are read: no command, argument or environment value is kept or printed | `blazon mcp --print-config --client <client> --brand <dir>` |

`registered: false` is a finding, not a failure: the server works, and the client has not been told about it yet. `passed` covers the first three checks only. `--brand` defaults to the current folder. It looks for the client's files in the current folder and the brand folder (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) and in the user's files (`~/.claude.json`, Claude Desktop's `claude_desktop_config.json`, `~/.cursor/mcp.json`, VS Code's user `mcp.json`).

`--json` prints one document, `command` and `passed` first, then `mode`, `client`, `brand`, `runsBrandConfig`, `trust`, `registered` and the `checks` list of `{ name, passed, detail, fix }`. Exit status: 0 when the server is ready, 1 when it is not, 2 for an unknown client, a brand folder that does not exist, or `--check` given with `--print-config` or with neither flag.

**The check runs the brand's config.** The handshake makes the server compile the brand, which loads its `blazon.config.ts` as code. Run `--check` only on a brand folder you trust, as described above.

## The tools

| Tool | Runs | Answers |
|---|---|---|
| `list_tokens` | `blazon list [group] [--type t]` | The paths, types and values of the tokens of the brand, of a group, or of one type, to find a path |
| `get_token` | `blazon get <path>` | The value, type, CSS variable names and rules of one token |
| `get_rules` | `blazon rules [path]` | The usage, pairs and logo rules of a token, a group or the whole brand |
| `can_use` | `blazon can <fg> <bg>` | Whether one color token may be text on another, with the rule behind the answer |
| `get_fonts` | `blazon fonts` | The stylesheets and font files to load, and which families the tokens name are loaded |
| `get_logo` | `blazon logo` | The logo variants and the rules of each logo asset |
| `get_shadcn` | `blazon brand --key theme.shadcn` | `theme.shadcn`: the shadcn/ui variables the brand supplies and the ones it does not |
| `check_brand` | `blazon check --no-plugins` | The findings and their counts, without running plugins. The server's instructions put it first in a session |

Every tool returns blazon's JSON twice: as structured content that matches the tool's output schema, and as the same compact JSON in a text block. Differences from the command line:

- A denied `can_use` is a normal answer with `allowed: false` and the reason. The command exits 1 for it; the tool does not fail.
- An error, such as a token that does not exist, comes back as a tool error with blazon's own message and the next step: `list_tokens` finds a path. A group path given to `get_token` is refused, and the error names `list_tokens`.
- `get_shadcn` runs `blazon brand --key theme.shadcn`, which compiles the brand again each time, so it needs no build and cannot be out of date.
- When the brand has errors, a read command says so on standard error. The tool returns that as a leading text block and as `warnings` in the structured result, with `brandHasErrors: true`. Values from such a brand may be wrong; run `check_brand` and fix the errors first.
- An answer over 40 000 characters (about 10 000 tokens) is cut and says so ("narrow with a path"). `check_brand` takes `limit` (default 50, at most 500) and keeps its `counts` and `passed` whole. `list_tokens` keeps whole tokens and says how many it left out; narrow it with `group` or `type`.

The server also offers two resources, `blazon://rules` (every rule of the brand) and `blazon://brand` (the compiled brand), and a prompt, `build_page`, that carries the workflow of [chapter 19](19-building-a-website.md) for a page you describe. The server's instructions are short: the order `check_brand`, `list_tokens`, `get_token`, `can_use`, and the two limits above.

## A skill for the agent

The blazon repository holds an Agent Skill, `skills/blazon/SKILL.md`, that teaches an agent the working loop on a brand book: `blazon check`, `blazon can` for contrast, the tools above and when to use each, where tokens live, what never to edit, how to read a finding and how to add a token or a page. It points at this manual instead of repeating it. To install it, copy the `skills/blazon` folder into the agent's skills directory (for Claude Code, `.claude/skills/` in the project or `~/.claude/skills/` for every project). It works with or without the MCP server.

## What the server will not do

It writes nothing and does not build. It runs the blazon program without a shell, passes the arguments as a list, and accepts a token path only when it is dot-separated segments of ASCII letters, digits, `_` and `-`, each starting with a letter, digit or `_`, so an argument cannot become a flag. A tool refuses any argument it does not list. It stops a blazon command after 30 seconds, runs at most two at once, and reuses an answer for two seconds. It does not start blazon plugins: `check_brand` is `blazon check --no-plugins`, so findings that only a plugin raises are not in its answer.
