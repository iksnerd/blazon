`blazon init --from-dir <folder>` reads a saved copy of a site offline, the
same way `--from` reads a live one: the page (`index.html` or the one named),
its stylesheets and their `@import`s, by relative path. Nothing outside the
folder is read: a URL, an absolute path, `..` and a link that leads out are
skipped, each with its reason in the output.
