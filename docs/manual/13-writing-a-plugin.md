# Writing a plugin

← [Manual index](index.md)

A plugin is a program that blazon starts for each call and talks to in JSON. This chapter is what an author needs: the manifest, what a call looks like, the answer of each role, and how to check a plugin before you allow it. To allow, pin and run one, see [Plugins](12-plugins.md). The full contract, including what blazon refuses and why, is [RFC 0005](../rfc/0005-plugin-protocol.md).

## What a plugin is

A plugin is one program. Blazon starts it once for each call, and a call is one of two kinds.

**The manifest call.** Blazon starts the program with the single argument `--blazon-manifest` and an empty standard input. The plugin exits `0` and prints one JSON object:

```json
{ "v": 2, "roles": ["check"], "timeout_ms": 10000, "title": "House style" }
```

| Field | Rule |
|---|---|
| `v` | The integer `2` |
| `roles` | The roles it fills, from `check` and `build`, each once. A plugin is called only for a role it lists, once per role if it lists both |
| `timeout_ms` | A positive whole number, at most 60 seconds, default 5 seconds. A fraction (`5000.0`) is refused |
| `env`, `secret_env` | Names of environment variables it asks for, and the ones among them it accepts as secret. The plugin gets a name only when the project's config approves it too (below). A name must be capital letters, digits and underscores, and every `secret_env` name must also be in `env` |
| `title`, `description`, `version`, `homepage` | For people, and optional. A field that is present must be valid: a `title` of at most 60 characters, a `description` of at most 160, a `version` of 1 to 32 letters, digits, dots, plus signs and minus signs, and a `homepage` that is an `http` or `https` address of at most 200 characters |

The manifest call always has 15 seconds and 64 KB of standard output, whatever `timeout_ms` says. Blazon ignores a field it does not know, so a plugin written for a newer blazon still loads.

**A request.** Blazon writes the request to a file that only it can read, and the plugin reads that file as its standard input. The plugin prints its answer on standard output and exits.

| Exit | Means |
|---|---|
| `0` | An answer. Standard output is the role's answer |
| `2` | The plugin could not answer. The first line of standard output says why, and blazon shows it as `could not answer: …`, under the plugin's name |
| anything else, a timeout, or too much output | A break. Blazon reports `plugin-failed` naming the plugin, with a fix for the cause. It quotes nothing the plugin printed on standard output. For an exit code other than `0` or `2`, it adds the last lines of standard error (at most 5 lines and 500 characters, secrets removed) |

A plugin that cannot judge MUST exit `2`, never `0`. Blazon cuts the reason to 300 characters. Exit `2` counts as a break for the breaker: after three in a row blazon stops calling the plugin for the rest of the run. Exit `1` is not an answer for either role, so a plugin that dies on an uncaught exception is a break and not a pass.

Every request has a version, `"v": 1`. A plugin refuses a version it does not speak with exit `2`.

Limits: 64 KB of standard output (1 MiB for a `check` plugin, so that 500 findings fit), the last 8 KB of standard error kept, a request of at most 4 MiB, and the manifest's timeout. A plugin that keeps breaking, three times in a row, is stopped for the rest of that run: the next calls end at once and the program is not started.

**What the plugin sees.** An empty environment plus a `PATH`, and the variables the manifest lists in `env` that you approved (below). A plugin that needs `HOME` or `TMPDIR` lists them like any other name. For a pinned script that `PATH` is the trusted directories above; otherwise it is yours. Your other variables never reach it. It runs in a process group of its own, which blazon ends when the call ends, so a program the plugin started does not outlive it. When a call runs out of time or prints too much, blazon sends the group SIGTERM first and kills what is left after 2 seconds, so a plugin can stop what it started (a browser it opened, say) in a handler.

**Variables a plugin asks for.** The manifest's `env` is a request, not a grant. Blazon gives a plugin a variable only when its manifest lists the name and you approve the name in the `env` list of the plugin's entry in `blazon.config.ts`:

```ts
plugins: [{ name: 'acme.deck', env: ['ACME_FONT_DIR', 'BLAZON_SECRET_ACME_TOKEN'] }],
```

If the manifest lists a name that is set where you run blazon and the entry does not approve it, blazon does not start the plugin. It reports `plugin-failed` and says which variable and which key: `its manifest lists ACME_FONT_DIR, which is set here and not approved, so it is not started`, with the fix `Add "ACME_FONT_DIR" to plugins[0].env in the config, or unset it`. A variable that is not set is not an error. A name in `env` that the manifest does not list reaches nothing. The plugins that ship with blazon follow the same rule, with no list of their own: the ones that draw in a browser list `BLAZON_CHROME`, `HOME` and `TMPDIR`, so their entries approve those three (and `BLAZON_DECK_FONTS` for `blazon.brand-deck`).

