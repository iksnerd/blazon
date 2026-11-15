# Security policy

## Supported versions

Blazon is pre-release (0.x) and not published yet. Until there is a release, only the latest commit on `main` gets fixes. Once there are releases, only the latest minor version does (for example, 0.3.x when 0.3 is the newest), because a brand pins one blazon and moves the pin to take a fix ([stability](docs/manual/18-stability.md)).

## Reporting a vulnerability

Please do not open a public issue.

Report it privately through GitHub: <https://github.com/iksnerd/blazon/security/advisories/new>. Include what you found, the steps to reproduce it and what an attacker could do with it.

GitHub's private vulnerability reporting is for public repositories. While this repository is private, that page is open only to people with access to it, so an outside reporter cannot use it. If you cannot reach it, open an issue that says only that you have a security report and asks for a private channel, with no details.

## What to expect

Expect an acknowledgement within a few days, best effort and not a guarantee. A fix goes into `main`, and into a release once releases exist, and the advisory credits you unless you ask it not to.

## What counts

Blazon reads a brand's `blazon.json` as data and never runs it, but it starts the plugins that file names as child processes with the permissions of whoever runs blazon. Every path it names (`tokensDir`, `docsDir`, `assetsDir`, `resolver`, `outDir`, `tokensOutDir`, the logo files) must stay inside the project folder, links included, so a brand cannot make blazon read or empty a folder elsewhere (`config-path-outside`); only an asset category's `dir` may name a shared folder, and only its image files are read. An icon set's `package` is a package name looked up in `node_modules`, never a path. `blazon dev` and `blazon preview` listen on this machine only unless `--host` says otherwise, refuse a foreign `Host` header (DNS rebinding), send no CORS header and have no endpoint that writes; the dev server serves files outside the project only through Vite's allow list, and `blazon preview` refuses a link in the built site that leaves it. `blazon build -o` is the operator's own choice and is not limited. Running blazon on a project you do not trust is outside the threat model. See [RFC 0002](docs/rfc/0002-extension-model.md) for what plugin pinning does and does not defend against.

In scope: a way for untrusted input to make blazon do more than that model allows, for example a token file, Markdown page, asset, config path or plugin answer that reads or writes outside the project or the output folder, runs a program that was not configured, or bypasses a pin. A bug in a plugin you wrote or installed is for that plugin's author.
