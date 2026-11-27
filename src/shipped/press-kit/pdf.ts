import { PDFDocument } from 'pdf-lib';
import { launchChrome } from '../shared/chrome.js';
import { guardNetwork } from '../shared/network.js';
import { luminance, parseColor } from '../shared/color.js';
import { fontOf } from '../shared/font-stack.js';
import type { BrandRead } from './brand.js';
import type { KitColor } from './colors.js';
import type { Company, Terms } from './options.js';
import { contactLines } from './text.js';

// press-kit.pdf: one page with the brand's name, its description, its colors as swatches and a logo, drawn in Chrome. The page is a local
// string with no network: the logo is a data: address, and the only fonts are the ones the brand embeds. A page that cannot be drawn is
// the caller's to turn into a finding, never an exit 2, because everything else in the kit stands without it.

const PAGE = { width: 1123, height: 794 };
const MAX_SWATCHES = 10;
const MEDIA: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };

const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
/** A family name as a CSS string: nothing in a name can end it */
const quoted = (name: string): string => `"${name.replace(/[^A-Za-z0-9 _.-]+/g, '')}"`;

export interface PageInput {
  brand: Pick<BrandRead, 'title' | 'description' | 'roles' | 'stylesheets'>;
  colors: KitColor[];
  /** The logo to show, with the kind of background it is made for */
  logo?: { data: Buffer; format: string; surface: 'light' | 'dark' | 'unstated' };
  /** The `company` option: its description replaces the brand's, and its boilerplate and facts follow */
  company?: Company;
  /** The `note` option */
  note?: string;
  /** The `terms` option: one short block, with the rest in about.txt */
  terms?: Terms;
}

export interface Swatch {
  color: KitColor;
  label: string;
}

/**
 * The colors the page draws, and how many more the kit holds. A color is in a group by the path before its last segment (`color.blue.500` is
 * step 500 of `color.blue`). Groups run in the order their first token appears in the brand, each group's steps together in their own order,
 * and a group goes in whole: the first one is cut at ten when it is longer, and the walk stops at the first later group that does not fit
 * in the places left. A grouped color is labelled with its group and step (`blue 500`); a color straight under the top (`color.ink`) keeps its
 * short description, else its last segment. A color with no hex is not drawn.
 */
export function pickSwatches(colors: KitColor[]): { swatches: Swatch[]; more: number } {
  const groups = new Map<string, KitColor[]>();
  for (const color of colors.filter((item) => item.hex)) {
    const group = color.path.split('.').slice(0, -1).join('.');
    groups.set(group, [...(groups.get(group) ?? []), color]);
  }
  const swatches: Swatch[] = [];
  for (const [group, members] of groups) {
    if (swatches.length > 0 && swatches.length + members.length > MAX_SWATCHES) break;
    const parts = group.split('.');
    for (const color of members.slice(0, MAX_SWATCHES - swatches.length)) {
      const step = color.path.split('.').pop() ?? color.path;
      const label = parts.length >= 2 ? `${parts[parts.length - 1]} ${step}` : color.description && color.description.length <= 30 ? color.description : step;
      swatches.push({ color, label });
    }
  }
  return { swatches, more: colors.length - swatches.length };
}

/** The most of the terms' text the PDF holds: it is one page, and about.txt has the whole */
const TERMS_PDF_CHARS = 300;

