The shipped plugins that draw in a browser no longer let Chrome connect to a remote host. A brand's CSS, font or SVG that named a remote
address, a private one such as 169.254.169.254 included, made blazon.brand-deck and blazon.print-book request it from your machine. Now the
page loads only what the plugin serves, plus, for blazon.print-book and blazon.social-cards, a stylesheet, font or image that blazon fetches
under the same address policy as `init --from`, so a brand's Google Fonts keep working. Every refused or failed origin is a `network-blocked`
warning.