**Secrets.** A variable whose name starts `BLAZON_SECRET_` is secret without you doing anything else. Blazon gives it only to a plugin whose manifest lists it in `secret_env`, and refuses to start a plugin that lists it in `env` only. It removes the value, and its base64, URL-encoded and JSON-escaped forms, from everything the plugin prints before blazon shows or keeps any of it.

A plugin's name is dotted lowercase words, `acme.house-style`, and a manifest that names a role blazon does not define is refused. A plugin may fill one role only: `blazon.copy` fills `check` alone.

## The check role

Blazon sends a `check` plugin one JSON object:

```json
{ "v": 1, "type": "check", "options": { "headingFont": "Inter" }, "brand": { "format": "blazon-brand", "version": 1, "...": "the whole brand.json" } }
```

`brand` is the [`brand.json`](11-brand-json.md) of your brand as blazon's own checks left it, and its schema says exactly what is in it. The plugin sees what `brand.json` states and no file paths, so a check cannot read the images. Before it reads anything else, a plugin checks that `format` is `"blazon-brand"` and `version` is `1`, and exits `2` with the reason when either is not: a check that cannot judge the brand must not answer with an empty list.

It answers with findings:

```json
{ "findings": [ { "code": "acme.house-style/heading-font", "severity": "error", "path": "type.heading", "message": "type.heading is set in -apple-system, not Inter" } ] }
```

| A finding | Rule |
|---|---|
| `code` | Starts with the plugin's name and a slash, then lowercase letters, digits and hyphens: `acme.house-style/heading-font`. A plugin cannot report under a blazon code, and you can tell which plugin said what |
| `severity` | `error`, `warning` or `info`. An error fails `blazon check` and stops `blazon tokens` and `blazon build`; `--strict` fails on a warning |
| `path` | Plain text, at most 500 characters: the token, file or place the finding is about |
| `message` | Plain text, at most 1,000 characters |

A check answer must be a JSON object with a `findings` list, and empty standard output is rejected; only a `build` plugin may print nothing or leave `findings` out. A plugin may answer with 500 findings at most. `path` and `message` must not be empty. Text over the limits is cut, not rejected. Control characters are removed from the text, and a field blazon does not know is ignored. An answer that breaks any rule is rejected whole, as a `plugin-failed` finding naming the finding that broke it.

## The build role

A `build` plugin receives the same request with `"type": "build"` and two directories:

```json
{ "v": 1, "type": "build", "options": {}, "brand": { "...": "brand.json" }, "site_dir": "/abs/dist/site", "tokens_dir": "/abs/dist/tokens", "out_dir": "/abs/dist/tokens/acme.deck" }
```

