`blazon.press-kit` and `blazon.brand-deck` name their files after the brand, as
`blazon.office-template` does. The press kit's folder, zip and PDF were
`press-kit`, `press-kit.zip` and `press-kit.pdf`, and are now `<brand>-press-kit`
and so on (`acme-press-kit.zip` for a brand titled `Acme`). The deck's file was
`brand-deck.pdf` and is now `<brand>-brand-deck.pdf`. A title ending in `Brand
Book` loses those words, and a brand with no title, or the title blazon gives a
new book, keeps the old names. The press kit's `name` option still sets the whole
name; the deck has no option for it, and its command line keeps `-o`.
