# RFC 0005: Plugin protocol

Status: draft 1, sections 3 to 9 implemented · Scope: how blazon finds, trusts, starts and judges a plugin, whatever the plugin does
Numbering: blazon RFCs, starting at 0001. Builds on [RFC 0001](0001-data-model.md) (the data model; section 12 `brand.json` is what a `check` plugin receives) and is the base of [RFC 0002](0002-extension-model.md), which defines the roles a plugin can fill. Sections 1 to 10 are numbered as other documents refer to them.

## Summary

A brand extends blazon with a program of its own: a check on the brand, or a step that makes something from it. This RFC is the contract between blazon and that program. It fixes how a plugin is named and allowed, how blazon finds it and decides to trust it, what blazon starts and what it hands the program, how the program answers, what it may spend, and what stops a plugin that keeps failing. It does not say what a role asks of a plugin: that is RFC 0002.

A plugin is a program, not a library. Blazon starts it once for each call, writes a request to a file only blazon can read, and reads one JSON answer from the program's standard output. Any language can write one.

## Motivation

A brand book is checked in a pipeline and built on a developer's machine, so a plugin is code that runs where secrets and write access are. Three questions decide whether that is safe, and each has a wrong answer that works until it does not:

1. **Who may add a plugin.** If data a plugin can influence (a token file, a page, a copied config) can name a program, a pull request can run code. Only the operator names a plugin.
2. **What runs.** A program found by name on a search path is whatever someone put there first. A program checked and then started is whatever replaced it in between. Blazon must run the bytes it checked.
3. **What a failure means.** A check that crashes and is read as "no findings" is a pass that was never earned. Every end that is not an answer is an error.

Blazon's own check and build steps come from plugins that ship in its package, so the contract has to be one blazon can hold itself to, and one a company can read before it allows anything.

## Conventions

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" and "MAY" are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

**Host** is blazon. **Operator** is whoever owns the repository blazon runs in and its configuration. **Plugin** is an executable blazon finds and starts. A **call** is one start of the plugin's program, for the manifest or for one request. An **answer** is a call that ends with an exit code the role defines. A **break** is any other end: a timeout, an exit code the role does not define, too much output, a program that cannot start. A **secret-labelled value** is a value the operator has told blazon is secret (section 3.5). A **pin** is a record of what a plugin must contain (section 3.4).

## 1. Why a program for each call

A plugin could be a library loaded into blazon, or a long-lived server. A program started for each call is chosen because it is the one form that any language can write, that a crash cannot take blazon down with, and that blazon can hash, copy and start without running any of the plugin's code first. The cost is a process for each call (Drawbacks).

### Non-goals

- A plugin is not a library. Blazon never loads a plugin's code into its own process.
- A plugin is not contained. An allowed plugin runs as the user who runs blazon, and the operator who allowed it trusts it. This protocol decides what a plugin can be made to do and what an attacker can plant. It does not contain a malicious plugin (section 10).
- A plugin is not a service. Nothing here runs a plugin over a network, and a pin has no meaning for one.

## 2. Layers

| Layer | Says | Where |
|---|---|---|
| Core | Discovery, trust, the manifest, how a plugin is started, exit codes, limits, the breaker, versioning, conformance | this RFC |
| Profile | Blazon's roles, each role's request and answer, what each exit code means for that role, which roles are behind the breaker, any limit tighter or, for one role, looser than the core | [RFC 0002](0002-extension-model.md) section 2, and `blazon plugin profile` |

A profile MAY tighten a core rule. It MUST NOT loosen one, with one exception: section 6 allows a profile to raise the output limit of a named role and the timeout cap of a role whose call waits on a person.

`blazon plugin profile` prints the profile as JSON, so a tool can read it: the roles, the exit codes of each, which are behind the breaker, the output limit of each, the prefix that labels a variable secret, and the largest request.

## 3. Discovery and trust

### 3.1 Names

A plugin name is dotted lowercase words, `^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$`. The dot keeps a plugin apart from everything blazon has built in, and a name can never be a path. The program is `blazon-<name>`: `blazon-acme.house-style`.

### 3.2 Who allows a plugin

Only the operator, in the `plugins` key of `blazon.config.ts` (RFC 0001 section 14), a list of `{ name, as?, options? }`, where `as` is an instance id (RFC 0002 section 2): one plugin may be listed more than once, and the pin below is for the plugin's name, not the instance's. Data a plugin could influence (a token, a page, a sidecar, a request) never names a plugin, never holds a path and never holds a command. A config key that does (`command`, `path`, `digest`) is an error. A name that is not allowed is not run.

