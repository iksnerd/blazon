# blazon.press-kit

The plugin blazon ships to pack what an outsider needs from a brand: the logos that are ready to share, the colors, the fonts, the boilerplate, the contact, the terms of use, a web page and a one-page PDF, in one folder and one zip. It fills the `build` role. Everything but the PDF needs only Node; the PDF needs a Chrome (`BLAZON_CHROME` names one, else the Google Chrome installed on the computer), and without one the plugin writes the rest and says so in a finding.

The source is `src/shipped/press-kit/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.press-kit.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` and `pdf-lib` from `node_modules` when it runs; that is outside the pin. The zip writer is `src/shipped/shared/zip.ts`, which `blazon.office-template` uses too. The manual's plugins chapter says what to put in the config, what the plugin writes and what each finding means.

## What goes in the kit

| Part | From the brand |
|---|---|
| `logos/` | Assets that are logos (the `logos` category, or the files `logo.onLight` and `logo.onDark` name), as they are, in a folder for each background their sidecars name |
| `colors/` | The color tokens that are not aliases, as JSON, CSS and text; CMYK, Pantone and RAL only where a token states them |
| `fonts.txt` | The brand's fonts: the front family of `fontDisplay`, `fontBody` and each font token, and the families the font stylesheets load, unless it is a system font nothing loads (then it is a fallback); the source and license only where a font token states them (its `font` extension) or the data has them, else the license file blazon found beside the family's font files (`License file:` with its path), else `not stated`. The fallbacks are one last line, `Fallback fonts, not shipped` |
| `index.html` | The whole kit as one static page for a browser, at the root of the folder and the zip: inline CSS, no script, no remote font or image, the logos by relative paths, every brand text escaped. Sections, only those with data: name and description, About, Facts, Contact, Logos (with the rules the sidecars state), Colors, Fonts, Terms of use, Note. Always written; it has no option |
| `about.txt` | `brand.title`, then the `company` option's description, else `brand.description` (without either, a line saying none is set), then the company's boilerplate, facts and contact, the `terms` and the `note` |
| `press-kit.pdf` | The title, the description (the company's when the option gives one), the boilerplate, the facts, the contact, a short block of the terms, the note, up to ten colors and one logo, drawn in Chrome |

A logo marked `needs-review`, and a generated logo with no `review`, are left out, with a finding for each. A color token marked `needs-review` is left out too, unless the `unreviewed` option is `true`, which includes it labelled as unreviewed.

## Options

Every option is plain data in the plugin's `options` in `blazon.json`. A wrong one is an `option-invalid` finding at `options.<key>` that names the key; it is left at its default and the rest of the kit is written. An unknown key, a wrong type, an empty or blank text, a text over its limit and a list over its limit are all wrong.

| Option | Type | Default | Does |
|---|---|---|---|
| `name` | string | `press-kit` | Folder, zip and PDF name, without an extension: letters, digits, dots, hyphens and underscores, up to 64 characters |
| `pdf` | boolean | `true` | `false` writes no PDF and needs no browser |
| `unreviewed` | boolean | `false` | `true` includes the colors marked `needs-review`, labelled as unreviewed |
| `logos` | list of asset ids | every logo | The logos to include; one that is not ready stays out |
| `company` | object | none | The company behind the brand, for a brand whose own title and description are a book's. Keys: `description`, `boilerplate`, `facts`, `contact` |
| `company.description` | string, up to 1000 characters | none | Replaces `brand.description` in `about.txt` and the PDF when given |
| `company.boilerplate` | string, up to 2000 characters | none | One text printed after the description in `about.txt` and the PDF; blank lines make paragraphs |
| `company.facts` | list of up to 20 `{ "label", "value" }` | none | Labelled lines in the order given, such as the legal name and the registration number. A label is up to 60 characters and a value up to 300, each on one line |
| `company.contact` | object | none | Who a journalist writes to. Keys, all optional but at least one: `name` and `role` (up to 80 characters), `email` (one `@`, no spaces, up to 120), `phone` (up to 40), `url` (http or https, up to 300); each on one line. Printed as a `Contact:` block in `about.txt`, and in the PDF and `index.html` |
| `terms` | object | none | What a recipient may do with the logos, in the brand's own words: blazon writes no template. Keys, at least one: `text` (up to 1000 characters, may span lines) and `url` (http or https, up to 300). Printed as `Terms of use:` in `about.txt`, as `Terms of use: see about.txt` in `README.txt`, and in the PDF and `index.html` |
| `note` | string, up to 280 characters, one line | none | Printed as `Note: ...` in `README.txt`, `about.txt`, `colors/colors.txt` and the PDF, such as that the colors are not yet approved |

With no `company.contact` and no `terms` the files are the bytes they were before, apart from the new `index.html` (and its line in `README.txt`) and the fixes in the next section.

```json
{
  "plugins": [
    {
      "name": "blazon.press-kit",
      "env": ["BLAZON_CHROME", "HOME", "TMPDIR"],
      "options": {
        "name": "acme-press-kit",
        "company": {
          "description": "Acme builds payment tools for teams that move money across borders.",
          "boilerplate": "Acme Ltd is a licensed payment institution. Press enquiries: press@acme.example.",
          "facts": [
            { "label": "Legal name", "value": "Acme Ltd" },
            { "label": "Registered address", "value": "1 Example Street, London" },
            { "label": "Registration number", "value": "01234567" }
          ],
          "contact": { "name": "Ada Example", "role": "Head of press", "email": "press@acme.example", "phone": "+44 20 7946 0000", "url": "https://acme.example/press" }
        },
        "terms": {
          "text": "Use the logos as supplied, on the backgrounds they are made for.\nDo not recolor, stretch or redraw them.\nAsk before using them in advertising.",
          "url": "https://acme.example/terms"
        },
        "note": "The colours are proposed and not yet approved."
      }
    }
  ]
}
```

That entry was run on `examples/blazon`; `about.txt` then reads the company description, the boilerplate, the three facts, a `Contact:` block, a `Terms of use:` block and `Note: The colours are proposed and not yet approved.`, each in its own paragraph, and `index.html` shows the same in a browser.

## Fonts and swatches

- A family is a brand font when it is at the front of a font stack and is not a system font, or when a stylesheet or font file of the brand loads it, or when its font token states a source or license. The same families blazon treats as system fonts everywhere (`blazon fonts`) are fallbacks, and so is every family after the first in a stack. They are not listed as fonts with `License: not stated`; `fonts.txt` ends with one line, `Fallback fonts, not shipped: ...`. A stack with no brand font writes no `fonts.txt`.
- The license comes from the font token (`license`, `licenseUrl`, `source` of its `dev.blazon` `font`), then from the license file beside the family's font files (`OFL.txt`, `LICENSE`, `LICENCE`, `COPYING`), which blazon reads into `brand.json` as `theme.fontLicenses`: the plugin is given the brand and the built site, not the project folder, so it never opens the file itself. It prints `License file:` with the project path and, as `License:`, an `SPDX-License-Identifier:` line or the first short line that is not a copyright notice (`see <path>` when none). The kit copies no font and no license text.
- The PDF draws up to ten colors. A color belongs to the group named by the path before its last segment (`color.blue.500` is step `500` of `color.blue`). Groups run in the order their first color appears in the brand, each group's steps together, a group goes in whole, and the walk stops at the first group that does not fit in the places left (the first group alone is cut at ten). A swatch reads `blue 500`; a color straight under `color` keeps its short description, else its last segment.
- `README.txt` aligns its descriptions two spaces after the longest file name, or at column 16 when the names are shorter.
