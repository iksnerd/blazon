import type { Card } from './options.js';
import type { Display, Format } from './brand.js';
import type { LogoPlan, Rect } from './checks.js';

// The card as a page: one 1x HTML document the browser draws, at the format's size. The same builder makes the page the
// plugin measures (no scrim, text hidden by the caller) and the page it photographs, so what is checked is what is drawn.

/** The room between the text and the edge of the scrim's full strength, and how far the scrim fades out past it */
const SCRIM_PAD = 24;
const SCRIM_RAMP = 0.35;

export interface Look {
  format: Format;
  card: Card;
  display: Display;
  bodyFamily: string;
  fonts: string[];
  /** A CSS background: a color, a gradient, or `url(…) center / cover no-repeat` */
  background: string;
  /** Under the picture, so a picture that is still loading shows the brand's dark and not white */
  ground: string;
  textColor: string;
  accent: string;
  /** Headline size in px; the subline follows it */
  size: number;
  /** Which edge the text hangs from; the logo is in a corner of the other one, unless the card put it on this edge with `logoCorner` */
  anchor: 'top' | 'bottom';
  /** The room the text may take, from the edge of the safe area */
  maxHeight: number;
  /** Room taken off the text block beyond the margin, on each side, so the text stops short of a logo on its edge */
  inset?: { left: number; right: number };
  scrim?: { rgb: readonly [number, number, number]; alpha: number; extent: number };
  logo?: { src: string; rect: Rect };
}

/** Characters that could end the style or the attribute they sit in: a value from brand.json is the brand's, but it is not trusted to be inert. */
const css = (value: string): string => value.replace(/[<>{};"\\]/g, '');
const html = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const subSize = (size: number): number => Math.max(16, Math.round(size * 0.3));

/** The width of the text block: five sixths of the safe width on a six-column card, so a headline leaves a column free. */
export function measure(format: Format, align: Card['align']): number {
  const safe = format.width - 2 * format.margin;
  return align === 'center' || format.columns < 3 ? safe : Math.round((safe * (format.columns - 1)) / format.columns);
}

/**
 * How far the text must stay in from each side when the logo is on the edge the text hangs from: the logo's width and its clear
 * space. Text that starts at the left stops short of a logo on the right; centered text keeps its centre and gives up that room
 * on both sides. A logo on the side the text starts from cannot be made room for: it is left to `card-text-logo-overlap`.
 */
export function logoInset(align: Card['align'], anchor: Look['anchor'], plan: Pick<LogoPlan, 'corner' | 'rect' | 'clearSpace'>): { left: number; right: number } {
  const none = { left: 0, right: 0 };
  if (!plan.corner.startsWith(anchor)) return none;
  const room = Math.ceil(plan.rect.width + plan.clearSpace);
  if (align === 'center') return { left: room, right: room };
  return plan.corner.endsWith('right') ? { left: 0, right: room } : none;
}

/** The strongest part of the scrim reaches `extent` px from the edge the text hangs from, then fades out over a third of the card. */
export function scrimExtent(format: Format, anchor: Look['anchor'], block: Rect): number {
  return Math.round(anchor === 'bottom' ? format.height - block.y + SCRIM_PAD : block.y + block.height + SCRIM_PAD);
}

/** The scrim as a CSS gradient: the brand's inverse color at `alpha` out to `extent`, then fading out. `none` when there is none. */
export function scrimGradient(look: Look): string {
  if (!look.scrim || look.scrim.alpha <= 0) return 'none';
  const { rgb, alpha, extent } = look.scrim;
  const at = (a: number) => `rgba(${rgb.join(',')},${+a.toFixed(3)})`;
  const ramp = Math.round(look.format.height * SCRIM_RAMP);
  const direction = look.anchor === 'bottom' ? 'to top' : 'to bottom';
  return `linear-gradient(${direction}, ${at(alpha)} 0, ${at(alpha)} ${extent}px, ${at(alpha * 0.45)} ${extent + Math.round(ramp / 2)}px, ${at(0)} ${extent + ramp}px)`;
}

export function pageHtml(look: Look): string {
  const { format, card, display } = look;
  const center = card.align === 'center';
  const inset = look.inset ?? { left: 0, right: 0 };
  const safe = format.width - 2 * format.margin;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${html(card.id)}</title>
${look.fonts.map((href) => `<link rel="stylesheet" href="${html(href)}">`).join('\n')}
<style>
  html, body { margin: 0; background: ${css(look.ground)} }
  #card { position: relative; width: ${format.width}px; height: ${format.height}px; overflow: hidden; background: ${css(look.ground)}; --h: ${look.size}px; --s: ${subSize(look.size)}px }
  #picture, #scrim { position: absolute; inset: 0 }
  #picture { background: ${css(look.background)} }
  #scrim { background: ${scrimGradient(look)} }
  #text { position: absolute; ${look.anchor}: ${format.margin}px; left: ${format.margin + inset.left}px; width: ${Math.min(measure(format, card.align), safe - inset.left - inset.right)}px; ${center ? `right: ${format.margin + inset.right}px;` : ''}
    text-align: ${card.align}; color: ${css(look.textColor)}; display: flex; flex-direction: column; align-items: ${center ? 'center' : 'flex-start'} }
  #rule { width: 56px; height: 6px; background: ${css(look.accent)}; margin-bottom: ${Math.round(look.size * 0.28)}px }
  h1 { margin: 0; font: ${display.weight} var(--h) / ${display.lineHeight} ${css(display.family)}; letter-spacing: ${css(display.letterSpacing)}; text-wrap: balance; overflow-wrap: normal; width: 100% }
  p { margin: ${Math.round(look.size * 0.22)}px 0 0; font: 400 var(--s) / 1.4 ${css(look.bodyFamily)}; width: 100%; overflow-wrap: normal }
  #logo { position: absolute; display: block }
</style></head>
<body>
<div id="card">
  <div id="picture"></div>
  <div id="scrim"></div>
  <div id="text"><div id="rule"></div><h1 id="headline">${html(card.headline)}</h1>${card.subline ? `<p id="subline">${html(card.subline)}</p>` : ''}</div>
  ${look.logo ? `<img id="logo" alt="" src="${html(encodeURI(look.logo.src))}" style="left:${look.logo.rect.x}px;top:${look.logo.rect.y}px;width:${look.logo.rect.width}px;height:${look.logo.rect.height}px">` : ''}
</div>
</body></html>
`;
}
