import { defineConfig } from '@iksnerd/blazon';

// A fictional brand book. It exists to be the conformance fixture for what the starter does not exercise
// (RFC 0001, Conformance): review approvals with by, at and value, the font extension, a logo initiative, an experimental asset category.
// Nothing here is a real brand, person or approval.
export default defineConfig({
  title: 'Conformance Fixture',
  description: 'A fictional brand book that exercises approvals, font metadata and logo initiatives for the conformance tests',
  sections: ['intro', 'logo', 'color', 'typography'],
  tokensDir: './tokens',
  docsDir: './docs',
  assetsDir: './assets',
  outDir: './dist/site',
  tokensOutDir: './dist/tokens',
  port: 3000,

  // One logo, for light surfaces: the fixture has no logo made for a dark one, and the same ink on its dark surface would not be visible
  logo: { onLight: './assets/logos/example-ink.svg' },

  theme: {
    background: 'color.surface',
    canvas: 'color.surface',
    text: 'color.ink',
    muted: 'color.ink',
    border: 'color.ink',
    accent: 'color.accent',
    accentText: 'color.surface',
    inverse: 'color.ink',
    inverseText: 'color.surface',
    fontDisplay: 'font.family.display',
    fontBody: 'font.family.body',
  },

  assets: {
    experiments: { label: 'Experiments', description: 'Logo directions that were tried. Not the identity.', experimental: true },
  },

  fonts: ['https://fonts.example.invalid/css2?family=Example+Display&family=Example+Text'],
});
