import { defineConfig } from '@iksnerd/blazon';

export default defineConfig({
  title: 'Blazon Brand Book',
  description: "blazon's own identity: neo-industrial, built from exposed structure and one signal color",
  // Sections this brand book expects. Illustration, photography, patterns and 3D are left out on purpose.
  sections: ['intro', 'logo', 'color', 'typography', 'icons', 'diagrams', 'motion', 'layout', 'social', 'applications', 'voice'],
  customSections: [{ id: 'voice', title: 'Voice and tone' }],
  tokensDir: './tokens',
  docsDir: './docs',
  assetsDir: './assets',
  outDir: './dist/site',
  tokensOutDir: './dist/tokens',
  port: 3000,

  logo: {
    onLight: './assets/logos/blazon-graphite.svg',
    onDark: './assets/logos/blazon-bone.svg',
  },

  theme: {
    background: 'surface.background',
    canvas: 'surface.canvas',
    text: 'text.primary',
    muted: 'text.muted',
    border: 'rule.default',
    accent: 'interactive.primary',
    accentText: 'text.onSignal',
    inverse: 'surface.inverse',
    inverseText: 'text.inverse',
    fontDisplay: 'font.family.display',
    fontBody: 'font.family.body',
    radius: 'radius.hairline',
  },

  // shadcn/ui's focus ring is the primary action color by default, which is 2.74:1 on the page background. The Web page (docs/12-web.md,
  // "Focus") sets the outline to text.primary, not to a rule, so the dark theme can quiet its rules and focus stays Bone. The brand has no red, so destructive is the text color,
  // and the five chart colors are neutrals in the order the Web page ("Using shadcn/ui") gives.
  shadcn: {
    ring: 'text.primary',
    'sidebar-ring': 'text.primary',
    destructive: 'text.primary',
    'chart-1': 'text.primary',
    'chart-2': 'text.muted',
    'chart-3': 'surface.canvas',
    'chart-4': 'rule.default',
    'chart-5': 'rule.quiet',
  },

  // A string is a Google Fonts stylesheet. An object with a file is a font file of this folder (here IBM Plex Mono in regular and semibold, SIL OFL 1.1, fonts/OFL.txt):
  // blazon embeds each as an @font-face, so it needs no server.
  fonts: [
    'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=IBM+Plex+Sans:wght@400;600&display=swap',
    { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-Regular-latin.woff2', weight: 400 },
    { family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-SemiBold-latin.woff2', weight: 600 },
  ],

  plugins: [
    // The copy rules: `blazon check` holds the book's own text to the voice page (docs/11-voice.md). It needs Node only. A page that
    // quotes counter-examples on purpose, as that one does, goes in `skip`.
    {
      name: 'blazon.copy',
      options: {
        avoid: [
          { terms: ['powerful', 'seamless', 'robust', 'effortless', 'leverage', 'comprehensive'], say: 'a number, or nothing' },
          { terms: ['\u2014', '\u2013'], say: 'a period, a colon or parentheses' },
        ],
        headings: 'sentence',
        sentences: { maxWords: 25 },
        skip: ['11-voice.md'],
      },
    },
    // A plugin starts with an empty environment. `env` approves the variables its manifest lists: without it, blazon refuses to start a plugin whose listed variable is set.
    // starter:omit-start Mostly needs Google Chrome, and these are kits a new book has no use for yet, so `blazon init` leaves them commented out.
    // Favicons and app icons from the folded-page mark (logos/blazon-mark, lockup "mark"), with previews and a Favicons page. Listed before the deck so the deck has a Favicons part.
    { name: 'blazon.favicons', env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'], options: { ground: 'color.ink.graphite', ink: '#F2F0EB', favicon: '#FF5A1F', share: { app: 0.43, favicon: 0.88 } } },
    // Logo files from the logo rules: a clear-space sheet (SVG and PNG) for each logo that states a clearSpace.
    { name: 'blazon.logo-kit', env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'] },
    // The deck: `blazon build` writes dist/tokens/blazon.brand-deck/brand-deck.pdf, drawn in Google Chrome (or the browser
    // BLAZON_CHROME names) by the plugin blazon ships, found by its name alone.
    { name: 'blazon.brand-deck', env: ['BLAZON_CHROME', 'BLAZON_DECK_FONTS', 'HOME', 'TMPDIR'] },
    // Social cards: `blazon build` writes dist/tokens/blazon.social-cards/launch.png and post.png (1200x630 and 1080x1080,
    // the formats in tokens/social.json), from the brand's type, colors and logo and the aurora background.
    {
      name: 'blazon.social-cards',
      env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'],
      options: {
        cards: [
          { id: 'launch', format: 'horizontal', background: 'backgrounds/aurora', headline: 'Say it in one line.', subline: 'A brand book that checks itself.' },
          { id: 'post', format: 'square', background: 'backgrounds/aurora', headline: 'One signal. Every surface.', align: 'center', logo: 'dark' },
        ],
      },
    },
    // The outside kit: one folder and one zip for a journalist, partner or agency (logos, colors, fonts, the one-page PDF).
    { name: 'blazon.press-kit', env: ['BLAZON_CHROME', 'HOME', 'TMPDIR'] },
    // Native token files for apps: Android resources, an iOS Swift file with an asset catalog and Jetpack Compose Kotlin. Node only.
    { name: 'blazon.platform-tokens' },
    // An editable PowerPoint template: the brand's theme, a slide master and five layouts, with the logo placed as its sidecar says. Node only.
    { name: 'blazon.office-template' },
    // starter:omit-end
  ],
});
