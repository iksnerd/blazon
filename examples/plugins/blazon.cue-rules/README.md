# blazon.cue-rules

A reference plugin for blazon: a `check` whose rules you write in [CUE](https://cuelang.org). The rules read your brand's `brand.json` and compute a list of findings. Use it when a brand has house rules that blazon's own checks do not know ("every semantic color points at a primitive", "no white in the palette"), and you would rather write them as a short constraint file than as a program.

`cue` does not speak blazon's plugin protocol, so `blazon-blazon.cue-rules` is a short Python file (standard library only) that does: it runs `cue export rules.cue brand.cue -e out` in a private directory and turns each item of `out` into a finding.

## Use it

You need `cue` 0.17.1. The plugin refuses any other version, because that is the one its tests ran against.

```bash
cp examples/plugins/blazon.cue-rules/rules.cue .          # start from the starter rules
cp -R examples/plugins/blazon.cue-rules plugins/          # the plugin, into your project
blazon plugin pin plugins/blazon.cue-rules --name blazon.cue-rules
```

A check plugin gets no file paths, so the rules reach it as text, in `options.rules` of the plugin's entry in `blazon.json`. JSON has no multi-line strings, so write the rules as one string with `\n` for each line break. `jq` does it for you:

```bash
jq -Rs '{rules: .}' rules.cue
```

```json
{
  "plugins": [ { "name": "blazon.cue-rules", "options": { "rules": "out: [\n  ...\n]\n" } } ]
}
```

Blazon starts a plugin with an empty environment, so say where `cue` is: set `BLAZON_CUE` to its path in the shell that runs blazon (`export BLAZON_CUE=$(which cue)`). Without it the plugin looks for `cue` on the `PATH` blazon gives a pinned script, which is `/usr/local/bin`, `/usr/bin` and `/bin`.

## Writing rules

The fields of `brand.json` (`tokens`, `brand`, `pages`, `assets`, ...) are in scope in your rules. Define `out`, a list of findings:

```cue
out: [
	for t in tokens
	if t.type == "color"
	if t.blazon != _|_
	if t.blazon.tier == "primitive"
	if t.value == "#ffffff" {
		rule:     "no-white"
		severity: "error"
		path:     t.path
		message:  "\(t.path) is white, which this brand does not use"
	},
]
```

- `rule` is lowercase words and dashes. The finding's code is `blazon.cue-rules/<rule>`.
- `severity` is `error`, `warning` or `info`; `path` and `message` are text.
- Do not write a `package` line. The plugin adds one, so that the brand's fields are in scope. `import "list"` and the like may follow.
- Guard an optional field with its own `if`, as above: a token with no `blazon` field would otherwise fail the whole rule. `&&` in one condition evaluates both sides.
- Do not name a field of your own like one of the brand's top-level fields (`tokens`, `findings`, ...). CUE unifies them and the two collide.

`rules.cue` in this folder has two rules and finds nothing in the starter template.

## What it does when it cannot judge

It exits `2` with the reason, and blazon shows `plugin-failed`, never a pass: a brand that is not a version 1 blazon brand, no `options.rules`, rules CUE cannot read (the first lines of CUE's message are shown), no `out`, an item of `out` with a bad `rule`, `severity`, `path` or `message`, no `cue`, a `cue` of another version, or rules that take longer than 20 seconds.

The brand is data. It is written as JSON values, which escape every quote and backslash, so text in a token or a page cannot end a string and add a rule.

## Pin and interpreter

The program starts with `#!/usr/bin/env python3`, so blazon finds `python3` in the directories it trusts and checks them (see the manual, "A pinned script and its interpreter"). `cue` itself is not checked by the pin or by blazon; `BLAZON_CUE` is yours. Rules are code that decides whether a build passes, so keep `rules.cue` in the repository and review changes to it.

## Tests

`test/plugins/examples/cue-rules.test.ts` runs the program, the real commands and the starter rules. It skips, and says so, when `cue` 0.17.1 is not installed; set `BLAZON_REQUIRE_CUE=1` on a machine that installs it, and a missing `cue` then fails the run.