### 3.3 Finding the program

An **unpinned** plugin is found by name: in `.blazon/plugins/` in the project, then on the operator's `PATH`. Blazon refuses a plugin that group or others can write, and does not check its owner.

A **pinned** plugin is never searched for. The lock (section 3.4) says where it lives and what it must contain. Which plugins MUST be pinned is section 3.6.

### 3.4 Pinning

A pin is one of two kinds, and an operator picks whichever fits the plugin.

**`file`: a self-contained executable.** The lock holds a path and a SHA-256, written `sha256:<hex>`. It is the right kind for a compiled plugin, and the only kind an operator can check by hand with `shasum -a 256`.

**`tree`: a directory.** The lock holds a path to a directory, the relative path of the program inside it, and a tree digest, written `t1:<hex>`. It is for a plugin that is a launcher script and files beside it, which a single file's hash cannot cover.

The tree digest is the SHA-256 of the lines `<type> <x|-> <path> <sha256>\n`, one for each entry, sorted by the bytes of the relative path. `type` is `f` for a file or `d` for a directory. `x` is present when the owner execute bit is set and `-` when not. The last field is the SHA-256 of a file's contents, or `-` for a directory. Paths use `/`, are relative to the tree's root, and the root itself is not listed.

- Every entry MUST be a regular file or a directory. Blazon MUST refuse a tree that holds anything else (a named pipe, a socket, a device) without opening it, and a tree with a name that has a byte below 0x20 or the byte 0x7F, since a newline in a name could forge an entry.
- The entry program MUST be a regular file. Blazon MUST refuse a pinned path that is a symbolic link, and a tree that contains one: a link is the one way a path can name something other than what was hashed.
- Blazon MUST refuse a tree of more than 10,000 entries or 256 MiB.
- Blazon provides `blazon plugin pin <path>`, which prints the digest of a file or a directory, so an operator never computes one by hand.

Before it trusts a pinned plugin, blazon SHOULD refuse the file, or any directory in the tree, that is not owned by the user running blazon or by root, or that group or others can write. Integrity does not depend on this, because the digest of the copy is what is checked; it catches a careless install early. Then blazon MUST:

1. make a private directory for the call (mode 0700, owned by the user running blazon) and copy the file or the tree into it;
2. compute the SHA-256 or the tree digest **of the copy** and compare it with the pin;
3. run the copy, from its own directory, and not the original.

Hashing the copy and running the copy closes the gap that hashing the original and then starting it leaves open. Blazon makes the copy for each call and does not keep one between calls. A mismatch is an error naming the plugin and both digests, and the files that differ when the lock kept the list (below). The plugin is not run, and it is never a pass and never a fallback to an unpinned copy. The other plugins still run.

**Where a pin comes from.** The pin lives on blazon's side, in `blazon.plugins.lock`, which blazon checks like the program itself. The lock is JSON, `{ "v": 1, "plugins": { <name>: { kind, path, entry?, digest, files?, source } } }`, and `source` is `vouched` or `computed`. A **computed** digest was taken from the bytes on disk when the plugin was pinned: it detects any change afterwards and says nothing about what was pinned. A **vouched** digest was supplied by the operator from a source they trust, such as a published checksum, and also catches a substitution before the pin. `blazon plugin pin <path> --name <name>` writes a computed entry, and `--digest <digest>` writes a vouched one if the bytes match. Blazon reads the lock strictly: it lists every mistake, and trusts no plugin while the lock has one. It refuses a lock that group or others can write. A path inside the project is stored relative to it, so the lock works on another machine.

**`files`.** For a `tree` entry the lock MAY keep the lines the tree digest is the hash of, as an array of strings without their LF. A host that reads `files` MUST check that the SHA-256 of the lines, each followed by LF, is the digest, and refuses the lock otherwise, so a list that does not belong to the digest is never believed. When a pinned tree no longer matches, the host MAY compare the lines with those of the tree it found and name each path as modified, added, removed or mode changed; it can say no more than that, because the lock holds hashes and not contents. A tree with a name that is not valid UTF-8 has no `files`, as JSON cannot hold the name, and is pinned by its digest alone. A lock without `files` is valid and works as before. The digest scheme, `t1:`, does not change.

