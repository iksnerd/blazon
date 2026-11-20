# blazon.favicons

The plugin blazon ships to draw a brand's favicon and app-icon set from its symbol, with three views of the set for the brand book, and to judge the symbol as an icon. It fills the `check` and `build` roles. Drawing needs Node and a Chrome (`BLAZON_CHROME`, or the Google Chrome installed on the computer); the check needs neither. Its options, the files it writes, the findings it returns and the Favicons page it copies into the site are in the plugins chapter of the manual, "blazon.favicons".

List it before `blazon.print-book`, so the printed book has a Favicons chapter.

The source is `src/shipped/favicons/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.favicons.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` from `node_modules` when it runs; that is outside the pin.

## Variables

| Variable | Says | Secret |
|---|---|---|
| `BLAZON_CHROME` | The path to a Chrome or Chromium program. Without it the plugin uses the Google Chrome installed on the computer. It never downloads a browser | no |
| `HOME`, `TMPDIR` | Listed in the manifest, for the browser the plugin starts | no |

The manifest lists all three, so the entry in `blazon.json` approves them in its `env`: `["BLAZON_CHROME", "HOME", "TMPDIR"]`.
