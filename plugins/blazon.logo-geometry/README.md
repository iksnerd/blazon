# blazon.logo-geometry

The plugin blazon ships to measure a brand's logos: how closely each matches itself mirrored left to right, top to bottom and turned 180° and 90° (`mirror-x`, `mirror-y`, `rot180`, `rot90`), where its weight sits, and for an SVG the grid its points lie on. It checks the axes a brand requires, and draws the construction figure that brand guidelines show. It fills the `build` role. An SVG needs only Node; a PNG or WebP needs Node and a Chrome (`BLAZON_CHROME` names one, else the Google Chrome installed on the computer).

The source is `src/shipped/logo-geometry/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.logo-geometry.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` from `node_modules` when it runs; that is outside the pin. The manual's plugins chapter says what to put in the config and what the plugin writes.
