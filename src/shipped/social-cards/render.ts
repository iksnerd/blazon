import type { Browser, BrowserContext, Page } from 'playwright-core';
import { serve } from '../print-book/site.js';
import { colorOf, type BrandAsset, type BrandRead } from './brand.js';
import {
  backgroundFindings,
  contrastFinding,
  keepClearFindings,
  logoContrastFinding,
  logoFinding,
  logoWidthFinding,
  overflowFinding,
  planLogo,
  type Finding,
  type LogoMeta,
  type LogoPlan,
  type Rect,
} from './checks.js';
import { bestLogo, chooseText, logoRatio, MIN_LOGO_CONTRAST, parseColor, type RGB } from './contrast.js';
import { fitHeadline, typeSteps } from './fit.js';
import { logoInset, pageHtml, scrimExtent, scrimGradient, subSize, type Look } from './layout.js';
import type { Card } from './options.js';
import type { Job } from './request.js';

// Draws each card in a real browser: lays the page out, fits the headline, samples the picture under the text, solves the
// scrim, places the logo, measures the boxes from the DOM, and photographs the result.

const CARD_PATH = '/__card.html';
const FONT_SECONDS = 8;

export interface Drawn {
  id: string;
  /** file name -> PNG */
  files: Map<string, Buffer>;
  findings: Finding[];
}

/** A logo as the card uses it: the file to load, and its size in the artwork's own pixels. */
interface Logo {
  src: string;
  asset?: BrandAsset;
}

const logoOf = (brand: BrandRead, which: 'onLight' | 'onDark'): Logo | undefined => {
  const src = brand.logo[which];
  return src === undefined ? undefined : { src, asset: [...brand.assets.values()].find((asset) => asset.file === src) };
};

const dark = '#1E1F21';

/** Draws every card; the browser is the caller's to close. */
export async function drawCards(browser: Browser, job: Job, brand: BrandRead, cards: readonly Card[], scale: 1 | 2): Promise<Drawn[]> {
  const site = await serve(job.siteDir);
  try {
    const drawn: Drawn[] = [];
    for (const card of cards) drawn.push(await drawCard(browser, site.origin, brand, card, scale));
    return drawn;
  } finally {
    await site.close();
  }
}

async function open(browser: Browser, origin: string, html: string, size: { width: number; height: number }, scale: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale });
  // tsx wraps functions with a __name helper that does not exist in the page; the built plugin has none, and this is harmless there
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.route(`**${CARD_PATH}`, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`${origin}${CARD_PATH}`, { waitUntil: 'load', timeout: 25_000 }).catch(async () => {
    // A font stylesheet that does not answer must not stop the card: draw it in the fallback faces
    await page.goto(`${origin}${CARD_PATH}`, { waitUntil: 'domcontentloaded' });
  });
  await page.evaluate(async (seconds) => {
    await Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, seconds * 1000))]);
  }, FONT_SECONDS);
  return { context, page };
}

/** The boxes the card is checked on, from the DOM: the text itself (line boxes, not the block), the block, and the logo.
 * `lines` are the boxes of each rendered line of the headline and of the subline; the accent rule above the headline counts as part of it. */
