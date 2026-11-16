# blazon.print-book

The plugin blazon ships to print a brand book: a PDF of 16:9 slides (1280 by 720 px) and a PowerPoint file of the same slides, from the site `blazon build` writes. It fills the `build` role. It is TypeScript on blazon's own npm dependencies (`playwright-core`, `pptxgenjs`, `pdf-lib`), so it needs Node and a Chrome, and nothing else.

## What it does

Blazon hands the plugin `site_dir` and `out_dir`. The plugin serves `site_dir` on `127.0.0.1`, on a free port, for the length of the call. It opens `index.html#print` with print media on, and waits for the viewer to set `window.__blazonPrint = { ready: true, pages: N }`. Then it prints with the page's own `@page` size, takes a picture of each slide, and writes both files into `out_dir`. Each PowerPoint slide is one picture, 1920 px across, so it looks exactly like the PDF in PowerPoint, Keynote and Google Slides, and its text is not editable.

When the site holds the copy of `blazon.favicons` (`favicons/favicons.json`), the book has a Favicons chapter, so list `blazon.favicons` before this plugin. If a `blazon.favicons` folder with a `favicons.json` sits beside this plugin's `out_dir` and the site has no copy, the warning `blazon.print-book/favicons-not-in-site` says so.

A slide whose content is taller than a slide even drawn at half size is cut off at the foot, and the `warning` finding `blazon.print-book/slide-clipped` names its pages. A PDF with other than `N` pages is a `warning` finding, `blazon.print-book/page-count`, and both files are still written.

| `options` | Page it prints | Files in `out_dir` |
|---|---|---|
| none, or `{ "preset": "full" }` | `index.html#print` | `brand-book.pdf`, `brand-book.pptx` |
| `{ "preset": "essentials" }` | `index.html#print/essentials` | `brand-book-essentials.pdf`, `.pptx` |
| `{ "preset": "reference" }` | `index.html#print/reference` | `brand-book-reference.pdf`, `.pptx` |
| `{ "pages": ["doc/logo", "tokens/colors"] }` | `index.html#print/pages=doc/logo,tokens/colors` | `brand-book-pages.pdf`, `.pptx` |

Two optional strings go with any of these: `title` (at most 120 characters) replaces the brand title in the cover heading and in the footers, and `subtitle` (at most 200) replaces the line under the cover heading. They reach the page as `?title=...&subtitle=...` after the hash, percent-encoded. 

One more option, `layout`, is `"compact"` (the default) or `"roomy"`. `compact` lets a figure share a slide by drawing its pictures down to 60% of their height, and sets the prose and sections tighter, so the book runs on fewer slides. `roomy` draws every picture whole and sets the text looser. Only `roomy` is put in the hash, as `layout=roomy`, and the page says which layout it used in `window.__blazonPrint.layout`. Any other value, and any other option, is refused.

It exits `2` with the reason and writes nothing when the request or its options are wrong, when `site_dir` has no `index.html`, when it finds no browser, and when the page does not say it is ready in time.

## Use it

```ts
plugins: [{ name: 'blazon.print-book', options: { preset: 'essentials' } }],
```

The source is `src/shipped/print-book/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.print-book.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` and `pdf-lib` from `node_modules` when it runs; that is outside the pin. Naming it in `plugins` is all it takes: blazon finds the plugins it ships by itself, as the plugins chapter of the manual says.

## Variables

| Variable | Says | Secret |
|---|---|---|
| `BLAZON_CHROME` | The path to a Chrome or Chromium program. Without it the plugin uses the Google Chrome installed on the computer. It never downloads a browser | no |

`BLAZON_PRINT_SECONDS` (how long to wait for the page to lay itself out: 30 by default, and at most 30) is read too, but blazon does not pass it. It is for running the plugin by hand and for its tests.