`site_dir` holds the built site and its `brand.json`, so the `file` paths in `brand` resolve against it. `tokens_dir` is `tokensOutDir`, where `blazon build` has already written the token files (`theme.css`, `tokens.json` and the others) before any build plugin runs; read them there if the plugin works from the exported tokens. `out_dir` is `<tokensOutDir>/<id>/`, which blazon empties and creates before each run. The plugin writes its files there, and nowhere else, with one exception that blazon.favicons documents: it also writes a `favicons/` folder in `site_dir` ([below](14-shipped-plugins.md#the-favicons-page-in-the-book)). Blazon reads nothing back from `out_dir`. The plugin may print findings in the same form as a check, or nothing at all. An error from a build plugin makes `blazon build` exit 1 after the site is written.

## Write and check a plugin

[`examples/plugins/acme.house-style/`](../../examples/plugins/acme.house-style/) is a complete `check` plugin in one Python file with no dependency: it fails a heading that is not set in the font its options name. [`examples/plugins/blazon.cue-rules/`](../../examples/plugins/blazon.cue-rules/) lets a brand write its own rules in [CUE](https://cuelang.org) instead of a program: the rules read `brand.json` and compute the findings (it needs `cue` 0.17.1, and `BLAZON_CUE` to say where it is). The deck of [chapter 11](11-brand-json.md#drawing-a-deck) is a real `build` plugin, `blazon.brand-deck`: a Node launcher (`plugins/blazon.brand-deck/bin/blazon-blazon.brand-deck.🔌`) that draws the deck with Node and Chrome, so it needs no Python and no uv ([chapter 14](14-shipped-plugins.md#blazonbrand-deck)). Its one option is `skip`, a list of asset categories to leave out of the deck, their grid slides too (`options: { skip: ['favicons-supplied'] }`); a name that is none is a warning finding (`blazon.brand-deck/skip-unknown`), and the deck is drawn ([chapter 11](11-brand-json.md#drawing-a-deck)). Here is the smallest plugin that passes the check, in shell:

```sh
#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":["check"]}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *1[,}]'; then
  echo '{"findings":[]}'
  exit 0
fi
echo 'unsupported record version'; exit 2
```

```bash
blazon plugin check ./blazon-acme.house-style
```

`blazon plugin check` starts the program the way blazon will and runs the core cases of the plugin protocol against it, then blazon's own cases for each role the manifest declares. It prints the host and what it adopts first, then one line per case, then `Passed` or the number of cases that failed:

```text
blazon plugin check: host blazon, adopts: none
  ok    1  the manifest call prints a manifest the host loads
  ok    2  check: a request that is not JSON exits 2
  ok    3  check: a request of a version the host does not send exits 2
  skip  5  check: --validate with input that is not JSON exits 2 (the role has no validation)
  skip  4  check: a secret value appears nowhere but the field the role defines for it (the manifest lists no secret_env and the role gives no request data to put a canary in)
  ok    6  check: a valid request is answered with exit 0 or 2
  ok    7  check: the answer is at most 1048576 bytes
  ok    8  check: the answer is one the check role accepts: a findings list of at most 500, each with the plugin's code, a severity, a path and a message
  ok    10  every variable the manifest lists is approved in the project config

Passed
```

If the program sits in the layout blazon's own plugins use, `<name>/bin/blazon-<something>` with the folder named as the plugin, its file name must be `blazon-<name>.🔌` (the extension is U+1F50C and marks a plugin program; it does not name a language). `blazon plugin check` reports any other name on one extra line and exits `1`:

```text
  FAIL  layout: the program of the plugin acme.house-style is in acme.house-style/bin, so its file name should be blazon-acme.house-style.🔌, not blazon-acme.house-style.js
```

A program anywhere else, such as a script beside its README or a pinned copy under `.blazon/plugins/`, is not checked for its name.

Add `--core` to run only the core cases of the protocol (1 to 5). It skips blazon's own cases (6 to 10, including the rule that a finding's code starts with the plugin's name) and the `layout` line, and prints `core cases only (1 to 5): no role cases, no layout line` under the first line. Use it to check the protocol's cases alone, for a plugin that declares `check` or `build`. The manifest is still read against blazon's profile, so a plugin whose roles are not blazon's fails case 1; `--core` does not check a plugin written for another host. The exit status is the same: `0` when the core cases pass, `1` when one fails, `2` for bad arguments. A plugin that passes `--core` can still fail without it. With `--json`, the document has `"core": true` after `adopts`, only cases 1 to 5, and no `layout` key.

| Exit status | Means |
|---|---|
| `0` | Every case passed (a skipped case is neither a pass nor a failure, and a warning is a pass) |
| `1` | A case failed, or the program could not start |
| `2` | The command was not given what it needs |

The cases:

1. `--blazon-manifest` prints a manifest blazon loads.
2. A request that is not JSON makes the plugin exit `2`.
3. A request of a version blazon does not send makes it exit `2`.
4. A value the check gives the plugin as a secret appears nowhere in what the plugin prints. It applies to a plugin whose manifest lists a `secret_env`; for any other plugin it is skipped, because a `check` or `build` plugin repeats brand data by design and a value hidden in that data would prove nothing. It is a test, not a proof: a plugin that encodes the value passes.
5. `--validate` with input that is not JSON exits `2`. Blazon's roles have no validation, so this case is skipped.

Cases 6 to 9 are blazon's, and run for each role the manifest declares, with the request blazon sends for that role. For `build`, `out_dir` is an empty folder inside `tokens_dir`, as `blazon build` lays it out. Each case is read from the profile (`blazon plugin profile`), so the check and blazon cannot disagree:

Case 10 is not for a role. When you run `blazon plugin check` in a project whose config lists the plugin (the name is the program's `blazon-<name>`), it fails if an entry's `env` leaves out a name the manifest lists, and says which entry and which names (`plugins[0].env does not approve ACME_FONT_DIR`). It is skipped when the manifest lists no variable, when the plugin is not in the config and when there is no project. `--core` leaves it out.

6. A valid request is answered with an exit code the role defines, `0` or `2`. Exit `1` fails this case: no blazon role defines it, so blazon treats it as a break, the same as an uncaught exception.
7. The answer is within the role's `stdout_limit_bytes`, or the core's 65536 bytes when the role does not raise it (`check` raises it to 1048576; `build` does not).
8. On exit `0`, the answer is one blazon's role accepts: a `findings` list of at most 500, each finding with a code that starts with the plugin's name, a severity, a path and a message. A `build` plugin may print nothing. The check learns the plugin's name from the file name, `blazon-<name>`, and skips this case for any other name.
9. For `build` only: the plugin writes nothing in `tokens_dir` outside `out_dir`. This is a warning, `warn` in the output and `"status": "warn"` in `--json`, and does not fail the check, because blazon has no folder for a plugin's own state yet ([Plugins](12-plugins.md#what-a-plugin-can-look-at-and-where-it-writes)).
