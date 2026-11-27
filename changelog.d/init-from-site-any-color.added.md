`blazon init --from` and `--from-dir` read colors in any CSS form (`oklch()`,
`hsl()`, `lab()`, named and the rest, through the core color parser), so a
Tailwind v4 site gives its colors; they also read radius custom properties into
`tokens/form.json` and the body and heading font weights into
`tokens/typography.json`, all marked needs-review. A color's role still comes
only from its custom property's name.
