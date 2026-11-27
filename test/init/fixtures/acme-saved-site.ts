import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../../support/project';

// A made-up Acme site, as a browser's "Save page" leaves it: the page, its stylesheets in a folder next to it, an @import, a Tailwind v4
// `@theme` block in oklch(), and the logo inline in the header. Written by code (not kept as files) so the hooks' data-file guard has
// nothing to map: the tests that read it import this module.

export const ACME_THEME_CSS = `@import "./tokens.css";
@import url("https://fonts.example.test/acme.css");

@theme {
  --color-primary: oklch(0.55 0.2 264);
  --color-accent: oklch(0.8 0.15 160);
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.2 0.02 264);
  --color-gray-100: oklch(0.96 0 0);
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
`;

export const ACME_TOKENS_CSS = `:root {
  --brand-ink: #1e1b4b;
  --brand-secondary: hsl(200 80% 40%);
  --surface-card: white;
}
`;

export const ACME_SITE_CSS = `body { font-family: "Inter", system-ui, sans-serif; font-weight: 400; color: #333333; }
h1, h2 { font-family: "Space Grotesk", sans-serif; font-weight: 700; }
h3 { font-weight: 600; }
a { color: #1d4ed8; }
a:hover { color: #1d4ed8; }
.card { border-radius: 8px; background: #ffffff; border: 1px solid #e5e7eb; }
.button { border-radius: 8px; background-color: var(--color-primary); color: #ffffff; }
.chip { border-radius: 9999px; color: #333333; }
.muted { color: #6b7280; border-color: #e5e7eb; }
`;

export const ACME_LOGO = '<svg viewBox="0 0 40 10"><path fill="currentColor" d="M0 0h40v10H0z"/></svg>';

export const ACME_PAGE = `<!doctype html>
<html><head>
<title>Acme | Rockets for everyone</title>
<meta name="description" content="Acme makes rockets, anvils and portable holes.">
<meta name="theme-color" content="#4338ca">
<link rel="stylesheet" href="./acme_files/theme.css">
<link rel="stylesheet" href="acme_files/site.css">
<link rel="stylesheet" href="https://cdn.example.test/remote.css">
<link rel="stylesheet" href="../outside.css">
<link rel="stylesheet" href="/etc/acme.css">
</head><body>
<header><a href="./">${ACME_LOGO}</a><a href="about.html">About</a></header>
<main><h1>Rockets</h1></main>
</body></html>
`;

/** Writes the saved Acme site into a new temporary folder and returns that folder. */
export function acmeSavedSite(): string {
  const dir = path.join(tempDir(), 'acme-site');
  fs.mkdirSync(path.join(dir, 'acme_files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), ACME_PAGE);
  fs.writeFileSync(path.join(dir, 'acme_files', 'theme.css'), ACME_THEME_CSS);
  fs.writeFileSync(path.join(dir, 'acme_files', 'tokens.css'), ACME_TOKENS_CSS);
  fs.writeFileSync(path.join(dir, 'acme_files', 'site.css'), ACME_SITE_CSS);
  // A file beside the folder: --from-dir must never read it
  fs.writeFileSync(path.join(dir, '..', 'outside.css'), ':root { --brand-primary: #ff0000; }');
  return dir;
}
