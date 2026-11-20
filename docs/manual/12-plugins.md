# Plugins

← [Manual index](index.md)

A plugin is a program that blazon runs for you: a check on your brand, or a step that makes something from it, such as a deck or constants for an app. A plugin can be written in any language, because blazon talks to it only through JSON on its standard input and output.

Blazon runs a plugin as a child process, once for each call, with a request on its standard input and an answer on its standard output. A plugin has one or two **roles**:

| Role | When | What it does |
|---|---|---|
| `check` | After the brand compiles, in `blazon check`, `blazon tokens` and `blazon build` | Judges the brand and answers with findings, which show beside blazon's own and fail the check when they are errors |
| `build` | After the site is written, in `blazon build`; and after the token files are written, in `blazon tokens`, with no site | Makes something from the brand and writes it into a folder of its own |

`blazon dev` runs `check` plugins too (see [Plugins in blazon dev](#plugins-in-blazon-dev)) and does not run `build` plugins.

## What a plugin can look at, and where it writes

- **A rule that needs files is a build plugin.** A `check` plugin gets the brand and nothing else. A `build` plugin runs after the site is written and is given the built site (`site_dir`; `blazon tokens` runs it too, with no site), so a check on the fonts, the images or the page output belongs there: an error from it fails `blazon build`. The cost is that it runs under `blazon build` only, not under `blazon check` or `blazon dev`.
- **A plugin writes into its own folder.** `<tokensOutDir>/<id>/` (`dist/tokens/<id>/`) is emptied before each run of `blazon build`, where the id is the plugin's name unless the entry gives an `as` (see [Use one plugin more than once](#use-one-plugin-more-than-once)). A plugin that works from the exported tokens reads them from `tokens_dir` (`dist/tokens/`), where `blazon build` has written them before the plugin runs. `blazon tokens` does not empty the folder: the plugin's files overwrite the old ones and nothing is removed, so a plugin that needs the site (it writes nothing there) leaves the last build's files alone, while a file a plugin no longer writes, such as a `tailwind.css` for a brand that lost its tokens, stays until the next `blazon build`.
- **Nothing beside the folder.** Blazon empties only `<tokensOutDir>/<id>/`, so a file a plugin writes next to it, such as a cache it keeps between builds, is never cleaned and can collide with another plugin's folder. Blazon does not give a plugin a folder for its own state yet. `blazon plugin check` reports a file written beside `out_dir` as a warning (case 9 in [Writing a plugin](13-writing-a-plugin.md#write-and-check-a-plugin)), not as a failure.
- **A book that shows generated files builds twice.** Build plugins run after the book's data is read, so a file a plugin makes cannot appear in the same build. Copy the files from the plugin's folder into `assets/`, then run `blazon build` again; a build script holds both steps.

To write a plugin, see [Writing a plugin](13-writing-a-plugin.md). The plugins that ship in blazon's package are listed [below](#plugins-that-ship-with-blazon) and described in [Plugins that ship with blazon](14-shipped-plugins.md).

## Allow a plugin

Only you decide which plugins may run. Name them in `blazon.json`:

```json
{
  "plugins": [ { "name": "acme.house-style", "options": { "headingFont": "Inter" } }, { "name": "acme.deck" } ]
}
```

A name is dotted lowercase words, such as `acme.house-style`, and its program is called `blazon-<name>`: `blazon-acme.house-style`. The dot keeps a plugin apart from anything blazon has built in. `options` is a JSON object that blazon passes the plugin in every request. `env` lists the environment variables you let the plugin have: a plugin starts with an empty environment and gets a variable only when its manifest lists the name and `env` approves it ([Writing a plugin](13-writing-a-plugin.md#what-a-plugin-is)). `blazon check` starts only check plugins, but it reads every configured plugin's manifest, so a build plugin that lists a set variable `env` does not approve is reported by `blazon check` too, not only by the first `blazon build`. The config holds no path and no command, and a field that names one (`command`, `path`, `digest`) is an error: a copied config must not be able to run a program you did not put there.

Blazon runs plugins in the order of the list, one at a time.

### Use one plugin more than once

List a plugin again, with an `as`, to use it more than once. Each entry is an **instance** with an id: `as` when it is given, the plugin's name when it is not, so a config without `as` works as it always did.

```json
{
  "plugins": [
    { "name": "acme.report", "as": "acme.report-short", "options": { "pages": [ "intro" ] } },
    { "name": "acme.report", "as": "acme.report-full" }
  ]
}
```

- **The id.** `as` has the form of a name (dotted lowercase words, at least one dot) and is at most 64 characters. An entry with no `as` has its name as its id, held to the same 64 characters. Ids are unique across the list, and an id may not be the name of a different plugin in it. A mistake is `config-invalid` on `plugins[n].as` or `plugins[n].name`. A program named with `--plugin` takes its plugin's name as its id unless the config lists that plugin, and a `--plugin` program whose id an entry already has is refused with `plugin-failed` and not run.
- **One program, one pin.** `blazon plugin pin --name acme.report` pins the program once. Blazon checks that pin before every call of every instance, and `--plugin` and `blazon plugin check` still take the plugin's name.
- **What an instance has of its own.** Its `options`, its folder `<tokensOutDir>/<id>/` (the only folder blazon empties for it, so two instances never empty each other's), and its breaker: three breaks of one instance stop that instance and no other. The plugin is not told its id.
- **Findings name the instance.** When a plugin is listed more than once, or its id is not its name, a finding it reports ends with `(instance <id>)`, and a finding about the plugin itself (`plugin-failed`) has the id as its `path` and starts with `instance of <name>:`. The finding's `code` and `path` from the plugin are unchanged.

## Pin a plugin

A `check` plugin must be pinned, because its answer decides whether `blazon check` passes and `blazon build` runs. A pin is a digest of what the plugin is made of, recorded in `blazon.plugins.lock`:

```bash
blazon plugin pin plugins/acme.house-style --name acme.house-style
# pinned acme.house-style: t1:3f9c… (computed) in blazon.plugins.lock
```

| Flag | Does |
|---|---|
| `--name <name>` | Records the pin in the lock under this plugin name. Without it, `blazon plugin pin <path>` only prints the digest |
| `--digest <digest>` | You vouch for the digest, from a checksum you trust: the bytes must be exactly those, and the lock says `vouched` |
| `--entry <path>` | For a directory: the program inside it, when it is not named `blazon-<name>` |

A digest blazon computed from the bytes on disk, `computed`, detects any change after you pinned and says nothing about what you pinned. A `vouched` one also catches a substitution before. The lock shows which each is.

For a directory the lock also keeps a `files` list: one line for each file, in the form the digest is made from. The list checks itself, because blazon hashes it and refuses the lock unless the hash is the digest, so blazon can use it to say which files changed. A plugin that no longer matches is then reported like this:

```text
pin mismatch: pinned t1:3f9c…, found t1:a81e…; modified lib/data, added lib/new, removed lib/other, mode changed bin/run; review the change and pin it again
```

It names up to ten files and counts the rest. It says *modified*, *added*, *removed* or *mode changed* and nothing about what is in them, because the lock keeps hashes and not contents: `git diff` shows the change. A lock written before this has no list and the message says only that a file changed.

A pin is `sha256:` and a hash for a single file, and `t1:` and a hash for a directory. A directory digest covers every file's content and execute bit and every name, so a changed byte, an added file or a changed mode gives another digest. Blazon refuses a directory that holds a symbolic link, a named pipe or another special file, a name with a control character, more than 10,000 entries, or more than 256 MiB.

When blazon runs a pinned plugin it copies what the pin names into a private folder, hashes the copy, compares it with the lock, and runs the copy, so what was checked is what runs. A plugin whose bytes no longer match is not run: the finding names both digests. Commit `blazon.plugins.lock` with the project. Blazon reads it strictly, lists every mistake in it, and trusts no plugin while it has one. It also refuses a lock that group or others can write, as it would the plugin.

Paths in the lock are relative to the project when the plugin is inside it, so the lock works on another machine.

**A pinned script and its interpreter.** The pin covers the bytes of a plugin, not the program that runs them, so blazon does not leave the choice of `python3` or `node` to your `PATH`. When the pinned program starts with a `#!` line, blazon reads that line itself and starts the verified copy as `<interpreter> [argument] <copy>`. The line may name an absolute interpreter and at most one argument (`#!/bin/sh -e`), or `env` and one plain name (`#!/usr/bin/env python3`). Anything else is refused: a relative path, a second argument, an option to `env`, a line over 256 bytes or one with a control character.

Blazon looks for the interpreter, and for the name after `env`, only in the directories in `BLAZON_PLUGIN_PATH` (colon-separated, absolute) and then `/usr/local/bin`, `/usr/bin` and `/bin`. A directory counts only if it exists and it, and every directory on the way to it, belong to you or to root and cannot be written by group or others. The same holds for the interpreter file and each link blazon follows to reach it. The plugin then starts with a `PATH` of those directories and no others. Blazon checks again before every launch, so an interpreter changed between two calls is caught.

On a Mac, Homebrew's `/opt/homebrew/bin/python3` is refused because `/opt/homebrew/bin` and `/opt/homebrew/Cellar` can be written by group `admin`. Either use `/usr/bin/python3`, which is found by default, or close that directory to group and others and then add `/opt/homebrew/bin` to `BLAZON_PLUGIN_PATH`. A refusal names the place and what to change. A program that is not a script, such as a compiled executable, needs none of this.

**A pinned plugin written for `node`.** `#!/usr/bin/env node` is looked up the same way, and a `node` installed by Homebrew or a version manager is usually a link to another folder. Naming the folder of the link does not help when that folder is open to group or others: `BLAZON_PLUGIN_PATH=/opt/homebrew/bin` is left out, and the refusal ends with `(left out: /opt/homebrew/bin: ... can be written by group or others)`. Name the folder of the real file instead, which is yours and closed to others:

```bash
export BLAZON_PLUGIN_PATH="$(dirname "$(realpath "$(command -v node)")")"
```

The plugins blazon ships do not need this. They run on the `node` that runs blazon, by its own path, so a refusal about `node` is about a plugin of your own.

A plugin that is not pinned is found by name instead: in `.blazon/plugins/` in the project, then on your `PATH`. Blazon refuses such a plugin for the `check` role. A `build` plugin may run unpinned, but pin it too.

To run a plugin once, unpinned, while you write it, name its program on the command line:

```bash
blazon check --plugin ./blazon-acme.house-style
```

Blazon warns, `acme.house-style runs unpinned because it was named on the command line`, and runs it for this command only. `--no-plugins` is the opposite: on the same three commands it runs no plugin at all, those the config lists included, and it cannot be used with `--plugin`. `--plugin` works on `blazon check`, `blazon tokens` and `blazon build`, and may be repeated, but not with two different programs for one plugin. Nothing is written to the lock.

## Plugins that ship with blazon

Blazon's package carries twelve plugins of its own: `blazon.brand-deck`, `blazon.copy`, `blazon.favicons`, `blazon.logo-geometry`, `blazon.logo-kit`, `blazon.office-template`, `blazon.platform-tokens`, `blazon.press-kit`, `blazon.print-book`, `blazon.shadcn`, `blazon.social-cards` and `blazon.tailwind`. The table below says where each is described. To use one, allow it by name. A plugin that draws in a browser also needs its variables approved in `env`, because no plugin gets one unasked (`['BLAZON_CHROME', 'HOME', 'TMPDIR']`; `blazon.brand-deck` adds `BLAZON_DECK_FONTS`):

```json
{
  "plugins": [ { "name": "blazon.print-book", "env": ["BLAZON_CHROME", "HOME", "TMPDIR"] } ]
}
```

There is nothing to pin and no lock entry to write: the lock is in the package. It is the `plugins/shipped.lock` beside the plugin folders in `plugins/` at the package root. Each folder holds the whole program of its plugin, `bin/blazon-<name>.🔌`, so the digest in the lock covers the code that runs. Two packages are the exception: a plugin that draws with Chrome loads `playwright-core`, and `pdf-lib` is loaded by those that write PDFs, from blazon's `node_modules` when it runs, and the lock does not cover them. The programs and the lock are made by `npm run build:plugins` (`npm run build` and `npm pack` run it), so a package always carries a lock that agrees with its programs. A shipped plugin counts as pinned, so it may be a `check` plugin.

A name is looked up in this order: `blazon.plugins.lock` in your project, then the lock that ships with blazon, then a program named on the command line, `.blazon/plugins/` and your `PATH`. **A pin in your project always wins**, so you can pin your own `blazon.print-book` and blazon runs yours. A shipped name is never found in `.blazon/plugins/` or on `PATH`: no program there can take its place.

A shipped plugin runs where it is, not from a private copy, because it needs blazon's own `node_modules` and built code. So blazon checks the install before every call, the manifest call and the request alike:

1. The lock entry is a tree pin of a folder inside `plugins/`, with a program in it.
2. The plugin folder, its program, and every directory above them up to `/` belong to you or to root, and none can be written by group or others.
3. The digest of the plugin folder is the one in the lock.

Then blazon starts the program with the plugin folder as its working directory, and everything else is as for any plugin: the clean environment, the request as a file on standard input, the limits, the exit codes, the breaker and the scrubbing. A program in JavaScript (a name ending `.js`, `.cjs` or `.mjs`, or a first line `#!/usr/bin/env node` or `#!/usr/bin/node`) is started with the node that runs blazon, by its own path, and not with a `node` found on `PATH`. Any other program is started as the kernel starts it.

When a check fails the plugin is not started, and it is a `plugin-failed` finding like any other. These are the reasons. `<…>` marks what blazon fills in. The finding carries the fix for its own cause, which `blazon check` prints under "Next" and `--json` gives as `fix`:

| Message | What to do |
|---|---|
| `the lock that ships with blazon cannot be used (<what is wrong>); reinstall blazon` | `plugins/shipped.lock` is not valid, or group or others can write it. Reinstall blazon |
| `shipped.lock describes <name> as something blazon does not run: a tree inside plugins/ with a program in it; reinstall blazon` | The entry is not a tree pin of a folder in `plugins/`. Reinstall blazon |
| `<place> can be written by group or others, so blazon will not run a plugin from <folder>` | `<place>` is the folder, the program or a directory above them. Usually blazon is installed under a folder other users share, such as `/tmp`. Install blazon under your own home folder, as the user who runs it. Do not change the permissions of a shared folder: other users and programs need to write there. Until then, `--no-plugins` runs the command without plugins. `<place> is owned by user <n>, who is neither you nor root` stands in the same sentence and has the same fix |
| `<place> does not exist, so blazon will not run a plugin from <folder>; reinstall blazon` | The plugin folder, or a folder above it, is gone. Reinstall blazon |
| `the plugin folder <folder> cannot be read (<why>); reinstall blazon` | The folder is missing, holds a symbolic link, or cannot be read |
| `the plugin folder <folder> does not match the lock that ships with blazon (want <digest>, found <digest>); reinstall blazon` | A byte, a file or a mode in the folder changed since the package was made. Reinstall blazon |

In a `blazon check` or `blazon build` the message follows the plugin's name like any `plugin-failed`: for the first call it reads `the manifest call did not exit 0 (unavailable: shipped plugin: <message>)`, and for a later one `unavailable: shipped plugin: <message>`.

**What this does not do.** Between the digest check and the start of the program, whoever can write the plugin folder could change it. That is why the second check exists: only you and root can write there, so only you and root could do it. A program in a folder that you share with other users is refused, not trusted. The check covers the folder and the directories above it, and the digest covers what is inside; it does not cover blazon's own `dist/` or `node_modules`, which a shipped plugin loads. They are part of the install, so the same rule for who owns the install applies to them, and blazon does not check it for them.

The `blazon plugin check <program>` and `blazon plugin pin <path>` commands work as before on a shipped plugin's program.

The shipped plugins, and where each is described:

| Plugin | Writes | Reference |
|---|---|---|
| `blazon.copy` | Findings for text that breaks the brand's word rules | [blazon.copy](14-shipped-plugins.md#blazoncopy) |
| `blazon.print-book` | The brand book as a PDF and a PowerPoint of pictures | [blazon.print-book](14-shipped-plugins.md#blazonprint-book) |
| `blazon.brand-deck` | A PDF deck of 16:9 slides | [blazon.brand-deck](14-shipped-plugins.md#blazonbrand-deck) |
| `blazon.favicons` | The favicon and app-icon set, and three views of it | [blazon.favicons](14-shipped-plugins.md#blazonfavicons) |
| `blazon.logo-geometry` | A logo's symmetry, balance and grid, and its construction figure | [blazon.logo-geometry](14-shipped-plugins.md#blazonlogo-geometry) |
| `blazon.logo-kit` | Partner lockups and clear-space sheets | [blazon.logo-kit](14-shipped-plugins.md#blazonlogo-kit) |
| `blazon.office-template` | An editable PowerPoint template | [blazon.office-template](14-shipped-plugins.md#blazonoffice-template) |
| `blazon.platform-tokens` | The color and dimension tokens as Android XML, Swift, and Kotlin for Compose | [blazon.platform-tokens](14-shipped-plugins.md#blazonplatform-tokens) |
| `blazon.press-kit` | A folder and a zip for people outside the brand | [blazon.press-kit](14-shipped-plugins.md#blazonpress-kit) |
| `blazon.social-cards` | Marketing images | [Social cards](14-shipped-plugins.md#blazonsocial-cards) |

## Plugins in blazon dev

`blazon dev` runs the `check` plugins when it starts and after every change to a token, a page, an asset, `blazon.json`, `blazon.plugins.lock` or `blazon.lock`. Blazon sends the browser its own findings a moment after the change, as it always did: it waits 75 milliseconds for the file events of a burst, such as a `git checkout` of many files, to end, and a burst is one change and one update. The plugins run after that, one call at a time, and when they finish the page gets a second update with their findings added after blazon's. So for about a second after a save, a plugin's findings are not on the Review page, and they come back when it has finished. A page you open or reload gets the findings of the last finished run.

- **A save while a plugin runs.** The running call is not stopped, but its answer is dropped, because it describes files that have changed. Only the newest change runs next, so a burst of saves costs one more run.
- **A plugin that breaks rests for 30 seconds.** A crash, a timeout, an answer that breaks the rules or too much output is a break. Blazon does not start the program again until 30 seconds after its latest break, and shows `stopped after a break, and runs again in N seconds` as a `plugin-failed` finding. A plugin that exits `2` because it cannot judge is not rested here and runs again at the next change. (`blazon check`, `tokens` and `build` stop a plugin for the rest of the run after three breaks in a row instead, and exit `2` counts as one of them. The next run starts clean.)
- **No restart needed.** Blazon reads `blazon.plugins.lock` and `blazon.json` again at every run, so pinning a plugin or changing its `options` takes effect at the next change. A half-written config is ignored, as for the rest of the dev server.
- **The terminal.** One line when the result changes, such as `[blazon] plugins: 2 errors, 1 warning`, and the reason of each `plugin-failed` finding, once while it reads the same.
- **`/brand.json` stays blazon's own.** The dev server compiles `/brand.json` again on every request and does not run plugins for it, so it has no plugin findings. A plugin is given the brand without them in any case.
- A project that allows no plugin starts no process and sends one update for a change or a burst of changes.

## The profile

`blazon plugin profile` prints blazon's profile: the roles it defines, the exit codes of each, which are behind the breaker, the output limit of each, the prefix that makes a variable secret, the largest request, and which parts of the plugin protocol blazon adopts beyond its core. It is the same document for every install and holds no secret and no path of yours. Blazon builds its behavior from it and tests each field against that behavior.

## What is not built yet

- Plugins that stay running between calls, and the page role.
- Checking who owns `blazon.plugins.lock` or a plugin in `.blazon/plugins/`. Blazon refuses one that group or others can write, and does not check the owner. (The interpreter of a pinned script is checked, owner included.)
- Checking the interpreter of a plugin that is not pinned. It runs as the kernel starts it, with your `PATH`.
- Windows. The protocol uses process groups and file modes.

Blazon needs Node 24 or later. A manifest's `timeout_ms` must be an integer as written and `5000.0` is not one, which needs the text of a JSON number, a feature Node 22 added.

## Where this is specified

The plugin protocol, which says how blazon finds, trusts, starts and judges a plugin, is [RFC 0005](../rfc/0005-plugin-protocol.md). The roles a plugin can fill are [RFC 0002](../rfc/0002-extension-model.md) section 2. A call from the manifest to the answer is drawn in [ARCHITECTURE on GitHub](https://github.com/iksnerd/blazon/blob/main/ARCHITECTURE.md#a-plugin-call), which renders it; the manual's own pages would show the diagram as code. Blazon's host is tested against the protocol's conformance corpus, a set of JSON files kept in `test/spec/`.

