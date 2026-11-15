# blazon.logo-kit

The plugin blazon ships to draw the files a brand's logo rules describe: a lockup of the logo beside each partner's, and a sheet that shows the logo's clear space. It fills the `build` role. The SVG needs only Node; the PNG needs Node and a Chrome (`BLAZON_CHROME` names one, else the Google Chrome installed on the computer).

The source is `src/shipped/logo-kit/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.logo-kit.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` from `node_modules` when it runs; that is outside the pin. The layout of a lockup is `src/core/logo/lockup.ts`, the one the brand book's own figure uses. The manual's plugins chapter says what to put in the config and what the plugin writes.