async function boxes(page: Page): Promise<{ text: Rect; block: Rect; logo?: Rect; fits: boolean; lines: { headline: Rect[]; subline: Rect[] } }> {
  return page.evaluate(() => {
    const rectOf = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    const lines: { headline: Rect[]; subline: Rect[] } = { headline: [], subline: [] };
    const range = document.createRange();
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const id of ['headline', 'subline']) {
      const element = document.getElementById(id);
      if (!element) continue;
      range.selectNodeContents(element);
      for (const r of Array.from(range.getClientRects())) {
        lines[id as 'headline' | 'subline'].push(rectOf(r));
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    const headline = document.getElementById('headline')!;
    const subline = document.getElementById('subline');
    const logo = document.getElementById('logo');
    lines.headline.push(rectOf(document.getElementById('rule')!.getBoundingClientRect()));
    const block = document.getElementById('text')!.getBoundingClientRect();
    return {
      text: { x: left, y: top, width: right - left, height: bottom - top },
      block: rectOf(block),
      lines,
      ...(logo && { logo: rectOf(logo.getBoundingClientRect()) }),
      // A word wider than the block sticks out of it, and a block taller than its room is checked by the caller
      fits: headline.scrollWidth <= headline.clientWidth + 1 && (!subline || subline.scrollWidth <= subline.clientWidth + 1),
    };
  });
}

/** The picture under a box as flat [r, g, b, …] pixels, at most about 20,000 of them, with `hide` hidden. */
async function pixelsUnder(page: Page, box: Rect, hide: string[]): Promise<number[]> {
  await page.addStyleTag({ content: `${hide.map((id) => `#${id}`).join(',')} { visibility: hidden !important }` });
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const shot = await page.screenshot({ type: 'png', clip: { x, y, width: Math.max(1, Math.ceil(box.x + box.width) - x), height: Math.max(1, Math.ceil(box.y + box.height) - y) } });
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const count = data.length / 4;
    const stride = Math.max(1, Math.ceil(count / 20000));
    const out: number[] = [];
    for (let i = 0; i < count; i += stride) out.push(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
    return out;
  }, shot.toString('base64'));
  await page.evaluate(() =>
    document.querySelectorAll('style').forEach((style) => {
      if (style.textContent?.includes('visibility: hidden !important')) style.remove();
    }),
  );
  return pixels;
}

async function drawCard(browser: Browser, origin: string, brand: BrandRead, card: Card, scale: 1 | 2): Promise<Drawn> {
  const format = brand.formats.get(card.format)!;
  const findings: Finding[] = [];
  const size = { width: format.width, height: format.height };

  // The background: an image asset, else a color or gradient token
  const asset = brand.assets.get(card.background);
  const token = brand.tokens.get(card.background);
  if (asset) findings.push(...backgroundFindings(card.id, asset, format));
  const background = asset ? `url(${encodeURI(asset.file).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}) center / cover no-repeat` : (token?.value ?? dark);

  // The logo: its corner and size come from its sidecar; which of the two files is decided after the scrim
  const light = logoOf(brand, 'onLight');
  const onDark = logoOf(brand, 'onDark');
  const reference = onDark ?? light;
  const artwork = { width: Number(reference?.asset?.width) || 4, height: Number(reference?.asset?.height) || 1 };
  const plan: LogoPlan | undefined = reference
    ? planLogo(format, artwork, (reference.asset?.meta ?? undefined) as LogoMeta | undefined, card.anchor, {
        ...(card.logoWidth !== undefined && { width: card.logoWidth }),
        ...(card.logoCorner !== undefined && { corner: card.logoCorner }),
      })
    : undefined;
  if (plan?.clampedFrom !== undefined) findings.push(logoWidthFinding(card.id, plan.clampedFrom, plan.rect.width));

  const anchor: Look['anchor'] = card.anchor ?? (plan?.corner.startsWith('top') ? 'bottom' : plan ? 'top' : 'bottom');
  // A logo on the text's own edge (only a `logoCorner` with an `anchor` puts it there) takes room across, not down
  const shared = plan !== undefined && plan.corner.startsWith(anchor);
  const inset = plan ? logoInset(card.align, anchor, plan) : undefined;
  const room = format.height - 2 * format.margin - (plan && !shared ? plan.rect.height + plan.clearSpace : 0);
  const base: Look = {
    format,
    card,
    display: brand.display,
    bodyFamily: brand.bodyFamily,
    fonts: brand.fonts,
    background,
    ground: brand.colors.inverse ?? dark,
    textColor: brand.colors.inverseText ?? '#FFFFFF',
    accent: brand.colors.accent ?? brand.colors.inverseText ?? '#FFFFFF',
    size: brand.display.start,
    anchor,
    maxHeight: room,
    ...(inset && { inset }),
  };

  const probe = await open(browser, origin, pageHtml(base), size, 1);
  let look: Look;
  try {
    // 1. The largest type step at which the text fits its room and its width
    const steps = typeSteps(brand.display.start, brand.display.floor);
    const fit = await fitHeadline(steps, async (px) => {
      await probe.page.evaluate(
        ([h, s]) => {
          const card = document.getElementById('card')!;
          card.style.setProperty('--h', `${h}px`);
          card.style.setProperty('--s', `${s}px`);
        },
        [px, subSize(px)] as const,
      );
      const found = await boxes(probe.page);
      return found.fits && found.block.height <= room + 0.5;
    });
    if (!fit.fits) findings.push(overflowFinding(card.id, brand.display.floor));
    const placed = await boxes(probe.page);

    // 2. The text color and the weakest scrim that makes the headline read, from the picture's actual pixels
    const under = await pixelsUnder(probe.page, placed.text, ['text']);
    const scrimColor = parseColor(brand.colors.inverse ?? dark) ?? [30, 31, 33];
    const named = card.textColor === undefined ? undefined : colorOf(brand, card.textColor);
    const candidates = named ? [named] : [brand.colors.inverseText, brand.colors.text].flatMap((c) => (c ? [parseColor(c)] : [])).filter((c): c is RGB => c !== undefined);
    if (candidates.length === 0) candidates.push([255, 255, 255]);
    const chosen = chooseText(under, candidates, scrimColor);
    if (!chosen.ok) findings.push(contrastFinding(card.id, chosen.ratio, chosen.alpha));
    const text = candidates[chosen.index]!;
    const extent = scrimExtent(format, anchor, placed.block);
    look = { ...base, size: fit.size, textColor: `rgb(${text.join(',')})`, scrim: { rgb: scrimColor, alpha: chosen.alpha, extent } };

    // 3. The logo for the surface under it, once the scrim is on
    if (plan) {
      const chosenLogo = await chooseLogo(probe, look, plan, card, light, onDark);
      if (chosenLogo.ratio < MIN_LOGO_CONTRAST) findings.push(logoContrastFinding(card.id, chosenLogo.ratio));
      look = { ...look, logo: { src: chosenLogo.src, rect: plan.rect } };
    }
  } finally {
    await probe.context.close();
  }

  // The card as drawn: measured from its own DOM, then photographed at 1x and, if asked, 2x
  const files = new Map<string, Buffer>();
  const html = pageHtml(look);
  for (const factor of scale === 2 ? [1, 2] : [1]) {
    const { context, page } = await open(browser, origin, html, size, factor);
    try {
      if (factor === 1 && (plan || card.keepClear)) {
        const found = await boxes(page);
        if (plan) {
          const problem = logoFinding(card.id, {
            logo: found.logo ?? plan.rect,
            clearSpace: plan.clearSpace,
            text: found.text,
            safe: { x: format.margin, y: format.margin, width: format.width - 2 * format.margin, height: format.height - 2 * format.margin },
            card: { x: 0, y: 0, width: format.width, height: format.height },
            shared,
          });
          if (problem) findings.push(problem);
        }
        // The same boxes the logo is checked on: where the lines and the logo were drawn, not where they were planned
        if (card.keepClear) findings.push(...keepClearFindings(card.id, { card: size, zones: card.keepClear, lines: found.lines, ...(found.logo && { logo: found.logo }) }));
      }
      files.set(factor === 1 ? `${card.id}.png` : `${card.id}@2x.png`, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...size } }));
    } finally {
      await context.close();
    }
  }
  return { id: card.id, files, findings };
}