export function pageHtml({ brand, colors, logo, company, note, terms }: PageInput): string {
  const display = fontOf(brand.roles.fontDisplay);
  const body = fontOf(brand.roles.fontBody);
  const stack = (name: string | undefined, generic: string) => [name && quoted(name), generic].filter(Boolean).join(', ');
  const { swatches, more } = pickSwatches(colors);
  const sheets = brand.stylesheets.filter((sheet) => sheet.startsWith('data:text/css')).map((sheet) => `<link rel="stylesheet" href="${escape(sheet)}">`);
  const dark = logo?.surface === 'dark';
  const image = logo ? `<img alt="" src="data:${MEDIA[logo.format] ?? 'application/octet-stream'};base64,${logo.data.toString('base64')}">` : '';
  const chips = swatches.map(({ color, label }) => {
    const rgb = parseColor(color.hex)!;
    const ink = luminance(rgb) > 0.4 ? '#111' : '#fff';
    return `<li style="background:${color.hex};color:${ink}"><b>${escape(label)}</b><span>${color.hex}</span></li>`;
  });
  const description = company?.description ?? brand.description;
  const about = [
    description ? `<p>${escape(description)}</p>` : '',
    company?.boilerplate ? `<p class="boiler">${escape(company.boilerplate)}</p>` : '',
    company?.facts ? `<dl class="facts">${company.facts.map((fact) => `<dt>${escape(fact.label)}</dt><dd>${escape(fact.value)}</dd>`).join('')}</dl>` : '',
    company?.contact
      ? `<p class="contact">${contactLines(company.contact)
          .map(({ label, value }) => `<span>${escape(label)}: ${escape(value)}</span>`)
          .join('')}</p>`
      : '',
    terms ? termsBlock(terms) : '',
  ].join('');
  return `<!doctype html><meta charset="utf-8"><title>${escape(brand.title)}</title>${sheets.join('')}<style>
@page{size:${PAGE.width}px ${PAGE.height}px;margin:0}
*{box-sizing:border-box}html,body{margin:0}
body{width:${PAGE.width}px;height:${PAGE.height}px;display:grid;grid-template-columns:40% 60%;font:18px/1.5 ${stack(body, 'sans-serif')};color:#161616;background:#fff}
.logo{display:flex;align-items:center;justify-content:center;padding:64px;background:${dark ? '#161616' : '#f4f4f2'}}
.logo img{max-width:100%;max-height:280px}
main{display:flex;flex-direction:column;justify-content:space-between;padding:64px}
h1{margin:0 0 16px;font:700 56px/1.05 ${stack(display, 'sans-serif')}}
p{margin:0;max-width:34em;color:#444}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
li{height:96px;padding:10px 12px;display:flex;flex-direction:column;justify-content:flex-end;font-size:13px;line-height:1.3;border:1px solid #0002}
li b{font-weight:600}
small{display:block;margin-top:12px;color:#666;font-size:13px}
p+p{margin-top:12px}.boiler{font-size:14px}
.facts{margin:16px 0 0;display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:13px;line-height:1.4}.facts dt{color:#666}.facts dd{margin:0}
.contact{margin:16px 0 0;display:flex;flex-wrap:wrap;gap:2px 16px;font-size:13px;line-height:1.4}.terms{margin:12px 0 0;font-size:12px;line-height:1.4;color:#444}.terms b{color:#161616}
.note{margin-top:16px;padding:8px 12px;border-left:3px solid #999;background:#f4f4f2;font-size:13px}
</style><body><section class="logo">${image}</section><main><div><h1>${escape(brand.title)}</h1>${about}</div><div><ul>${chips.join('')}</ul>${more > 0 ? `<small>${more} more in colors/colors.txt</small>` : ''}${note ? `<p class="note">${escape(note)}</p>` : ''}</div></main>`;
}

/** The terms as one short block: the start of the text and the address, with a pointer to about.txt when the text is cut */
function termsBlock(terms: Terms): string {
  const text = terms.text && terms.text.length > TERMS_PDF_CHARS ? `${terms.text.slice(0, TERMS_PDF_CHARS).replace(/\s+\S*$/, '')}... (all of it in about.txt)` : terms.text;
  return `<p class="terms"><b>Terms of use</b> ${text ? escape(text.replace(/\s+/g, ' ')) : ''}${terms.url ? ` ${escape(terms.url)}` : ''}</p>`;
}

/** The page as a PDF, with the dates and the producer fixed so the same brand gives the same bytes */
export async function drawPdf(input: PageInput, env: NodeJS.ProcessEnv): Promise<Buffer> {
  const browser = await launchChrome(env, 'draw the PDF with');
  try {
    const page = await browser.newPage({ viewport: PAGE });
    await guardNetwork(page, { page: 'press-kit.pdf' });
    await page.setContent(pageHtml(input));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    });
    const printed = await page.pdf({ width: `${PAGE.width}px`, height: `${PAGE.height}px`, printBackground: true, preferCSSPageSize: true });
    const pdf = await PDFDocument.load(printed);
    pdf.setTitle(`${input.brand.title}: press kit`);
    pdf.setCreator('blazon.press-kit');
    pdf.setProducer('blazon.press-kit');
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  } finally {
    await browser.close();
  }
}
