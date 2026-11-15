# Security policy

## Supported versions

Blazon is pre-release (0.x). Only the latest commit on `main` gets fixes.

## Reporting a vulnerability

Please do not open a public issue.

Report it privately through GitHub: <https://github.com/iksnerd/blazon/security/advisories/new>.

Include what you found, the steps to reproduce it and what an attacker could do with it.

## What counts

Blazon runs a brand's `blazon.config.ts` as code, and starts plugins as child processes with the permissions of whoever runs blazon. Running blazon on a project you do not trust is outside the threat model. See [RFC 0002](docs/rfc/0002-extension-model.md) for what plugin pinning does and does not defend against.
