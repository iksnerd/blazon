import type { BlazonConfig } from '../../types/index.js';

export const DEFAULT_CONFIG: BlazonConfig = {
  title: 'Blazon Brand Book',
  description: 'Design tokens and brand guidelines',
  tokensDir: './tokens',
  docsDir: './docs',
  assetsDir: './assets',
  outDir: './dist/site',
  tokensOutDir: './dist/tokens',
  cssPrefix: '--',
  cssSelector: ':root',
  port: 3000,
};
