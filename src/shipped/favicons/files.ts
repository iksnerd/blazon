import type { Plan } from './plan.js';
import { ADAPTIVE, IOS_SIZES, MASKABLE_RADIUS, VIEWS } from './views.js';

// The text files of the set: the head snippet, the web manifest, and favicons.json for the brand book and deck.

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The tags to paste into <head>, with the paths under `base`. */
export function headSnippet(plan: Plan): string {
  const at = (file: string) => escape(plan.base + file);
  return [
    `<link rel="icon" href="${at('favicon.svg')}" type="image/svg+xml">`,
    `<link rel="icon" href="${at('favicon.ico')}" sizes="any">`,
    `<link rel="apple-touch-icon" href="${at('apple-touch-icon.png')}">`,
    `<link rel="manifest" href="${at('site.webmanifest')}">`,
    `<meta name="theme-color" content="${plan.themeColor}">`,
    '',
  ].join('\n');
}

/** site.webmanifest: the 192 and 512 icons, maskable. */
export function webManifest(plan: Plan): string {
  const icon = (size: number) => ({ src: `${plan.base}icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' });
  return `${JSON.stringify({ name: plan.name, icons: [icon(192), icon(512)], theme_color: plan.themeColor, background_color: plan.ground, display: 'standalone' }, null, 2)}\n`;
}

/** Every image of the set: its file, its size and what it is for. The Favicons page lists them as a table. */
const FILES = [
  { file: 'favicon.svg', size: 'vector, 32 x 32 viewBox', use: 'Browser tab icon, any size, transparent' },
  { file: 'favicon.ico', size: '16, 32 and 48 px', use: 'Browser tab icon for browsers without SVG icons' },
  { file: 'favicon-16.png', size: '16 x 16', use: 'The tab icon at standard density' },
  { file: 'favicon-32.png', size: '32 x 32', use: 'The tab icon at 2x density' },
  { file: 'apple-touch-icon.png', size: '180 x 180', use: 'iOS home screen' },
  { file: 'icon-192.png', size: '192 x 192', use: 'Web manifest icon, maskable' },
  { file: 'icon-512.png', size: '512 x 512', use: 'Web manifest icon, maskable' },
  { file: 'app-icon-1024.png', size: '1024 x 1024', use: 'The master: square corners, no alpha channel' },
  { file: 'android-adaptive-foreground.png', size: `${ADAPTIVE.size} x ${ADAPTIVE.size}`, use: 'Android adaptive icon foreground, transparent, symbol inside the 66 dp safe zone' },
  { file: 'android-adaptive-background.png', size: `${ADAPTIVE.size} x ${ADAPTIVE.size}`, use: 'Android adaptive icon background, the ground color' },
  ...VIEWS.map((view) => ({ file: view.file, size: `${view.width * 2} x ${view.height * 2}`, use: `${view.title}: a view for the brand book, not part of an app` })),
];

/**
 * favicons.json: what a Favicons page of the book or deck shows, so neither has to know how the set is made. `reach` is how
 * far the symbol reaches from the centre of the Android layer, as a share of its width, measured on the drawn pixels.
 */
export function previewData(plan: Plan, supplied: string[], reach: number): string {
  return `${JSON.stringify(
    {
      format: 'blazon-favicons',
      version: 1,
      symbol: plan.symbolId,
      colors: { ground: plan.ground, ink: plan.ink, favicon: plan.favicon, themeColor: plan.themeColor },
      tabs: { light: plan.tabs.light, dark: plan.tabs.dark },
      share: plan.share,
      // Each preview: the file, its size in pixels, and how to show it (enlarged, pixelated, on which tab)
      previews: ['light', 'dark'].flatMap((tab) =>
        [16, 32].map((size) => ({ tab, background: plan.tabs[tab as 'light' | 'dark'], size, file: `favicon-${size}.png`, shownAt: size * 8, rendering: 'pixelated' })),
      ),
      tiles: [
        { file: 'app-icon-1024.png', size: 1024 },
        { file: 'apple-touch-icon.png', size: 180 },
        { file: 'icon-192.png', size: 192, maskable: true },
        { file: 'icon-512.png', size: 512, maskable: true },
      ],
      // The drawn views: the file and its size in pixels
      views: VIEWS.map((view) => ({ id: view.id, title: view.title, file: view.file, width: view.width * 2, height: view.height * 2 })),
      iosSizes: IOS_SIZES,
      adaptive: {
        foreground: 'android-adaptive-foreground.png',
        background: 'android-adaptive-background.png',
        size: ADAPTIVE.size,
        safeRadius: Number(ADAPTIVE.safeRadius.toFixed(4)),
        maskableRadius: MASKABLE_RADIUS,
        symbolReach: Number(reach.toFixed(4)),
      },
      files: FILES,
      head: headSnippet(plan),
      supplied,
    },
    null,
    2,
  )}\n`;
}
