# blazon.social-cards

The plugin blazon ships to draw marketing images (PNG) from a brand's tokens, logo and a background picture, and to check the text and the logo on each. It fills the `build` role and needs Node and a Chrome (`BLAZON_CHROME`, or the Google Chrome installed on the computer). Its options, the findings it returns and an example are in the plugins chapter of the manual, "Social cards".

The source is `src/shipped/social-cards/`, and `npm run build` (`npm run build:plugins`) bundles it, with the blazon code it uses, into `bin/blazon-blazon.social-cards.🔌`, the one file that holds the plugin's code and that `plugins/shipped.lock` pins. The program loads `playwright-core` from `node_modules` when it runs; that is outside the pin.
