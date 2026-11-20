`blazon init --from <url>` reads a font name written with a CSS escape (`"Acme \"Sans\""`, `Acme\ Sans`) and keeps a
`var(--x, "A, B")` fallback in one piece, instead of cutting the font list at the wrong comma.
