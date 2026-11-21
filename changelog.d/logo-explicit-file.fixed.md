A logo that `logo` in blazon.json names by file is now that file in `blazon.office-template` and `blazon.social-cards`,
even when its asset has other files. With `logos/mark.svg` and `logos/mark.png`, `"logo": "./assets/logos/mark.png"`
drew the SVG in the Office template and sized the social cards' logo as the default 4:1 shape. A logo that names an id
still takes the default order.