/** The contrast of a logo file against the picture under its box, with the scrim on: its own pixels, drawn alone, against the picture without it. */
async function measureLogo(probe: { page: Page }, plan: LogoPlan, logo: Logo): Promise<number> {
  const under = await pixelsUnder(probe.page, plan.rect, ['text', 'logo']);
  const art = await probe.page.evaluate(
    async ([src, width, height]) => {
      const image = new Image();
      image.src = src!;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width as number;
      canvas.height = height as number;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, width as number, height as number);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(1, Math.ceil(data.length / 4 / 20000));
      const out: number[] = [];
      for (let i = 0; i < data.length / 4; i += stride) out.push(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!);
      return out;
    },
    [encodeURI(logo.src), plan.rect.width, plan.rect.height] as const,
  );
  return logoRatio(art, under);
}

/**
 * The logo for the surface the card shows under it, with its contrast there: the one asked for by `light` or `dark`, else the
 * better of the two by that same measure. A single logo is measured too.
 */
async function chooseLogo(probe: { page: Page }, look: Look, plan: LogoPlan, card: Card, onLight: Logo | undefined, onDark: Logo | undefined): Promise<Logo & { ratio: number }> {
  await probe.page.evaluate(
    ([gradient]) => {
      document.getElementById('scrim')!.style.background = gradient!;
    },
    [scrimGradient(look)] as const,
  );
  const asked = card.logo === 'light' ? onLight : card.logo === 'dark' ? onDark : undefined;
  const candidates = asked ? [asked] : [onDark, onLight].filter((logo): logo is Logo => logo !== undefined);
  const measured: (Logo & { ratio: number })[] = [];
  for (const logo of candidates) measured.push({ ...logo, ratio: await measureLogo(probe, plan, logo) });
  return bestLogo(measured);
}
