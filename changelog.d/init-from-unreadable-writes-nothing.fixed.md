`blazon init --from <url>` reads the page and its stylesheets before it copies
anything. A page the fetch rules refuse (a private address, a scheme, a redirect,
a content type, the size or time limit, a body that ends early), or one that
answers with an error or not at all, now leaves nothing behind and exits 2 with
the reason, as `--from-dir` does. Before, the starter was already copied.
