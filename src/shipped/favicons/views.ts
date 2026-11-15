import { contrast, type Plan } from './plan.js';

// The three views of the set, as HTML for the browser to draw: the favicon in a light and a dark tab, the app icon under
// the platform masks, and the iOS size ladder. Only neutral placeholder shapes stand in for other apps and for the
// browser: no system interface is imitated. Every number is written the same way on every machine.

/** Each view's size in CSS px; the PNG is twice that. */
export const VIEWS = [
  { id: 'tabs', file: 'favicon-tabs.png', title: 'Browser tabs', width: 1200, height: 340 },
  { id: 'masks', file: 'app-icon-masks.png', title: 'App icon masks', width: 1200, height: 300 },
  { id: 'sizes', file: 'app-icon-sizes.png', title: 'iOS sizes', width: 1200, height: 300 },
] as const;

/** The iOS app-icon sizes in pixels, largest first, and where each shows */
export const IOS_SIZES: { size: number; use: string }[] = [
  { size: 180, use: 'iPhone home screen' },
  { size: 120, use: 'iPhone, small' },
  { size: 87, use: 'Settings, 3x' },
  { size: 60, use: 'Spotlight' },
  { size: 40, use: 'Notification' },
  { size: 29, use: 'Settings' },
];

/** The Android adaptive-icon layers: 108 dp at 4 px per dp, and the safe circle of 66 dp inside them */
export const ADAPTIVE = { size: 432, safeRadius: 33 / 108 };
/** A maskable icon keeps its content inside a circle of 80% of its width */
export const MASKABLE_RADIUS = 0.4;
/** What iOS rounds the corners to, as a share of the side */
const IOS_RADIUS = 22.37;

export const STYLE = `*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#0F172A;background:#fff}.cap{font-size:13px;line-height:1.25;color:#475569;text-align:center}.cap b{display:block;color:#0F172A;font-weight:700;font-size:14px}img.px{image-rendering:pixelated}`;

/** Dark ink or light ink, whichever reads better on `color`. */
const inkOn = (color: string): string => (contrast('#111827', color) >= contrast('#F9FAFB', color) ? '#111827' : '#F9FAFB');

const uri = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`;
const num = (value: number): string => String(Number(value.toFixed(2)));

/** The favicon in a light and a dark tab, with the 16 px icon enlarged 8 times and the 32 px icon 4 times, pixelated. */
export function tabsView(plan: Plan, small: { 16: Buffer; 32: Buffer }): string {
  const half = (title: string, page: string, strip: string, tab: string, text: string) => {
    const ink = inkOn(tab);
    const box = (size: 16 | 32, scale: number) =>
      `<div><div style="background:${tab};width:128px;height:128px;border-radius:8px;display:grid;place-items:center"><img class="px" src="${uri(small[size])}" width="128" height="128"></div><div class="cap" style="margin-top:8px;color:${ink};opacity:.85"><b style="color:${ink}">${size} px</b>shown ${scale}x</div></div>`;
    return `<section style="width:600px;height:340px;padding:22px 24px;background:${page}">
<div style="font-size:15px;font-weight:700;margin-bottom:12px;color:${text}">${title}</div>
<div style="background:${strip};height:44px;border-radius:10px;padding:8px 8px 0;display:flex;gap:4px">
<div style="background:${tab};width:210px;height:36px;border-radius:9px 9px 0 0;display:flex;align-items:center;gap:9px;padding:0 12px;font-size:13px;color:${ink}"><img src="${uri(small[32])}" width="16" height="16"><span>${escape(plan.name)}</span></div>
<div style="width:150px;height:30px;margin-top:6px;display:flex;align-items:center;gap:9px;padding:0 12px;font-size:13px;color:${text};opacity:.55"><i style="width:16px;height:16px;border-radius:50%;background:${text};opacity:.35"></i><span>Other tab</span></div>
</div>
<div style="display:flex;gap:44px;margin-top:22px;align-items:flex-start">${box(16, 8)}${box(32, 4)}<div style="font-size:13px;line-height:1.45;color:${text};opacity:.9;max-width:150px;padding-top:4px">The 16 px icon is the one a standard-density tab shows. The 32 px icon is the same tab on a 2x screen.</div></div>
</section>`;
  };
  return `<div style="display:flex;width:1200px">${half('Light tab', '#F1F3F4', '#DEE1E6', plan.tabs.light, '#111827')}${half('Dark tab', '#171717', '#35363A', plan.tabs.dark, '#F9FAFB')}</div>`;
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A superellipse as a clip-path polygon in percent: the rounded shape many Android launchers use, drawn with n = 5. */
function squircle(n = 5, steps = 120): string {
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    points.push(`${num(50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / n))}% ${num(50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / n))}%`);
  }
  return `polygon(${points.join(',')})`;
}

/** The master under the iOS rounding and three Android masks, and with the safe-zone circles drawn over it. */
export function masksView(master: Buffer): string {
  const size = 150;
  const src = uri(master);
  const tile = (label: string, sub: string, style: string, extra = '') =>
    `<div style="width:${size}px"><div style="position:relative;width:${size}px;height:${size}px;${style}"><img src="${src}" width="${size}" height="${size}" style="display:block">${extra}</div><div class="cap" style="margin-top:12px"><b>${label}</b>${sub}</div></div>`;
  const circle = (percent: number, color: string) => {
    const d = (size * percent) / 100;
    return `<div style="position:absolute;left:${num((size - d) / 2)}px;top:${num((size - d) / 2)}px;width:${num(d)}px;height:${num(d)}px;border-radius:50%;border:1.5px dashed ${color}"></div>`;
  };
  const tiles = [
    tile('Master', '1024 px, square', ''),
    tile('iOS', `rounded, ${IOS_RADIUS}%`, `border-radius:${IOS_RADIUS}%;overflow:hidden`),
    tile('Android circle', 'launcher mask', 'border-radius:50%;overflow:hidden'),
    tile('Android squircle', 'launcher mask', `clip-path:${squircle()}`),
    tile('Android rounded', 'launcher mask', 'border-radius:28%;overflow:hidden'),
    tile('Safe zones', 'white: maskable 80%<br>cyan: adaptive 66 dp', '', circle(MASKABLE_RADIUS * 200, '#fff') + circle(ADAPTIVE.safeRadius * 200, '#5EEAD4')),
  ];
  return `<div style="width:1200px;height:300px;background:#F4F6F8;display:flex;justify-content:space-around;align-items:flex-start;padding:40px 24px 0">${tiles.join('')}</div>`;
}

/** The master at each iOS size, rounded as iOS rounds it. */
export function sizesView(master: Buffer): string {
  const src = uri(master);
  const cells = IOS_SIZES.map(
    ({ size, use }) =>
      `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:260px;width:170px"><img src="${src}" width="${size}" height="${size}" style="border-radius:${IOS_RADIUS}%;display:block"><div class="cap" style="margin-top:14px"><b>${size} px</b>${use}</div></div>`,
  ).join('');
  return `<div style="width:1200px;height:300px;background:#fff;display:flex;justify-content:space-around;align-items:flex-end;padding:0 20px 24px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0">${cells}</div>`;
}
