# Theme and configuration

← [Manual index](index.md)

`blazon.json` is optional. Without it, blazon uses the defaults below.

```json
{
  "title": "Acme Brand Book",
  "theme": { "accent": "brand.primary", "text": "text.primary", "fontDisplay": "font.family.sans" },
  "logo": { "onLight": "./assets/logos/logo-black.svg", "onDark": "./assets/logos/logo-white.svg" },
  "fonts": [ "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" ]
}
```

`blazon.json` is the only config file, and it is plain JSON: data that blazon reads and never runs, with no comments and no trailing commas. A person can read it and a tool can write it. Older blazons read the config as code from `blazon.config.ts`, `blazon.config.js`, `blazon.config.mjs`, `brandbook.config.ts` or `brandbook.config.js`. None of those is read any more: a folder that holds one stops every command with an error that names the file and says to move its values into `blazon.json` and delete it. If `blazon.json` does not parse, the command stops with `Could not load blazon.json: ...` and exits with status 1; blazon does not carry on with defaults (see [When the config is wrong](#when-the-config-is-wrong)).

## Every option

| Key | Default | Does |
|---|---|---|
| `title` | `<package.json name> Brand Book`, else `Blazon Brand Book` | The brand book's title |
| `description` | `Design tokens and brand guidelines` | A tagline |
| `tokensDir` | `./tokens` | Where the token files are. It must be inside the project folder, as `docsDir`, `assetsDir`, `resolver`, `outDir`, `tokensOutDir` and the `logo` files must: a path or a link that leaves it is the [`config-path-outside`](03-checks.md) error, and nothing is read from it or written to it. `blazon build -o` is the one way to put the site elsewhere. A category's `dir` may name a shared folder only when the person running blazon approves it with `--allow-dir <folder>` or `BLAZON_ALLOW_DIRS`: the config cannot approve a folder, see [An extra folder](06-assets-and-icons.md#an-extra-folder) |
| `docsDir` | `./docs` | Where the pages are |
| `assetsDir` | `./assets` | Where the assets are |
| `outDir` | `./dist/site` | Where `blazon build` writes the site. A folder that is or holds the project, the tokens, the docs or the assets, such as `.` or `docs`, is refused, because blazon empties it first, and so is one inside them, which the next build would read as part of the brand ([`output-dirs-overlap`](03-checks.md)). `blazon build -o` wins over it. It may hold `tokensOutDir`: the site is emptied first, then the tokens are written |
| `tokensOutDir` | `./dist/tokens` | Where the code outputs go. It may sit inside `outDir`, but not be it or hold it, and not sit inside `tokensDir`, `docsDir` or `assetsDir` ([`output-dirs-overlap`](03-checks.md)) |
| `cssPrefix` | `--` | The start of every CSS variable name |
| `cssSelector` | `:root` | The selector the default context's variables sit under |
| `port` | `3000` | The dev server port. `blazon dev -p` wins over it |
| `logo` | required | The logo: one path, or `{ onLight, onDark }`. SVG or raster, relative to the project. A brand without one fails `blazon check` with `logo-missing` |
| `theme` | inferred, see below | Theme role to token path |
| `shadcn` | none | A [shadcn/ui](https://ui.shadcn.com) variable name, without the dashes (`destructive`, `chart-1`, `ring`), to a token path. It fills what the theme roles do not give, and wins over a role that does. A name shadcn does not have is a config error, and a path that is not a token is `theme-unresolved`. `brand.json` states the result: [chapter 19](19-building-a-website.md#using-shadcnui) |
| `iconSets` | none | Icon packages to preview: [chapter 6](06-assets-and-icons.md#icon-sets) |
| `sections` | all sections | The [sections](05-pages.md#sections) this brand expects a page for, standard or your own: `sections: ['logo', 'color', 'voice']`. `blazon check` notes each one no page holds. Leave a section out when the brand has none, such as `motion` |
| `plugins` | none | The plugins that may run, by name: `[{ name: 'acme.house-style', options: { headingFont: 'Inter' } }]`. The config holds no path and no command; a plugin is found by its name or [pinned](12-plugins.md) in `blazon.plugins.lock`. `options` is passed to the plugin in every request. `env` is the list of environment variables the plugin may be given, besides `PATH`: it gets one only when its manifest lists the name and this list approves it, and a listed, set, unapproved name stops the plugin with a message that names the variable and `plugins[n].env`. An entry that is a bare string (`plugins: ['blazon.favicons']`) is refused; the message gives the shape, lists the plugins blazon ships and offers the near one |
| `customSections` | none | Sections of your own: `[{ id: 'voice', title: 'Voice and tone' }]`. [Adding your own names](#adding-your-own-names) |
| `vocabulary` | none | Logo lockups and usage roles of your own: `{ lockups: ['monogram'], usageRoles: ['chart'] }`. [Adding your own names](#adding-your-own-names) |
| `assets` | none | Settings for asset categories: a label, order, description, an extra folder and rules for each. [Chapter 6](06-assets-and-icons.md#asset-categories) |
| `fonts` | none | What the brand book loads: stylesheet URLs, such as Google Fonts, and font files of the project, `{ family: 'Mulish', file: 'fonts/Mulish.woff2' }` |
| `resolver` | `blazon.resolver.json` when present | The [resolver document](04-contexts.md) |
| `contextSelectors` | `:lang({context})` for `locale`, `[data-<modifier>="{context}"]` otherwise | The CSS selector per modifier |
| `emailSignature` | none | What the [`blazon:email-signature`](05-pages.md#directives) form puts in every signature: `{ logoUrl, logoSize: { width, height }, logoAlt, domains?, lines? }`. `logoUrl` is an absolute https URL of a PNG, GIF or JPG, because Gmail and Outlook show no SVG and no embedded image, and because a mail app draws the logo when the email is opened, from an address: a file on your computer does not exist for the reader, so the logo has to be hosted where anyone can fetch it (the book's own `logo` is only what the form's preview shows, so it looks right before that); give a file twice `logoSize` for sharp screens. `domains` limits the addresses the form accepts. `lines` are fixed text under the contact details, such as a company line and a legal notice. Mail apps keep only hex or `rgb()` colors, so the theme's `text` and `muted` should be one of those |

## Theme roles

The brand book looks like the brand it documents. Each theme role takes its value from one of your tokens.

| Role | Is | Token type |
|---|---|---|
| `background` | Page and card background | color |
| `canvas` | A subtler surface, such as the page behind cards | color |
| `text` | Body text | color |
| `muted` | Secondary text | color |
| `border` | Lines and outlines | color |
| `accent` | The brand color, for links and the accent cover | color |
| `accentText` | Text on the accent | color |
| `inverse` | The dark surface, for the inverse cover and dark mode | color |
| `inverseText` | Text on the inverse surface | color |
| `fontDisplay` | The typeface of titles | fontFamily |
| `fontBody` | The typeface of body text | fontFamily |
| `radius` | The corner radius of the viewer's own cards, inputs and menus | dimension |

A role that points at a token that does not exist is an error (`theme-unresolved`). A role you leave out takes blazon's neutral default: white, black and grey with an indigo-blue accent.

The brand book has a light and a dark mode, switched at the right of the top bar. Dark mode uses your `inverse` as the background and `inverseText` as the text.

When the resolver has a modifier named `theme` with a `light` and a `dark` context ([chapter 4](04-contexts.md)), the same switch picks that context, so the brand's own dark tokens show whenever the book is dark, and the modifier gets no select of its own. The roles are then already the dark values, so dark mode is painted from `background` and `text` as that context sets them, and not from `inverse`: a dark context that changes the `inverse` token cannot turn the page light.

### When there is no `theme`

With no `theme` entry at all, blazon takes each role from the first token with a conventional name and the right type. `blazon check` prints a note saying which (`theme-inferred`), or that nothing matched and the book uses neutral colors (`theme-missing`). Any `theme` entry turns inference off, for every role.

| Role | Looks for, in order |
|---|---|
| `background` | `surface.background`, `surface.base`, `surface.default` |
| `canvas` | `surface.subtle`, `surface.canvas`, `surface.muted` |
| `text` | `text.primary`, `text.default`, `text.base` |
| `muted` | `text.muted`, `text.secondary`, `text.subtle` |
| `border` | `border.default`, `border.base`, `border.subtle` |
| `accent` | `interactive.primary`, `brand.primary`, `color.primary`, `color.accent` |
| `accentText` | `text.inverse`, `text.onAccent`, `text.onPrimary` |
| `inverse` | `surface.inverse`, `color.inverse` |
| `inverseText` | `text.inverse`, `text.onInverse` |
| `fontDisplay` | `font.family.display`, `font.family.heading`, `font.family.sans` |
| `fontBody` | `font.family.body`, `font.family.sans`, `font.family.base` |
| `radius` | `radius.default`, `radius.base`, `radius.md` |

Set `theme` yourself when your names differ, or when you want to choose, for example, which neutral is the page background.

## Logo and fonts

`logo` is one file, or a file per background: `onLight` for light backgrounds and `onDark` for dark ones. The brand book picks the variant by whether the background is dark. It judges that from your theme: text paired with the background that is light means a dark background, and so does a background that white reads well on. This applies to the accent and inverse covers and to the page in dark mode.

**With only `onLight`, a dark background shows no logo.** Give `onDark` too when the brand has a dark or colored cover or a dark mode.

`fonts` lists what the brand book loads, in two forms that mix in one list:

```json
{
  "fonts": [
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
    { "family": "Mulish", "file": "fonts/Mulish.woff2", "weight": "200 1000" }
  ]
}
```

A string is a stylesheet URL, such as the Google Fonts link for the families your tokens name. The brand book loads it for every visitor, from the URL you give. An object is a font file in the project (`.woff2`, `.woff`, `.ttf` or `.otf`, with a path from the project root, and the file must be inside the project folder, links included): blazon reads it and embeds it as an `@font-face` of that `family`, with the `weight` (a number from 1 to 1000, `normal`, `bold`, or a range such as `'200 1000'` for a variable font) and `style` you give, so the book, its print version and `blazon build` need no stylesheet made by hand and no server for the file. The font is part of the book's page, so list only files whose license lets you publish them. A file that is missing, or is not one of those formats, is a `font-file-invalid` error. A font blazon does not embed, and a stylesheet at a URL of your own, are what you host and list as a URL. A site that serves the file itself gets its `@font-face` from `blazon fonts --css` ([chapter 8](08-using-the-outputs.md), [chapter 19](19-building-a-website.md#fonts)) instead of writing it.

A tool that needs a file `fonts` does not list, such as a TTF for `next/og` (Satori) when the book embeds the woff2, can keep that file in the brand's `fonts/` folder. Blazon ignores a file there that no entry names: it is not embedded, not checked, not printed by `blazon fonts` and not copied by a build. Its license is yours to check, as it is for a listed file.

Loading is checked. When `fonts` lists anything and a token names a family first that no entry loads, `blazon check` warns `font-family-missing`: the book falls back to the next font of the stack, and so does a PDF made from it. List the font, or set `webFont` on the token if it cannot be loaded. The check knows the families of a font file and of a Google Fonts URL, not of a stylesheet at another URL, and stays quiet while one is listed.

Where a typeface comes from and under what license is not in `fonts`, which says what to load, but on the typeface token, as `font`: `"$extensions": { "dev.blazon": { "font": { "source": "Kinto Type Foundry", "license": "OFL-1.1", "licenseUrl": "https://openfontlicense.org/" } } }` (see [Extensions](02-tokens.md)). Listing a font file in `fonts` is also what lets `blazon.press-kit` set its PDF in that font, and the file then goes into the PDF as the page's font. It is your statement that the license allows embedding: blazon does not read `license` to decide, so list only files you may embed.

## Adding your own names

Three lists of names are checked, so a misspelling is an error and not a silent miss: the sections a page may hold, the logo lockups a sidecar may state, and the usage roles a token may allow or deny. Each has a standard list that is always valid, and you add your own next to it. These are plain lists in `blazon.json`.

```json
{
  "customSections": [ { "id": "voice", "title": "Voice and tone" } ],
  "vocabulary": { "lockups": [ "monogram" ], "usageRoles": [ "chart" ] }
}
```

| You add | Where it is then valid |
|---|---|
| a section, `{ id, title }` | `section: voice` in a page's front matter, and in the `sections` list |
| a lockup | `"lockup": "monogram"` in a logo's [sidecar](06-assets-and-icons.md#sidecars). `blazon:logo-lockups` shows a group for it |
| a usage role | `role` and `usage.allow` / `usage.deny` in a token's [`dev.blazon` extension](02-tokens.md#the-devblazon-extension) |

A name is lowercase letters, digits and hyphens, and starts with a letter. A name may not repeat a standard one or another you added: that is a `config-invalid` error on the name, and the name is left out while the rest are kept. You can add names but not remove standard ones. A brand with no motion section narrows what `blazon check` expects with `sections` instead.

The logo corners, the pattern kinds, the theme roles and the token tiers stay fixed, because blazon draws or reads each one. `brand.json` lists your additions under `vocabulary` and `sections`, so a tool that reads it learns your custom section titles without blazon ([chapter 11](11-brand-json.md)).

## When the config is wrong

Blazon checks `blazon.json` before it uses it. Every command stops, and exits with status 1, when the config has:

- **A key blazon does not know.** The message names the key blazon is closest to: `asset: unknown key "asset"; known: title, description, ... (did you mean "assets"?)`.
- **A value of the wrong type.** For example `port: '3000'` (it must be a number from 0 to 65535), or a `logo` with no `onLight`.
- **A file that is not JSON.** A syntax error, a comment, a trailing comma, or a value that is not an object: `Could not load blazon.json: ...`.
- **An old config file.** `blazon.config.ts`, `.js` or `.mjs`, or `brandbook.config.ts` or `.js`, is `config-invalid` on that file, even beside a `blazon.json`: `blazon.config.ts is not read any more: blazon reads plain JSON from blazon.json. Move its values into blazon.json and delete blazon.config.ts`.

The message lists every mistake at once. Blazon does not carry on with defaults: a brand book built that way would have the wrong title and no theme or logo and look fine. While `blazon dev` runs, a config that is wrong half-way through an edit is reported in the terminal and the last good config stays in use.
