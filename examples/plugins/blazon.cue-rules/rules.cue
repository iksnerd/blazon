import "list"
// Starter rules for the blazon.cue-rules plugin. The brand's brand.json is in scope: `tokens`, `brand`, `pages`, and the
// rest. Define `out`, a list of findings; each has a rule (lowercase words and dashes), a severity (error, warning or
// info), a path and a message. Copy this file next to blazon.config.ts and change it.

// Every semantic color points at a primitive, so a change to the palette reaches every use.
out: [
	for t in tokens
	if t.type == "color"
	if t.blazon != _|_
	if t.blazon.tier == "semantic"
	if t.aliasOf == _|_ {
		rule:     "semantic-not-alias"
		severity: "warning"
		path:     t.path
		message:  "\(t.path) is a raw value; point it at a primitive color so the palette stays in one place"
	},

	// A font stack ends in a generic family, so text still renders when the brand font does not load.
	for t in tokens
	if t.type == "fontFamily"
	if !list.Contains(generic, t.resolvedValue[len(t.resolvedValue)-1]) {
		rule:     "font-family-no-generic"
		severity: "warning"
		path:     t.path
		message:  "\(t.path) does not end in a generic family such as sans-serif or monospace"
	},
]

generic: ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded"]
