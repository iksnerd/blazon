# Pages

← [Manual index](index.md)

A page is a Markdown file in `docs/`. Each one is a chapter of the brand book. Blazon sorts them, groups them in the index, and turns the directives in them into live content.

## Front matter

```markdown
---
title: Logotype
order: 2
group: System elements
cover: inverse
description: Our logo is the foundation of our brand identity.
---
```

| Key | Does | If missing |
|---|---|---|
| `title` | The page title | The first H1 in the page, then the file name |
| `order` | Sort position | The number at the start of the file name, then last |
| `group` | The section of the index the page sits in | `Guidelines` |
| `cover` | The color of the opening band: `accent` (the theme's accent), `inverse` (its dark surface) or `canvas` (its subtle background). See [Theme roles](07-theme-and-config.md#theme-roles) | `canvas` |
| `opener` | How the page opens: `full` (a full-height cover with the brand's mark) or `compact` (a short header, so the first screen shows content). The print book opens every chapter with the full cover | `full` for the book's first page, `compact` for the rest |
| `description` | The line under the title | None |
| `section` | The [section](#sections) the page holds: one id, or a list such as `[patterns, 3d]` | None |

Quote a value that contains `: `. Front matter that is not valid YAML is an error (`invalid-frontmatter`), and the page is left out of the book until you fix it.

A number at the start of a file name sets the order, and may have a decimal part: `07.1-photography.md` is order 7.1, so it sorts after `07-illustration.md` and before `08-motion.md`. It gets the slug `photography`. The slug, which is the file name without its number, is the page's address: `#doc/photography`. Keep slugs unique: two pages with one slug share an address.

## Writing the page

- The title is the cover, so do not repeat it as an H1.
- Each H2 starts a section. Its heading sits in the left column and its content on the right.
- A page with four or more sections gets an "On this page" bar under its header: a jump link per H2 that stays under the top bar as you scroll and marks the section you are reading. Text before the first H2 is the page's lead and spans the full width.
- Write token paths in code spans, such as `color.primary.indigo`. Blazon links a span that names a token to that token's page.
- A fenced code block is drawn as a code block with its language in the header and a Copy button. Blazon does not color the syntax. A fence with no language is labelled `text`.
- A table column whose body cells are all numbers is right aligned in tabular figures, its header cell too. A number may carry a sign, a currency sign, grouped digits with a decimal point or comma, and a unit such as `%`, `px`, `ms` or `€`. A column with any other cell, a table with a merged cell and a table with no body rows keep the alignment they have. Decimals line up only when the cells have the same number of decimals.

### Colors written in text

Wherever a color appears as text, blazon draws it as a badge: a pill filled with that color, in black or white by contrast, with a thin edge so a light color keeps an outline.

- A token path in a code span that names a color or gradient token becomes a badge, and stays a link. A path that ends in `.*` names a group and stays a plain link.
- A six- or eight-digit hex code, or an `rgb()` or `rgba()` code, in plain text becomes a badge. So does one in an inline code span: a span that is only a color becomes that color's badge, and in a span with more in it (`blue.500 #3F73F8`, a gradient `#2050C8 → #1B2642`) each color becomes a badge and the rest stays code. One in a code block or a link does not: there it is shown as written.
- The same holds for the text blazon prints with an asset or a token: an asset's description, its traits and its do and don't lines, and a token's value.
- Three-digit hex such as `#123` is not read as a color: it is as likely an issue number.
- In token lists and token cards, the value is a badge. A gradient says its stops, such as `#FF4F40 → #FF44DD`, and its CSS is on hover.

## Directives

A directive is an HTML comment: `<!-- blazon:name argument argument -->`. Arguments are separated by spaces. A token path names one token or a group. A group already includes everything under it, and `color.primary.*` is another way to write `color.primary`. Blazon replaces the comment with live content built from your tokens and assets, so a value is stated once, in the tokens.

A mistake shows in the brand book as a red line such as `No token at color.primary.indgo`, and `blazon check` reports it as `directive-unknown` or `directive-invalid`. A directive shown inside a code fence or inline code is not checked and not run.

| Directive | Shows |
|---|---|
| `<!-- blazon:tokens <path> ... -->` | A card per token: a swatch, a type specimen, or a preview of what it measures. A color card shows its value as a badge |
| `<!-- blazon:section <folder> [name ...] -->` | The folder as a section: each asset with its title, description, traits, dos and don'ts and source from its [sidecar](06-assets-and-icons.md#sidecars), then the category's file rules and what its guidelines leave unspecified. Takes the same arguments as `blazon:assets` |
| `<!-- blazon:assets <folder> [name ...] -->` | The folder's assets as figures, or only the named ones, in the order given. Names that start `do-` or `dont-` get a check or a cross |
| `<!-- blazon:logo-usage -->` | The logo on each background it is made for, except a background the brand forbids the logo on. The light-surface logo stands on whichever of the background and the inverse surface is light, so in a dark theme it moves to the inverse. Needs a `logo` in the config |
| `<!-- blazon:logo-on <path> ... -->` | The logo on each color or gradient token. The variant for dark backgrounds is used wherever white has at least 3:1 contrast, otherwise the one for light backgrounds. A logo whose sidecar states an `ink` is used instead where that ink has at least 3:1 contrast |
| `<!-- blazon:logo-contrast <path> ... -->` | Both logo variants on each color or gradient token, with the contrast ratio of each and a check or a cross at 3:1. A configured logo that is a `logos` asset whose sidecar declares an [`ink`](06-assets-and-icons.md) is judged as that color; one with no declared ink is assumed black for the light variant and white for the dark. A logo asset that declares an ink and is not a configured file gets a row of its own; one that is a configured file is that row, not a second. A variant the background token [forbids](02-tokens.md#forbidden-logo-backgrounds) (`logo.deny`) shows `forbidden` and the brand's reason instead of a check, even when its ratio passes |
| `<!-- blazon:logo-space <folder> [name ...] -->` | Each asset whose [sidecar](06-assets-and-icons.md#sidecars) states a `clearSpace` or `minSize`: the clear space as a hatched band around it, and the artwork again at its minimum size. A logo wider than 320px is drawn smaller, clear space with it, and a `rem` is drawn as 16px |
| `<!-- blazon:logo-lockups <folder> [name ...] -->` | The logos whose [sidecar](06-assets-and-icons.md#sidecars) states a `lockup`, grouped by it (the standard lockups, then any you added), each with its clear space drawn as a band |
| `<!-- blazon:logo-partner <logo> <partner> -->` | The logo and a partner's logo side by side, divided by a vertical line. Both are asset ids written `category/name`. The logo's `partnership` rule sets the gap on each side of the line and the line's height. Both logos stand on one baseline, and the line is centered on the row and 1% of the logo's height thick (1px at least), because guidelines state where the line goes and how tall it is, rarely how thick. The partner is drawn as tall as `partnerHeight`, or as tall as the logo when the rule gives none. A rule with no `dividerHeight` draws no line and puts one gap between the logos |
| `<!-- blazon:logo-initiative <logo> -->` | The logo with the artwork of a program the brand runs, as the program lockup. `<logo>` is an asset id written `category/name`; its `initiative` rule names the mark (another asset), the gap, and whether the mark sits beside the logo on one baseline (the default) or under it with the left edges aligned. The mark is drawn as tall as `markHeight`, or as tall as the logo when the rule gives none |
| `<!-- blazon:logo-placement <logo> [url] -->` | A sample frame for each corner in the logo's `placement`. With a URL, it goes on the opposite side of the same edge, aligned to the logo. The frame, the logo's size in it and the margin are blazon's own: the brand states only the corners |
| `<!-- blazon:icons <folder> [token path ...] -->` | Every icon in the asset folder, painted in each color or gradient token named, or once in the text color when none is |
| `<!-- blazon:icon-set <name> [category ...] -->` | An [icon set](06-assets-and-icons.md#icon-sets) from `iconSets`, every category or the ones named, each collapsed until opened |
| `<!-- blazon:cards <path> ... -->` | A sample card framed in each color or gradient token, using the theme's background, display font, corner radius and inverse color. Its sizes and spacing are blazon's own, because a brand book rarely states them |
| `<!-- blazon:strokes <path> ... -->` | Sample shapes drawn with each `border` token at its real width and color, with rounded caps and joins, on a 250px canvas of blazon's own |
| `<!-- blazon:spots <path> ... -->` | The same shapes on a tile in each color or gradient token. They are stroked with the first `border` token among the paths, or in black or white by contrast when none is named. If that stroke is the same color as a tile's background, the shapes would vanish, so that tile draws them in black or white and prints a line saying so |
| `<!-- blazon:formats <path> ... -->` | A frame per social format, all to one scale, with the safe-area margin dashed, the column grid, the logo and a headline in the display font |
| `<!-- blazon:patterns <path> ... -->` | Each pattern drawn as a tile at actual size. The ink may be a gradient |
| `<!-- blazon:email-signature -->` | A form for a person's name, position, phone and email, and the email signature it makes from the config's [`emailSignature`](07-theme-and-config.md) block: the logo from its URL, the theme's `text` and `muted` colors and `fontBody` family, then the fixed lines. It shows a sample until the form is filled, refuses an address outside `domains` or one with anything but letters, digits and `. _ + ' -` before the `@` (it goes into a `mailto:` link as typed), and copies the signature as formatted text or downloads it as an HTML file. Nothing typed leaves the page. The preview draws the book's own `logo` (the one for a light background), so it looks right before the hosted logo exists; what is copied or downloaded always loads `logoUrl`, and the page says so, and warns when that address does not load. The print book shows the sample, with the book's logo |

`blazon check` rejects a directive that has the wrong number of arguments, a path that names nothing of the type it draws (for example `blazon:strokes` with a path that is not a `border` token), an asset folder or name that does not exist, an unknown icon set or category, or a logo directive when no `logo` is configured.

## How the book reads

The top bar spans the window: the logo over the sidebar, the breadcrumb, then search, the resolver's contexts and the light and dark switch. The sidebar is open from 1024 px wide and is a drawer under a menu button below that. Its groups open and close from their labels, and the choice is remembered for the reader in the browser; **Expand all** and **Collapse all**, above the list, act on every group at once (the label offers the one that changes something). On a phone the contexts are in the drawer, because the top bar has no room for them.

A page opens with a short header, so the first screen shows content, unless its front matter says `opener: full` (the book's first page does by default; [front matter](#front-matter)). A page with four or more sections gets an "On this page" list that marks the section being read: a column at the right from 1280 px wide, a bar under the top bar below that. The print book has neither: it opens every chapter with the full cover and is cut into slides from one flow.

## Sections

A brand book has standard parts: the introduction, the logo, color, typography, and so on. A page says which of them it holds with `section` in its front matter:

```markdown
---
title: Patterns
section: [patterns, 3d]
---
```

The standard sections are these fourteen: `intro`, `logo`, `color`, `typography`, `icons`, `illustration`, `photography`, `patterns`, `3d`, `diagrams`, `motion`, `layout`, `social` and `applications`. Add your own, such as a voice and tone section, with `customSections` in `blazon.config.ts` (the starter has one: `docs/11-voice.md`) ([adding your own names](07-theme-and-config.md#adding-your-own-names)). A page may hold one section, or several as a list. A name that is not a section of this brand book is an error (`section-invalid`), so a misspelling is caught.

Once any page declares a section, `blazon check` notes each expected section that no page holds (`section-missing`, a note: it never fails a check). That is how you see what a brand book still lacks, and why `blazon check` is useful on a new brand. A brand that does not want a section lists the ones it expects in `sections` in `blazon.config.ts` ([chapter 7](07-theme-and-config.md)). A project where no page declares a section and `sections` is not set gets no such notes.

To build the body of a section from data, use [`blazon:section`](#directives): it draws a category's assets with the titles, traits, dos and don'ts that their [sidecars](06-assets-and-icons.md#sidecars) state, so every brand's sections are made the same way and the Markdown holds only the page's own words.
