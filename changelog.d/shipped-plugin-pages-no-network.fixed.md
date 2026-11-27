The shipped plugins that draw in a browser no longer let a page load anything from the network. A brand's CSS, font or SVG that named a
remote address, a private one such as 169.254.169.254 included, made blazon.brand-deck and blazon.print-book request it from your machine. Now
only the plugin's own server, data:, blob: and about:blank are answered, and each refused origin is a `network-blocked` warning. A
Google Fonts stylesheet in `fonts` is no longer loaded by the print book or the social cards: embed the font file instead.
