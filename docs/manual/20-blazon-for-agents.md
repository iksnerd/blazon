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

`--name` is the name the client lists the server under, and the prefix of its tool names. By default it is the brand's title as a slug with `-brand` (a brand titled `Acme` or `Acme Brand Book`, the title a new project gets, is `acme-brand`; a title that already says brand in another way, such as `Acme Brand Guidelines`, is kept as `acme-brand-guidelines`). Two brands then sit side by side in one client's config, and an agent sees whose tools it calls. A brand with no title of its own, no `blazon.json`, or a config that does not load gets `blazon`. `--name` takes letters, digits, hyphens and underscores, 64 at most, starting with a letter or digit, and exits 2 for anything else.

What each client takes (checked against the clients' documentation on 2026-11-09):

| Client | What blazon prints |
|---|---|
| Claude Code | a `claude mcp add --scope project ... --transport stdio <name> -- ...` command, which writes `.mcp.json` at the project root, and the `.mcp.json` entry (`mcpServers`) |
| Claude Desktop | an entry for `claude_desktop_config.json` (`mcpServers`; macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`) |
| Cursor | an entry for `.cursor/mcp.json`, or `~/.cursor/mcp.json` for every project (`mcpServers`, with `type`) |
| VS Code | a `code --add-mcp` command, and an entry for `.vscode/mcp.json` (`servers`, with `type`) |

The command is the same from an npm install and from a clone: `node`, the server file of the blazon that runs the command (`<blazon>/mcp/dist/index.js`), `--brand`, and `BLAZON_BIN` naming that blazon's `bin/blazon.js`. If that file is missing from an install (a stale or damaged install), `blazon mcp --print-config` prints no command: it says that the install is incomplete and to reinstall, and exits 1 (`--json` answers `passed: false` with the same `note`). `blazon mcp --check` fails the `built` check with the same words. In a clone that has not built the server, it prints the command with a note to run `npm run build -w mcp`.

A registration made earlier against a source clone keeps running that clone after `npm install` moves a book to a newer blazon, so an agent can keep getting the old tool schemas. `blazon mcp --check` now says when the registered file is not this install's, and `blazon mcp --print-config` prints the command that registers this one. To see what changed between versions, read `CHANGELOG.md` in the installed package (`node_modules/@iksnerd/blazon/CHANGELOG.md`).

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
| `registered` | the chosen client's config has a server named for this brand (`acme-brand`, or the `--name` given) or the older name `blazon` (`--client`, default `claude-code`) and the entry runs this install's `mcp/dist/index.js`. Of an entry it keeps one thing, the script file it runs (the first argument that names an existing `.js` or `.mjs` file, with `~`, relative parts and symlinks resolved); no other argument, no environment value and no token is kept or printed | `blazon mcp --print-config --client <client> --brand <dir>` |

`registered` has four states. `same`: the entry runs this install's file, and the check passes. `different`: it runs another file (a clone you built by hand, an older install), and the finding names the client, that file and this install's file. `unknown`: no script path could be read from the entry (an `npx` or `blazon-mcp` form, a file that is not there), and it says "could not tell which file it runs" rather than guess; nothing is run to find out. `none`: no entry named `blazon`. Only `same` passes, and none of the four changes the exit status: it is a finding, not a failure. The server works, and the client has not been told about this install yet. `passed` covers the first three checks only. `--brand` defaults to the current folder. It looks for the client's files in the current folder and the brand folder (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) and in the user's files (`~/.claude.json`, Claude Desktop's `claude_desktop_config.json`, `~/.cursor/mcp.json`, VS Code's user `mcp.json`).

`--json` prints one document, `command` and `passed` first, then `mode`, `client`, `brand`, `runsPlugins` (always `false`), `trust`, `registered` (true when an entry named `blazon` exists, in any state) and the `checks` list of `{ name, passed, detail, fix }`. The `registered` check also holds `state` (`same`, `different`, `unknown` or `none`), `sameServer` (`true`, `false`, or `null` when the state is `unknown` or `none`), `found`, `files`, and, once the entry is read, `installPath` (this install's server file) and, for `different`, `registeredPath` (the file the entry runs). Exit status: 0 when the server is ready, 1 when it is not, 2 for an unknown client, a brand folder that does not exist, or `--check` given with `--print-config` or with neither flag.

**The check reads the brand.** The handshake makes the server compile the brand and check it without plugins. It starts no plugin, but run `--check` only on a brand folder you trust, as described above.

## The tools

All nine are read-only (`readOnlyHint: true`) and write nothing.

| Tool | Runs | Use it to |
|---|---|---|
| `check_brand` | `blazon check --no-plugins` | see the findings and counts, once per session, before you trust a value; the server's instructions put it first. Plugins do not run, so the counts can be lower than `blazon check` prints, but only for a plugin with a `check` role (`blazon.copy`); build-only plugins such as `blazon.tailwind` add no finding. When `blazon.json` lists plugins, `pluginsSkipped` and a line in `warnings` name all of them, since a role is known only by starting the plugin, and `rulesNotRun` gives the code pattern of each (`blazon.copy/*`): a plugin's finding codes start with its name and a slash, so a rule that matches one did not run, and its absence from `findings` does not mean the brand is clean of it. `byRule` groups the findings by code, worst severity first and then the larger count, each with its `count` and one `example` (`path` and `message`, cut to 80 and 120 characters), so a brand with many warnings is readable without reading the list. It counts every finding the check returned, not only the `limit` kept. Not for reading a value |
| `list_tokens` | `blazon list [group] [--type t] [--tier t] [--theme name]` | find a token path, or read many values at once, for the brand, a group, one type or one tier (`primitive`, `semantic`, `component`); `theme` gives the values in a resolver theme, and `themes` in the answer names the themes the brand has |
| `get_token` | `blazon get <path> [--theme name]` | read the value, type, CSS variable names and rules of one token whose path you know, optionally as a resolver theme resolves it |
| `get_rules` | `blazon rules [path]` | learn what a token, a group or the whole brand allows and forbids |
| `can_use` | `blazon can <fg> <bg>` or `--pair fg:bg` | ask whether one color token may be text on another (`role: "ui"` for a border or focus ring), with the rule behind the answer. `pairs` takes up to 50 `{ fg, bg }` in one call and answers `results`, one for each in order; `alpha` (0 to 1) measures the foreground at that opacity. `verbose: false` leaves out the `checks` of an allowed answer. Pairs are only those a token group lists in `pairs`; component tokens are not read for them |
| `measure_contrast` | `blazon contrast <fg> <bg>` | measure the contrast of one color token on another, optionally with one translucent token blended over the background (`with` and `withAlpha`, together), for a tint or glow no token names. `alpha` is the foreground's own opacity, not the tint's. It is a measurement, not a verdict: the answer has `ratio`, `level`, `nonText`, `seen` and `brandPairs` (the pairs listed for the base background) and never `allowed`. Only `can_use` says whether the brand allows a pair. A gradient is not measured: pass its strongest point as `with` and `withAlpha` |
| `get_fonts` | `blazon fonts` | find the stylesheets and font files to load, and whether each family a token names is loaded; with `css` (and `base`, the URL prefix) also `fontFace`, the `@font-face` rules |
| `get_logo` | `blazon logo` | read the logo variants and their rules before you place a logo. Give `on`, a background color token (`--on` on the command line), and the answer has `pick`: the file to place there, or a `refused` that says why none is. `lockup` (`--lockup`) limits the choice to one lockup |
| `get_outputs` | `blazon outputs` | find the files `blazon tokens` or `blazon build` wrote (the generated CSS, `tokens.json`, each plugin's folder) with their absolute paths and whether each is `fresh` or `stale`, and which configured plugins have no folder, and the command that fixes a stale or empty folder. `file` (a path under the outputs folder, as listed) also returns that file's `text`, cut at 40 000 characters with `truncated`; a file that is not text, or that leaves the outputs folder, is refused. It only reads: it starts no plugin, writes nothing and computes no CSS, so a missing or stale file is fixed by running the command it names. Use it to read generated CSS instead of copying hex values or gradient strings by hand |

Every tool returns blazon's JSON twice: as structured content that matches the tool's output schema, and as the same compact JSON in a text block. Differences from the command line:

- A denied `can_use` is a normal answer with `allowed: false` and the reason. The command exits 1 for it; the tool does not fail. A pair whose contrast cannot be measured is an error, not a denial, unless a usage rule already denies it: a translucent background, or a token that is not a color.
- `get_outputs` is the only tool that reads files blazon wrote earlier and not the brand: its `fresh` and `stale` compare timestamps, and an answer with `fix` means a person or agent with permission runs that command; the server runs nothing.
- `measure_contrast` is never a denial: it has no `allowed`, and what it cannot measure (a translucent background, a `with` that is not a color, an opacity outside 0 to 1) is an error.
- An error, such as a token that does not exist, comes back as a tool error with blazon's own message and the next step: `list_tokens` finds a path. A group path given to `get_token` is refused, and the error names `list_tokens`.
- When the brand has errors, a read command says so on standard error. The tool returns that as a leading text block and as `warnings` in the structured result, with `brandHasErrors: true`. Values from such a brand may be wrong; run `check_brand` and fix the errors first.
- `brandHasErrors` means the same in every tool: the brand's own data has error findings, so a value may be wrong. A `blazon.lock` that names another blazon build is not that. It is reported on its own as `pinMismatch` (`pinned`, `running`, `message`; absent when the pin is met), the same way in every tool, and `check_brand` lists the `pin-mismatch` finding but its `passed` stays true when that is the only error. The book and the blazon build disagree; no value is wrong because of it, so do not re-check values, tell the user. A read command prints it as one warning line and exits 0; `blazon check`, `build` and `tokens` still refuse until the pin is met.
- A number or boolean sent as a string (`"5"`, `"true"`) is accepted when it reads as one.
- An answer over 40 000 characters (about 10 000 tokens) is cut and says so, with the way to narrow it ("narrow with a path" for `get_rules`; a tool with no argument that narrows it says that). `check_brand` takes `limit` (default 50, at most 500) and keeps its `counts` and `passed` whole. `list_tokens` keeps whole tokens and says how many it left out; narrow it with `group`, `type` or `tier`. A `can_use` batch is cut to whole `results` the same way: send fewer pairs, or set `verbose` to false.

The server also offers two resources, `blazon://rules` (every rule of the brand) and `blazon://brand` (the compiled brand), and a prompt, `build_page`, that carries the workflow of [chapter 19](19-building-a-website.md) for a page you describe. The server's instructions are short: the order `check_brand`, `list_tokens`, `get_token`, `can_use` (and `measure_contrast` for a color no token names), and the two limits above.

## What blazon judges and what it only publishes

| Blazon judges (`blazon check`, and the `can_use` verdict) | Blazon publishes, and the agent follows |
|---|---|
| `usage` rules on tokens | A logo's `placement` |
| Listed contrast `pairs` | `do` and `dont` lines |
| A logo's `colorways` | `misuse` figures |
| `logo.deny` and logo contrast | Clear space (the social-cards plugin checks it on its cards) |
| The shape of a sidecar | A token's `$description` |

Blazon does not check an app's layout. A right-hand cell is data in `brand.json` and the tool answers: the agent reads it and keeps to it.

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
