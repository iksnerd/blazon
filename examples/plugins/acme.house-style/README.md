# acme.house-style

A reference plugin for blazon: a `check` that headings (`type.heading`, `type.h1` to `type.h6`) are set in the font your brand names. It is one Python file with no dependency, to show what a plugin is. Blazon's plugin protocol is JSON on standard input and output, so a plugin can be written in any language.

```bash
# Check that it follows the protocol
blazon plugin check examples/plugins/acme.house-style/blazon-acme.house-style

# Pin it, so blazon will run it: a check plugin must be pinned
blazon plugin pin examples/plugins/acme.house-style --name acme.house-style
```

Then allow it in `blazon.json`, and say which font:

```json
{
  "plugins": [ { "name": "acme.house-style", "options": { "headingFont": "Inter" } } ]
}
```

`blazon check` now fails with `type.heading is set in -apple-system, not Inter` until the heading style uses `Inter`.

It answers `exit 2` with a reason, and not `0`, when it cannot judge: a request of another version, a brand that is not a version 2 blazon brand, or no `headingFont`. Read the manual's chapter on plugins for what blazon promises a plugin and what it expects back.

Needs `python3`. When the plugin is pinned, blazon finds it in `/usr/local/bin`, `/usr/bin` or `/bin` (and in `BLAZON_PLUGIN_PATH`) and refuses one that others can write; on a Mac that is `/usr/bin/python3`, and Homebrew's `/opt/homebrew/bin/python3` is refused until its directories are closed to group and others (see the manual, "A pinned script and its interpreter").
