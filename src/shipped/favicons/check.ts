import { contrast, type Plan } from './plan.js';
import { drawnSize } from './symbol.js';
import { NAME } from './request.js';
import type { Finding } from '../shared/plugin.js';
import { ADAPTIVE, MASKABLE_RADIUS } from './views.js';

export type { Finding };

/** The smallest favicon a browser tab shows, in pixels */
const SMALLEST = 16;
export const MIN_CONTRAST = 3;

/**
 * What a reader would not see: a symbol drawn smaller than the brand's own minimum size at 16 px, and a favicon color
 * that does not reach 3:1 on a light or a dark tab, or the symbol on its ground in the app icon.
 */
export function checks(plan: Plan): Finding[] {
  const found: Finding[] = [];
  const drawn = drawnSize(plan.symbolSize, SMALLEST, plan.share.favicon);
  const { width, height } = plan.minSize;
  const small = [
    width !== undefined && drawn.width < width ? `${drawn.width.toFixed(1)} px wide, under its minimum of ${width}` : '',
    height !== undefined && drawn.height < height ? `${drawn.height.toFixed(1)} px tall, under its minimum of ${height}` : '',
  ].filter(Boolean);
  if (small.length > 0) {
    found.push({
      code: `${NAME}/min-size`,
      severity: 'warning',
      path: plan.symbolId,
      message: `in a ${SMALLEST} px favicon the symbol ${plan.symbolId} is ${small.join(' and ')} px (its sidecar minSize); the smallest tab icon is not legible`,
    });
  }
  const pairs: [string, string, string, string][] = [
    ['the favicon', plan.favicon, 'a light tab', plan.tabs.light],
    ['the favicon', plan.favicon, 'a dark tab', plan.tabs.dark],
    ['the symbol', plan.ink, 'the app icon ground', plan.ground],
  ];
  for (const [what, a, on, b] of pairs) {
    const ratio = contrast(a, b);
    if (ratio < MIN_CONTRAST)
      found.push({
        code: `${NAME}/contrast`,
        severity: 'warning',
        path: what === 'the favicon' ? 'favicon.svg' : 'app-icon-1024.png',
        message: `${what} (${a}) on ${on} (${b}) has a contrast of ${ratio.toFixed(2)}:1, under ${MIN_CONTRAST}:1`,
      });
  }
  return found;
}

/**
 * Where the symbol sits against the two safe zones a launcher may cut to, from `reach`: how far its farthest pixel is from
 * the centre of the Android layer, as a share of the width. Only a build has pixels, so only a build can say this.
 */
export function safeZones(plan: Plan, reach: number): Finding[] {
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  if (reach <= 0) {
    return [
      {
        code: `${NAME}/symbol-not-drawn`,
        severity: 'warning',
        path: 'android-adaptive-foreground.png',
        message: `nothing of the symbol ${plan.symbolId} is drawn in the Android layer: its drawing is empty, or so large or so small that it rounds away; check its viewBox`,
      },
    ];
  }
  const zones: [string, string, number][] = [
    ['maskable-safe-zone', 'the maskable safe zone, a circle of 80% of the icon', MASKABLE_RADIUS],
    ['adaptive-safe-zone', 'the Android adaptive safe zone, a circle of 66 dp in 108', ADAPTIVE.safeRadius],
  ];
  return zones
    .filter(([, , radius]) => reach > radius)
    .map(([code, zone, radius]) => ({
      code: `${NAME}/${code}`,
      severity: 'warning',
      path: 'android-adaptive-foreground.png',
      message: `the symbol ${plan.symbolId} reaches ${percent(reach)} of the icon width from its centre, outside ${zone} (${percent(radius)}); a launcher mask may cut it: lower share.app`,
    }));
}
