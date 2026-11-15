# Core cases

Cases for the parts of RFC 0002 every host shares, whatever its roles: names (section 3.1), the manifest (3.8), how a call ends (4 to 6), the breaker (7) and the host's check command (9). A host passes when its own code agrees with every file. Read every key strictly: an unknown key is an error in the case file.

Every file has `about` (what the case shows) and `rfc` (the section). Role names belong to a host's profile, so a case writes `$role` where any one role of the host's profile will do; a runner replaces it with one.

| Folder | A case holds | Expected |
| --- | --- | --- |
| `name/valid`, `name/invalid` | `names`, a list | every name is accepted (valid) or refused (invalid) |
| `manifest/valid`, `manifest/invalid` | `manifest` (an object) or `raw` (the exact text, for what JSON parsers read differently, such as `5000.0`) | the manifest loads (valid) or is refused (invalid, `refuse: true`) |
| `call` | `program` (a `/bin/sh` script), `timeout_s`, optional `stdin`, `env` (a variable the manifest lists), `host_env` (set in the host process) and `expect` | see below |
| `breaker` | `sequence`, calls ending in `break`, `answer` or `exit-2` (a call that exits 2, which counts as a break, section 7) | `opens_after_index`: the call that opens it, or `null` |
| `check` | `program` (a plugin under test, `/bin/sh`), `check_env` (variables the operator sets, which the manifest names), optional `data_request`, `marked_fields`, `request` and `expect` | the host's check command passes or fails it, see below |
| `admit/start`, `admit/refuse` | `manifest`, `labels`, `marked_fields`, `pinned`, `mode`, `flows` and `expect` | the host's admission decision, see below |
| `scrub` | `secrets`, `text` and `expect.absent`, `expect.present` | the host's scrubber leaves none of `absent` and all of `present`, see below |

A `call` case runs `program` as the plugin, with `stdin` as the request file, and the host reads the result:

- `outcome: "exit"` means an answer of the core's: exit 0, 1 or 2, with `exit` the code. Optional `stdout` is the exact bytes, `stdout_bytes` their count, `stderr_bytes_at_most` the most stderr the host keeps.
- `outcome: "break"` means anything else: another exit code, a timeout, more than 65,536 bytes of stdout whatever the exit code. What a role does with exit 1 is the profile's.

A `check` case is a plugin, and the host's check command (`<host> plugin check <program>`, section 9) is what is tested. Write `program` to a file the host can find, replace `$role`, set `check_env` in the host's environment, and run the check:

- `expect.check` is `pass` (exit 0) or `fail` (exit 1).
- `expect.case` is the section 9 case that must be the one that fails: 1 the manifest loads, 2 not JSON exits 2, 3 another version exits 2, 4 a secret variable is never repeated, 5 `--validate` refuses input that is not JSON. A host SHOULD name the case in its report. Every failing case here breaks exactly one rule, so a host that fails it for another reason has a bug; a runner can look for the one line.
- The plugin answers with an exit code and no stdout, so the case fits a role whose verdict is an exit code (Contra's `assertion`, Adeloc's `audit-sink`). A host whose roles need a response body checks those in its profile.
- `marked_fields` are the request fields the profile marks as able to hold a secret (JSON Pointers); the manifest's `secret_fields` can list only these. `request` is the role's valid request (default `{"v":1}`). For each pointer the manifest lists, the check sets a random value of its own at that place in `request`, one pointer at a time, writes the request as JSON with no escaping beyond JSON's own, and looks for the value, in every form section 3.5 scrubs, in the raw stdout and stderr. A key or an object the request lacks is added; an array element must exist; a pointer the request cannot hold is skipped and the result says so, which no case can show. A manifest with `secret_fields` and no `secret_env` is checked this way, never with a data canary.
- `data_request` is for a plugin with no `secret_env` and no `secret_fields`: a request for the role with `$canary` where it carries data, as the host's profile would write it. The check replaces `$canary` with a random value that has characters that change when encoded, sends the request, and looks for the value in raw stdout and stderr. A case without `data_request` gives the role no data to put a canary in, so case 4 does not apply to it and the check skips it. A host whose check has no request canary yet skips these cases and says so.
- Case 4 gives `CORPUS_SECRET` a value of the check's own. The leaks here are the plain value on stderr, in the message and in another field of the response. Case 4 is a test, not a proof (section 9): the check scans the forms the host scrubs (the value, base64 in both alphabets, URL-encoded), so `leaks-secret-base64-on-stderr` fails it. A plugin that encodes the value some other way passes, and no case here claims otherwise. That case needs `base64` as well.

An `admit` case is the host's decision to start a plugin (sections 3.5 and 3.6), made from its inputs and nothing else: no process runs. The folder says the outcome, and `expect.admit` agrees with it.

- `manifest` loads as in `manifest/valid`, with `$role` replaced and `marked_fields` as the profile's `secret_fields`.
- `labels` is what the operator marked secret: `env` (variable names) and `fields` (JSON Pointers of request fields), and `delegated`, the labelled variables the host delivers as a capability in place of the value (section 3.7). The host sets `delegated` from what it delivers, never from the plugin's manifest; a delegated name does not make the plugin must-pin, and it still has to be one the plugin accepts as secret. `marked_fields` is what the role's schema marks `x-secret`.
- `pinned` is whether the plugin passed the pin.
- `mode` is `long-running`, or `one-shot-named`, a one-shot command whose operator named the plugin on the command line.
- `flows` is `{returns_secret, authorizes}`, what the role does, which a library cannot know. That a plugin receives a secret follows from the labels and the manifest, and receiving host data is a SHOULD, so neither is an input.
- `expect.admit` is `true` in `admit/start`, with `warn` true when the plugin starts unpinned under the one-shot exception. In `admit/refuse` it is `false`, with `reason`: `label-not-accepted`, `field-not-marked`, `field-not-listed` or `unpinned-must-pin`.

A host passes when its own admission code agrees with every file. The label store and the pin check stay in the host.

A `scrub` case is the declassification point of section 3.5: `text` is what a plugin handed back and `secrets` the values the operator labelled secret. The host's scrubber is run on both and the result must contain none of the strings in `expect.absent` (a value and the base64 and URL-encoded forms the case writes out as literals) and every string in `expect.present` (the text around them). What replaces a value is the host's own, so no case fixes it. An empty secret matches nothing, and a value is text, never a pattern. The forms are the ones the check command looks for in case 4: base64 in both alphabets without padding, and URL-encoded as a query (a space as `+`), with `%20` for the space, and as a path segment. A secret with a character that Go's path escaping and Python's differ on (`+`, `=`, `:`, `@`, `$`, `&`) is in a case only for the forms both agree on.

The cases need a POSIX shell and `head`, `tr`, `cat`, `sleep`, and `base64` for one check case. A host on another platform says what it does instead (RFC 0002 section 4).

## Checked against

Contra `d3d2e498` (2026-10-15), plus `contra plugin check` for the `check` folder: `Contra.Engine.Plugin.Manifest.decode/2`, `Contra.Plugins.name?/1`, `Contra.Engine.Plugin.Program.run_with_stderr/5` and `Contra.Engine.Plugin.Breaker`. Every case agrees with it. A case that Contra disagrees with is a bug in the case or in Contra, and goes to the owner before either changes.

Not covered yet, because they need a profile or a role: what a role's response looks like (the schemas in `schemas/plugin/` describe it), and pins other than the digest (`tree-digest/`).
