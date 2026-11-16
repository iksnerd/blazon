# Security policy

## Supported versions

Blazon is 0.x. Only the latest minor version gets fixes (for example, 0.3.x when 0.3 is the newest), because a brand pins one blazon and moves the pin to take a fix ([stability](docs/manual/18-stability.md)). Today that is 0.1.x, published on npm as `@iksnerd/blazon`. A fix that is not released yet is on `main`.

## Reporting a vulnerability

Please do not open a public issue.

Report it privately through GitHub: <https://github.com/iksnerd/blazon/security/advisories/new>. Include what you found, the steps to reproduce it and what an attacker could do with it.

If you cannot use that page, email <me@iksnerd.xyz> and say only that you have a security report, with no details, and ask for a private channel.

## What to expect

Expect an acknowledgement within a few days, best effort and not a guarantee. A fix goes into `main`, and into a release once releases exist, and the advisory credits you unless you ask it not to.

## What counts

Blazon reads a brand's `blazon.json` as data and never runs it, but it starts the plugins that file names as child processes with the permissions of whoever runs blazon. Every path it names (`tokensDir`, `docsDir`, `assetsDir`, `resolver`, `outDir`, `tokensOutDir`, the logo files) must stay inside the project folder, links included, so a brand cannot make blazon read or empty a folder elsewhere (`config-path-outside`); only an asset category's `dir` may name a shared folder, and only when the person running blazon approved that folder with `--allow-dir <folder>` or `BLAZON_ALLOW_DIRS` (the brand cannot: `blazon.json` has no key for it), and then only its image files are read, never through a link that leaves it. Plugins are never given `BLAZON_ALLOW_DIRS`. An icon set's `package` is a package name looked up in `node_modules`, never a path. `blazon dev` and `blazon preview` listen on this machine only unless `--host` says otherwise, refuse a foreign `Host` header (DNS rebinding), send no CORS header and have no endpoint that writes; both answer 404 on Vite's `/__open-in-editor` route, which would make a running editor open a local path for any web page that can reach localhost; the dev server reads files over `/@fs/` only from the viewer's own folder (`server.fs.allow` is set to it, with `strict` on), so neither the brand's files nor a folder above an installed blazon is reachable that way, and `blazon preview` refuses a link in the built site that leaves it. `blazon build -o` is the operator's own choice and is not limited. Running blazon on a project you do not trust is outside the threat model. See [RFC 0002](docs/rfc/0002-extension-model.md) for what plugin pinning does and does not defend against.

In scope: a way for untrusted input to make blazon do more than that model allows, for example a token file, Markdown page, asset, config path or plugin answer that reads or writes outside the project or the output folder, runs a program that was not configured, or bypasses a pin. A bug in a plugin you wrote or installed is for that plugin's author.