Installing or upgrading a pinned plugin writes the new bytes and then updates the pin. A crash between the two leaves them disagreeing, which is a mismatch as above, and that is the safe direction.

**The interpreter.** A pin covers the bytes a plugin is made of, not the program that runs them. A launcher that starts `python3` or `node` runs whatever that name finds. So for a pinned program whose first line is `#!`, blazon resolves the interpreter itself when it makes the copy. It reads the interpreter named on that line (`env` and one plain name, or an absolute path and at most one argument), looks for it only in the directories of `BLAZON_PLUGIN_PATH` (colon-separated, absolute) and then `/usr/local/bin`, `/usr/bin` and `/bin`, and starts the verified copy through the path it found. It MUST check the resolved file and every directory on the way to it: each is owned by the user running blazon or by root, and none is writable by group or others, and a link's target is checked the same way. Anything else on the `#!` line is refused. The plugin then starts with a `PATH` of those directories and no others. This covers the bytes of the interpreter's file at the moment it is checked. It does not cover what the interpreter then loads (a standard library, a shared library, a virtual environment), and there is a window between the check and the start, because the interpreter is not copied. A plugin that must not depend on an interpreter is a `file` pin of a self-contained executable, the one form in which the bytes that run are the bytes that were pinned.

**What a tree pin covers.** A tree pin covers the files in the tree and nothing else. A plugin made of a launcher that loads code from outside its tree (a `dist/` folder beside it, a package in `node_modules`) is pinned only as far as the launcher, and the code that runs is not covered. A plugin that wants its pin to cover its code SHOULD hold all of it in the tree: one bundled file, or a launcher and the files it loads, none of which is reached by a path that leaves the tree. What it still loads from outside (a package in `node_modules`, the interpreter's own libraries) is outside the pin, and its documentation SHOULD name it.

A pin says nothing about what the plugin does or who made it.

### 3.5 Labels

Whether a value is secret is the **operator's** decision, made in the configuration and never by the plugin: a plugin that could label its own inputs could label them public.

A variable whose name starts `BLAZON_SECRET_` is secret without anything else being done. These rules follow from a label:

- A manifest lists the variable names the plugin needs in `env`, and the subset it **accepts as secret** in `secret_env`. Blazon MUST give a secret-labelled value only to a plugin whose `secret_env` lists that name. If the operator labelled a value secret and the plugin does not accept it as secret, Blazon MUST refuse to start the plugin and not downgrade the label.
- A secret can also arrive in a request field. A role's schema marks which request fields can hold one, and the manifest's `secret_fields` lists those the plugin accepts it in. Blazon's roles mark none, so `secret_fields` is empty, and a manifest that lists one is invalid.
- A plugin that lists a name in `secret_env` is stating that it knows the value is secret and will handle it so. It does not make the value secret.
- Labels are opt-in, so a secret the operator forgot to label is passed, unscrubbed, and needs no pin.

Blazon MUST scrub every value it holds as secret-labelled, and its base64 and URL-encoded forms, from everything a plugin hands back that blazon stores, shows or logs: the message, the answer and **standard error**. This is the one declassification point: a secret-labelled value is allowed out only in a field a role defines for it, and no blazon role defines one.

### 3.6 What must be pinned

By what flows through the plugin, not by its role:

| The plugin... | Pinned |
|---|---|
| receives a secret-labelled value | MUST |
| authorizes something: its answer is a yes that blazon or a pipeline acts on | MUST |
| receives brand data but no secret | SHOULD |
| receives neither | MAY |

Blazon's `check` role authorizes, because `blazon check` gates a pipeline and a `check` plugin's answer decides whether `blazon build` runs. A `check` plugin MUST be pinned. A `build` plugin receives the brand and no secret, so it SHOULD be pinned, and blazon runs it unpinned if it is not. A plugin with `secret_env`, whatever its role, MUST be pinned.

A single run MAY use an unpinned plugin the operator names explicitly on the command line (`--plugin <program>`), with a warning and for that run only, and nothing is written to the lock. The risk pinning answers is a program that keeps being picked up from disk; a one-shot run does not have it. A plugin that ships in blazon's own package is pinned like any other, by a lock the release ships beside it (`plugins/shipped.lock`), which names a directory digest for each. A shipped plugin's program is `bin/blazon-<name>.🔌` in a folder named `<name>`, and it is the plugin's whole code: a single CommonJS file that blazon's build writes from the plugin's source with every module it imports bundled in (the extension is unknown to Node, which runs such a file as CommonJS). It loads only Node's own modules and two packages, `playwright-core` and `pdf-lib`, which it finds in blazon's `node_modules` when it runs. Those two packages are outside the pin, and so are Node and the libraries it loads; the pin covers every other byte that runs, and each shipped plugin's README says which of the two it loads. The programs and the lock are build output and are not committed. `plugins/shipped.lock` is written by the build that writes the programs, after them and from the folders as built, so a lock cannot disagree with the programs it ships with. The build adds no build stamp, hashed name or timestamp, so the same sources and the same locked dependencies give the same bytes and the same digests. The file name is `blazon-`, the plugin name (which can hold dots) and the extension `.🔌` (U+1F50C). The extension marks the file as a plugin program and is not a language: the interpreter is still the one on the `#!` line (section 3.4). A host that reads the name from a file name MUST take everything between `blazon-` and the final `.🔌`, and MUST NOT read a name from a file with another extension. A host's check command SHOULD report a program in that layout (`<name>/bin/blazon-<something>`, the folder a plugin name) whose file name is not `blazon-<name>.🔌`, and say what the file name should be; it stays silent for a program anywhere else, because the layout is the shipped one and no other plugin is bound to it. `blazon plugin check` does this and exits `1`, apart from the protocol cases.

### 3.7 Capabilities

Where a role's work could be done through blazon, blazon SHOULD give the plugin a capability (an unforgeable handle to do one thing, scoped to one call) in place of a secret. Blazon's roles hand a plugin no secret and no capability today, so this section has no behaviour. It is kept so that a later role that needs one is bound by the rule: a capability MUST be scoped to one call, MUST carry a bound on what it permits, MUST stop working when the call ends, and MUST NOT be usable by a second plugin or a second call.

### 3.8 The manifest call

Blazon starts the program with the single argument `--blazon-manifest`. Standard input is empty. The environment is the base set only (section 4). The call has 15,000 ms and 64 KB of standard output. The plugin MUST exit `0` and print one JSON object:

```json
{ "v": 2, "roles": ["check"], "timeout_ms": 10000, "title": "House style" }
```

| Field | Required | Rule |
|---|---|---|
| `v` | yes | The integer `2`. Blazon MUST refuse a manifest of another version |
| `roles` | yes | One or more of `check` and `build`, each once. A plugin is called only for a role it lists, and a manifest that names a role blazon does not define is refused |
| `timeout_ms` | no | A positive integer written without a fraction. Default 5000, capped at 60000. `5000.0` is refused |
| `env` | no | Variable names (`^[A-Z_][A-Z0-9_]*$`) the plugin asks for beside `PATH`. The host gives one only when its operator approves it |
| `secret_env` | no | The subset of `env` the plugin accepts as secret (section 3.5). A name here that is not in `env` is invalid |
| `secret_fields` | no | Empty or absent for every blazon role (section 3.5) |
| `title`, `description`, `version`, `homepage` | no | For people. Blazon MUST NOT use them to run the plugin. One that is present must be valid: no control or format character, a `title` of at most 60 grapheme clusters, a `description` of at most 160, a `version` of 1 to 32 letters, digits, dots, plus signs and minus signs, and a `homepage` of at most 200 characters that is an `http` or `https` address with a host and no credentials |

Blazon ignores a field it does not know, so a manifest written for a newer blazon still loads. Reading a manifest's `timeout_ms` as written needs the text of a JSON number, which Node 22 or later provides, and is the reason blazon needs it.

## 4. Invocation

| Call | Arguments |
|---|---|
| manifest | `--blazon-manifest` |
| a request | none |

- **Standard input** is a regular file made for the call in a directory of mode 0700, created exclusively at mode 0600, so no other user can open it, and removed afterwards. It holds one JSON object (a request) or nothing (the manifest). A plugin MUST NOT assume it ends in a newline.
- **Environment** is empty plus `PATH` if it is set, plus the names the manifest's `env` lists that the host's operator has approved for this plugin and that are set. A host MUST NOT give a plugin a variable on the manifest's word alone. How the operator approves a name is the host's (blazon: `env` on the plugin's config entry, RFC 0002 section 2). For a pinned plugin `PATH` is not the operator's own: it is the list of trusted directories of section 3.4. Blazon's own environment never reaches a plugin.
- **Working directory** is the plugin's own directory for a pinned plugin. For an unpinned one it is not defined, and a plugin MUST NOT depend on it.
- **Processes.** One process for each call, in its own process group, killed as a group when the call's time runs out and again after it exits. Blazon sends the group SIGTERM first and kills what is left 2 seconds later, so a plugin that started a program of its own (a browser, say) can stop it; the grace is blazon's, not the protocol's. A plugin MUST be safe to run concurrently with itself. The mechanism needs a POSIX system, and blazon does not run plugins on Windows.
- **Standard error** goes to blazon, which scrubs it (section 3.5) and bounds what it keeps. A plugin MUST NOT print a secret to it.

## 5. Output and exit codes

| Exit | Meaning |
|---|---|
| `0` | An answer. Standard output is the role's answer |
| `2` | The plugin could not answer. The first line of standard output says why |
| anything else, a timeout, too much output, no program | A break. Blazon reports an error naming the plugin and quotes nothing the plugin printed |

A role MAY define exit `1`; neither of blazon's roles does, so a plugin that dies on an uncaught exception is a break and not a pass. A plugin that cannot judge MUST exit `2`, never `0`.

The message is the first line of standard output. Blazon ignores it when it is not valid UTF-8, removes every Unicode control (Cc) and format (Cf) character, trims white space, cuts it to 300 grapheme clusters, and uses a message of its own naming the plugin when nothing is left. A message MUST name what failed and MUST NOT hold a secret, a token, a header value or a body the plugin was given. A plugin writes its answer as UTF-8 JSON, and blazon reads it as JSON, so it does not depend on how a character is escaped.

**Never a pass.** An exit the role does not define as a success, a timeout, output over the limit even with exit `0`, a missing or unstartable program, a plugin that is not allowed, a pinned plugin whose digest does not match, and an answer that is not what the role defines: none is ever a success. Blazon reports each as a finding (`plugin-failed`) and never raises on one.

## 6. Limits

| What | Limit | Over it |
|---|---|---|
| the manifest call | 15,000 ms, 64 KB of standard output | the plugin does not load |
| any other call | the manifest's `timeout_ms`, at most 60,000 ms | an error; the process group is killed |
| standard output of a call | 65,536 bytes | an error, whatever the exit code |
| standard output of a `check` call | 1 MiB, so that 500 findings fit | an error |
| the message | 300 grapheme clusters, the first line | cut |
| standard error kept | 8 KB a call | cut |
| a request blazon sends | 4 MiB | not sent; the plugin is not started |

The `check` role's output limit is the one place the profile raises a core limit. Nothing in blazon's profile lowers one.

## 7. The breaker

A plugin that keeps breaking stops being called for the rest of a unit of work. The breaker counts the breaks of an instance (RFC 0002 section 2), so one instance of a plugin listed more than once does not stop another. After three breaks in a row, every later call in that unit ends at once as an error without starting the program. For this count a call that exits `2` is a break, though the table in section 5 lists exit `2` among the codes the core defines: a plugin that cannot answer three times in a row is the case the breaker is for, and blazon still shows its message. An answer, any other exit code a role defines, resets the count. The breaker never closes within the unit, never carries into the next, and MUST NOT turn a stopped call into a pass. Both of blazon's roles are behind it. The unit is one run of a blazon command. The dev server has no such unit, so it uses a cooldown instead: a plugin that broke is not started again until 30 seconds after its latest break. The cooldown does not rest a plugin for exit `2`, because its message asks for a change the next save may make; section 7 of the family's specification lets a host with no unit of work choose its own rule.

## 8. Versioning

Versions belong to messages, not to the protocol as a whole. Every request record carries its own `v` (`1` today), and a plugin MUST refuse a record of a version it does not speak with exit `2`. Blazon MUST refuse a manifest whose `v` it does not speak.

- Compatible, with no new `v`: a new optional field in a request, a manifest or an answer. A plugin MUST ignore request fields it does not know, and blazon MUST ignore manifest and answer fields it does not know.
- Incompatible, with a new `v`: removing or renaming a field, a new required field, a changed type or meaning, a new meaning for an exit code, a tighter limit.

## 9. Conformance

`blazon plugin check <program>` starts a plugin the way blazon does and exits `0` when every case passed, `1` when one failed and `2` for bad arguments. A plugin conforms when it passes. Core cases, run for every role the plugin declares:

1. `--blazon-manifest` prints a manifest blazon loads.
2. A request that is not JSON exits `2`.
3. A request of a version blazon does not send exits `2`.
4. **Noninterference.** For each name in `secret_env`, the check supplies a random secret-shaped value that contains characters which change when encoded (`+`, `/`, `=`, a space, `?`, `&`). It calls the plugin with that value set on a valid request, on a request that is not JSON and on a request of another version. It reads the plugin's raw output, before any scrubbing, so a plugin that leaks cannot pass by relying on the scrubber. The value appears in none of: raw standard error, the message, and standard output. Blazon's profile gives no request with a place for a canary, so case 4 is skipped for a plugin with no `secret_env`, and the check says it skipped it, which section 9 of the family's protocol specification allows for a role whose profile gives no such request. A manifest with `secret_fields` is refused, because no role of blazon's profile defines one.
5. A validation call (`--validate` with input that is not JSON exits `2`) applies only to a role that has one. Blazon's roles have none.

Case 4 is a test, not a proof: a plugin that encodes the value passes it. The check can show a leak and cannot show there is none.

`blazon plugin check <program> --core` runs only the core cases above, with no case 6 to 9 and no layout line (section 3.6); the exit status is the same, and `--json` adds `core: true`.

After the core cases, `blazon plugin check` runs blazon's own cases, 6 to 9, for each role the manifest declares: the exit code, the output limit, the shape of the answer, and for `build` a warning when the plugin writes in `tokens_dir` outside `out_dir`. They are blazon's, not the protocol's: the shared corpus holds only the core cases of section 9 of the family's protocol specification. Each is derived when the check runs from blazon's profile (`BLAZON_PROFILE` in `src/plugins/wire/profile.ts`, which `blazon plugin profile` prints) and from the answer blazon's roles accept, so this RFC does not restate them. [Writing a plugin](../manual/13-writing-a-plugin.md#write-and-check-a-plugin) describes each one.

Blazon adds case 10, outside any role, when the working folder holds a project whose config lists the plugin: it fails when an entry of the plugin does not approve a name the manifest lists in `env` (section 4), because blazon would not start the plugin there. It is skipped for a manifest with no `env`, for a plugin the config does not list and outside a project.

Blazon's own tests include a broken plugin for each core case, so that the check is known able to fail. For a pinned plugin they also show that bytes changed after pinning are refused, that a changed file in a pinned tree is refused, and that a pinned path replaced by a symbolic link is refused. The core's cases are also kept as a corpus of files that need no code to read (`test/spec/`), and blazon's host agrees with every one.

## 10. Security considerations and threat model

What this protocol defends against, and what it does not. "Replace" means write to the place the plugin is installed.

| An attacker who can... | Unpinned | Pinned |
|---|---|---|
| put a program earlier in the search path | wins | there is no search, so cannot |
| replace the interpreter a pinned launcher starts | wins | cannot, while the resolved interpreter and every directory to it pass the owner and mode checks, up to the window between that check and the start (section 3.4) |
| replace the installed program after blazon started | wins if blazon resolved a path once and ran it unchecked | refused: blazon runs its verified copy |
| replace the program between the check and the start | wins | cannot: blazon runs the copy it hashed |
| write blazon's private directory for the call (mode 0700) | wins | wins |
| run as the user who runs blazon | wins | wins |
| read a plugin's standard input file | cannot, as it is mode 0600 in a 0700 directory | cannot |
| make a plugin print a secret it was handed | succeeds, if the plugin allows it | scrubbed at the boundary, and case 4 shows common leaks |

Pinning defends against three things: another local user or process that can write a directory plugins are found in, or a plugin file that group or others can write; a program replaced after installation by accident, an updater or a mounted volume; and, only when the digest was vouched, a substitution before it was pinned. It is integrity, not protection from a compromised machine.

A same-user attacker is outside this protocol: anything that runs as the user who runs blazon can edit blazon. The protocol defends the place plugins are installed and the call boundary against a party who cannot.

## Drawbacks

- **Blazon takes on a host.** The obligations are real work: a pin on a verified copy, an interpreter check, a scrubbing step, a breaker and a check command. They are also the part of a plugin system where hosts go wrong.
- **A process for each call.** With several plugins and a dev server that recompiles on every save, this is noticeable. The dev server drops stale calls. Long-lived plugins are the route if it is too slow (open question 1).
- **A `check` plugin must be pinned.** That is a digest to compute and to refresh at every upgrade. `blazon plugin pin` does both, and the cost is the price of failing closed.
- **A `check` plugin cannot read the images.** It gets no file paths, only `brand.json`. A rule on pixel size or colour mode waits for a use.
- **Pins are per machine.** A path in the lock is relative to the project when it can be, and an absolute one is not portable.
- **Tree digests are blazon's own scheme.** A tool that wants to check one needs the rule in section 3.4 and does not get it from a standard.

## Alternatives and prior art

1. **In-process plugins**, written in the host's language and loaded into its process. ESLint rules and Style Dictionary hooks work this way (see References).
   - Pros: no process to start, and the plugin sees the host's own types.
   - Cons: one language only; a crash or a loop takes the host down; the host cannot hash and copy what it is about to run before running any of it.
2. **A long-lived server** that blazon starts once and talks to over a socket.
   - Pros: one start for many calls.
   - Cons: more state to secure and to restart, and a pin has less to bind to. Left as open question 1.
3. **A program for each call**, as in this RFC.
   - Pros: any language; a crash is contained to one call; the bytes can be verified before they run.
   - Cons: a process start for each call.
4. **Running a command from the config**, as a git hook or a package script does.
   - Pros: nothing to build.
   - Cons: the config names a command, which section 3.2 forbids: a copied config could run a program the operator did not put there.

Recommendation: option 3, because it is the one where blazon can check what it runs before it runs it. The choice turns on whether the call rate ever makes a process for each call too slow, which it has not, and option 2 can follow without changing the trust rules.

## Compatibility

The protocol is implemented as written, so nothing in this RFC breaks an existing plugin. `v` is `2` for the manifest and `1` for a request, and section 8 says what a new version needs. A plugin written for an earlier blazon loads, because blazon ignores a manifest field it does not know.

## Status

Implemented, in `src/plugins/`:

- Names, the manifest, limits, and the environment (`wire/`).
- One call: a clean environment, a private request file, a process group, limits and exit codes, never a pass; scrubbing; admission; the check command (`host/`).
- Pins: tree and file digests, `blazon.plugins.lock`, a verified copy, the interpreter of a pinned script, and the lock shipped with blazon's own plugins (`pins/`, `scripts/shipped-lock.mjs`), and the shipped plugins' programs, each one bundled file inside its pinned folder (`scripts/build-plugins.mjs`).
- The breaker, the roles and the dev server's gate (`roles/`).
- The commands `blazon plugin pin`, `check` and `profile` (`src/cli/commands/plugin.ts`). As of 2026-11-08, `check` also reports a program in the shipped layout whose file name is not `blazon-<name>.🔌` (`shippedLayoutProblem` in `src/core/plugin-name.ts`). As of 2026-11-15, `check --core` runs only the core cases of section 9 and leaves out cases 6 to 9 and the layout line.

Not built: long-lived plugins, a role with a validation call, the owner check of the lock and of `.blazon/plugins/` (blazon refuses one that group or others can write and does not check the owner), checking the interpreter of a plugin that is not pinned, and any platform but POSIX.

## Open questions

1. **Long-lived plugins.** Should blazon keep one process for each plugin between calls, so that the dev server does not start a process on every save? A pin would bind to the verified copy of the running process, and a restart would need the breaker's rule.
2. **A role with a validation call.** Blazon's roles have none. A role whose options are complex enough to need blazon to check them before use would need `--validate`, and a case 5 for it.
3. **Capabilities.** Which role, if any, needs one first, and what is its bound?
4. **The profile document.** `blazon plugin profile` prints blazon's profile. Should it have a published schema, so that another tool can read it without reading this RFC?
5. **The owner check.** Should blazon check the owner of the lock and of `.blazon/plugins/`, as it does the interpreter's?

## References

- [RFC 0001: Blazon data model](0001-data-model.md), section 12 `brand.json` and section 14 configuration.
- [RFC 0002: Blazon extension model](0002-extension-model.md), the roles.
- [RFC 2119] Bradner, "Key words for use in RFCs to Indicate Requirement Levels"; [RFC 8174] Leiba, "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words".
- ESLint, Create Plugins: <https://eslint.org/docs/latest/extend/plugins>
- Style Dictionary, Hooks: <https://styledictionary.com/reference/hooks/formats/>
