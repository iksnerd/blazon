# Derive your own brand

← [Manual index](index.md)

This chapter walks one realistic job: a company has brand guidelines in a PDF or a slide deck, and wants them as tokens, rules and a brand book in its own repository. The worked example is a real company's guidelines deck encoded in blazon, with logo variants, icons and a theme. It is the reference this chapter was written against. It is not shipped in this repository, because the deck's text and art belong to its owner; the steps below do not need it.

## The steps

1. **Create the project.** Run `blazon init acme-brand` and `blazon dev acme-brand`. You now have a working brand book that is blazon's own: its logo, type, colors and pages, which you replace one by one. `blazon check` lists what is still blazon's. To start from a company's live site instead, add `--from https://acme.com` ([chapter 1](01-getting-started.md#starting-from-a-live-site)).
2. **Collect the facts from the source.** For a PowerPoint deck, `uv run scripts/extract-deck.py deck.pptx --pretty > deck.json` (`uv` is a Python runner, <https://docs.astral.sh/uv/>) lists each slide's fills, lines, corner radii and text runs (font, size and color, with inherited values resolved), and an index of every color with the slides it appears on. The index also reports swatches whose label names a different color than the one drawn. In a deck with labelled swatches it lists each one whose label names a different color than the one drawn. Turning a deck into tokens stays a manual, reviewed step: the script reads the deck as data, but you decide what each value means. The script reads PowerPoint only. For a PDF or a Figma file, read the values by hand or with your own tooling: blazon has no importer. Blazon does read DTCG 2025.10 files, so JSON exported by any tool in that format can be placed in `tokens/`, and blazon keeps the `$extensions` it does not know.
3. **Write the primitives.** Put the raw palette, the type families and the sizes in `tokens/`. Add `source` with the slide to each, so a reviewer can trace a value, and `print` (CMYK, Pantone and RAL) where the guidelines give them. Mark any value you doubt with `review`: it becomes a warning, and it shows on the Review page.
4. **Write the roles.** Add the semantic tokens, such as `text.primary` and `interactive.primary`, as aliases of the primitives. `tier` says which is which.
5. **State the rules.** Where the guidelines say "never use this color for text", write `usage.deny`. Where they state a contrast, write a `pairs` rule. Where they give proportions such as 60/30/10, write `proportion`. These are what `blazon check` enforces; see [Checks](03-checks.md).
6. **Add the logo.** Put the files in `assets/logos/`, give each a sidecar with `background`, `clearSpace` and `minSize`, and set `logo` in `blazon.config.ts`. Give `onDark` as well as `onLight` if the brand has dark or colored backgrounds.
7. **Map the theme.** Set `theme` so the brand book looks like the brand, or name your tokens the conventional way and let blazon infer it ([Theme and configuration](07-theme-and-config.md#when-there-is-no-theme)).
8. **Write the pages.** Follow the structure of the reference: intro, logotype, colors, typography, icons, layout. Write the prose, and use [directives](05-pages.md#directives) for everything that is a value, so each value lives in one place.
9. **Check and build.** Run `blazon check` and fix the errors, then `blazon build`, and publish `dist/site/`. Add `blazon check --strict` to CI.

## What blazon draws, and what stays an image

Blazon draws what a brand states as values. It cannot draw art direction.

| Draws it from your tokens and assets | Stays an image, shown with `blazon:assets` |
|---|---|
| Colors, gradients, contrast and proportions | Photography and its art direction |
| Type families and the whole type scale | Pattern artwork that is not geometric, and 3D patterns |
| Logo on each background, logo contrast, clear space and minimum size | Illustrations |
| Icons from your assets, and whole icon packages by category | Diagrams and motion |
| Radii, strokes and spot backgrounds | Logo lockups, partnership and placement layouts |
| Geometric patterns: dots, lines, diagonal, grid, checks | |
| Social formats with their safe area and columns | |

Blazon writes a brand book, which is a site and code. It does not export slides.

## Check your result against the reference

A finished brand has about fourteen guideline pages, one per standard section. The starter you began from is a smaller brand written from scratch, [`examples/blazon/`](../../examples/blazon/): 79 tokens, a light and a dark theme, and twelve pages (principles, logo, color, type, form, layout, icons, diagrams, social, applications, voice and web), which shows how little a first version needs.
