`init --from` and `--from-dir` no longer import a site's SVG logo that holds a
script, a `foreignObject`, an iframe, embed or object, an event handler
attribute (quoted or not), an animation of `href`, an `href` or `src` that is
not `#id`, or a `javascript:`, `data:` or remote URL (entity-encoded, or in
`style`, a `<style>` sheet or an `@import`), or that is not well-formed XML.
Before, a pattern edit let such content through. Init keeps its placeholder
logo, says why on one line and records the reason as `refused` in
`extract.json`.
