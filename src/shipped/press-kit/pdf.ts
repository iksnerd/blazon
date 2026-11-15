import { PDFDocument } from 'pdf-lib';
import { launchChrome } from '../shared/chrome.js';
import { luminance, parseColor } from '../shared/color.js';
import { fontOf } from '../shared/font-stack.js';
import type { BrandRead } from './brand.js';
import type { KitColor } from './colors.js';

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
}

export function pageHtml({ brand, colors, logo }: PageInput): string {
  const display = fontOf(brand.roles.fontDisplay);
  const body = fontOf(brand.roles.fontBody);
  const stack = (name: string | undefined, generic: string) => [name && quoted(name), generic].filter(Boolean).join(', ');
  const swatches = colors.filter((color) => color.hex).slice(0, MAX_SWATCHES);
  const more = colors.length - swatches.length;
  const sheets = brand.stylesheets.filter((sheet) => sheet.startsWith('data:text/css')).map((sheet) => `<link rel="stylesheet" href="${escape(sheet)}">`);
  const dark = logo?.surface === 'dark';
  const image = logo ? `<img alt="" src="data:${MEDIA[logo.format] ?? 'application/octet-stream'};base64,${logo.data.toString('base64')}">` : '';
  const chips = swatches.map((color) => {
    const rgb = parseColor(color.hex)!;
    const ink = luminance(rgb) > 0.4 ? '#111' : '#fff';
    return `<li style="background:${color.hex};color:${ink}"><b>${escape(color.description && color.description.length <= 30 ? color.description : (color.path.split('.').pop() ?? color.path))}</b><span>${color.hex}</span></li>`;
  });
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
</style><body><section class="logo">${image}</section><main><div><h1>${escape(brand.title)}</h1>${brand.description ? `<p>${escape(brand.description)}</p>` : ''}</div><div><ul>${chips.join('')}</ul>${more > 0 ? `<small>${more} more in colors/colors.txt</small>` : ''}</div></main>`;
}

/** The page as a PDF, with the dates and the producer fixed so the same brand gives the same bytes */
export async function drawPdf(input: PageInput, env: NodeJS.ProcessEnv): Promise<Buffer> {
  const browser = await launchChrome(env, 'draw the PDF with');
  try {
    const page = await browser.newPage({ viewport: PAGE });
    await page.route('**/*', (route) => route.abort());
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
