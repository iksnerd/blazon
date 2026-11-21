import { contrast, parseColor } from '../shared/color.js';
import type { BrandRead } from './brand.js';
import type { KitColor } from './colors.js';
import { fallbackLine, fontRows, type KitFonts } from './fonts.js';
import { dimensionsText, measureText, type Chosen, type Surface } from './logos.js';
import type { Company, Terms } from './options.js';
import { contactLines } from './text.js';

// index.html: the kit as one page for a person who opens the folder in a browser. It is drawn from the same data the text files and the PDF
// are written from (`Kit`), and it is one static file: inline CSS, no script, no remote font or image, the logos by relative paths to the
// files the kit holds. Every string the brand supplies goes through `esc`. The page's own text is neutral (a system font, fixed colors that
// pass 4.5:1 on white); the brand's colors appear only as swatches, and a swatch's label is black or white, whichever contrasts more.

/** What the page shows: what the options, the brand and the kit's other files say */
export interface Kit {
  brand: Pick<BrandRead, 'title' | 'description'>;
  company?: Company;
  terms?: Terms;
  note?: string;
  /** The logos in the kit, each with the path it has there */
  logos: Chosen[];
  colors: KitColor[];
  /** What fonts.txt says, as data: the page is drawn from it, not from the text */
  fonts?: KitFonts;
  /** Every path in the kit, to link a file only when it is there */
  paths: string[];
}

/** Text for an HTML text or a double-quoted attribute; each character that could end either is a numeric reference */
const esc = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const paragraphs = (text: string): string =>
  text
    .split(/\n\s*\n/)
    .map((part) => `<p>${esc(part.trim())}</p>`)
    .join('');
const isWeb = (value: string): boolean => /^https?:\/\/[^\s"'<>]+$/i.test(value);
const isEmail = (value: string): boolean => /^[^\s@<>"']+@[^\s@<>"']+$/.test(value);
const link = (value: string): string => (isWeb(value) ? `<a href="${esc(value)}">${esc(value)}</a>` : esc(value));
const dl = (rows: { label: string; html: string }[], className = ''): string =>
  `<dl${className ? ` class="${className}"` : ''}>${rows.map(({ label, html }) => `<dt>${esc(label)}</dt><dd>${html}</dd>`).join('')}</dl>`;
const section = (title: string, body: string): string => `<section><h2>${esc(title)}</h2>${body}</section>`;

const BLACK = '#000000';
const WHITE = '#ffffff';
/** The label color for a swatch: the one of black and white that contrasts more, which is always at least 4.58:1 */
function labelInk(hex: string): string {
  const rgb = parseColor(hex);
  if (!rgb) return BLACK;
  return contrast(rgb, parseColor(BLACK)!) >= contrast(rgb, parseColor(WHITE)!) ? BLACK : WHITE;
}

const SURFACES: [Surface, string][] = [
  ['light', 'For light backgrounds'],
  ['dark', 'For dark backgrounds'],
  ['unstated', 'Background not stated'],
];

function logoBlock({ asset, surface, kitPath }: Chosen): string {
  const { meta } = asset;
  const file = kitPath.split('/').pop()!;
  const alt = meta.description || meta.title || asset.id.split('/').pop() || file;
  const rules = [
    meta.lockup && { label: 'Lockup', html: esc(meta.lockup) },
    meta.clearSpace && { label: 'Clear space on every side', html: esc(measureText(meta.clearSpace, meta)) },
    meta.minSize && { label: 'Smallest size', html: esc(dimensionsText(meta.minSize)) },
    meta.maxSize && { label: 'Largest size', html: esc(dimensionsText(meta.maxSize)) },
    meta.ink && { label: 'Main color', html: esc(meta.ink) },
  ].filter((row): row is { label: string; html: string } => Boolean(row));
  const list = (title: string, items?: string[]) => (items && items.length > 0 ? `<h4>${title}</h4><ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '');
  return `<article class="logo"><div class="plate ${surface === 'dark' ? 'plate-dark' : ''}"><img src="${esc(kitPath)}" alt="${esc(alt)}"></div><p class="file"><strong>${esc(file)}</strong> <a href="${esc(kitPath)}" download aria-label="Download ${esc(file)}">Download</a></p>${meta.description ? `<p>${esc(meta.description)}</p>` : ''}${rules.length > 0 ? dl(rules, 'rules') : ''}${list('Do', meta.do)}${list('Do not', meta.dont)}</article>`;
}

function colorBlock(color: KitColor): string {
  const name = color.description && color.description.length <= 60 ? `${color.description} (${color.path})` : color.path;
  const rows = [
    color.hex && { label: 'HEX', html: esc(color.hex) },
    color.rgb && { label: 'RGB', html: esc(color.rgb.join(', ')) },
    !color.hex && { label: 'As written', html: esc(color.value) },
    color.print?.cmyk && { label: 'CMYK', html: esc(color.print.cmyk.join(', ')) },
    color.print?.pms && { label: 'Pantone', html: esc(color.print.pms) },
    color.print?.ral && { label: 'RAL', html: esc(color.print.ral) },
    color.usedAs.length > 0 && { label: 'Also named', html: esc(color.usedAs.join(', ')) },
  ].filter((row): row is { label: string; html: string } => Boolean(row));
  const swatch = color.hex ? `<div class="swatch" style="background:${esc(color.hex)};color:${labelInk(color.hex)}">${esc(color.hex)}</div>` : '';
  return `<li class="color">${swatch}<p class="name"><strong>${esc(name)}</strong>${color.review ? ' (unreviewed)' : ''}</p>${dl(rows)}</li>`;
}

const STYLE = `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#ffffff;color:#1a1a1a;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:60rem;margin:0 auto;padding:2rem 1rem 4rem}
h1{margin:0 0 .5rem;font-size:2.25rem;line-height:1.15}
h2{margin:2.5rem 0 1rem;padding-top:1rem;border-top:1px solid #d0d0d0;font-size:1.4rem}
h3{margin:1.5rem 0 .75rem;font-size:1.1rem}
h4{margin:.75rem 0 .25rem;font-size:.95rem}
p{margin:0 0 .75rem;overflow-wrap:anywhere}
a{color:#0b4f9c}
.lead{font-size:1.15rem;max-width:42rem}
dt{color:#595959}
dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.25rem 1rem;margin:0 0 .75rem}
dd{margin:0;overflow-wrap:anywhere;white-space:pre-line}
ul{margin:0 0 .75rem;padding-left:1.25rem}
.terms p,.note{white-space:pre-line}
.note{padding:.5rem .75rem;border-left:3px solid #8a8a8a;background:#f4f4f2}
.logos,.colors{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr));gap:1.5rem}
.logo{min-width:0}
.plate{display:flex;align-items:center;justify-content:center;height:9rem;padding:1.5rem;margin-bottom:.5rem;border:1px solid #d0d0d0;background:#f4f4f2}
.plate-dark{background:#161616}
.plate img{display:block;max-width:100%;max-height:7rem;height:auto}
.rules{font-size:.9rem}
.swatch{display:flex;align-items:flex-end;height:5rem;padding:.5rem .75rem;border:1px solid #d0d0d0;font:600 .9rem/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.color{min-width:0}
.color .name{margin:.5rem 0 .25rem}
.color dl{font-size:.9rem}
.fonts{margin:0 0 1rem}`;

/** The page, as one string */
export function kitPage(kit: Kit): string {
  const { brand, company, terms, note } = kit;
  const description = company?.description ?? brand.description;
  const parts: string[] = [];

  if (company?.boilerplate) parts.push(section('About', paragraphs(company.boilerplate)));
  if (company?.facts) parts.push(section('Facts', dl(company.facts.map((fact) => ({ label: fact.label, html: esc(fact.value) })))));
  if (company?.contact) {
    const rows = contactLines(company.contact).map(({ label, value }) => ({
      label,
      html: label === 'Email' && isEmail(value) ? `<a href="mailto:${esc(value)}">${esc(value)}</a>` : label === 'Web' ? link(value) : esc(value),
    }));
    parts.push(section('Contact', dl(rows)));
  }
  if (kit.logos.length > 0) {
    const groups = SURFACES.flatMap(([surface, title]) => {
      const items = kit.logos.filter((item) => item.surface === surface);
      return items.length > 0 ? [`<h3>${title}</h3><div class="logos">${items.map(logoBlock).join('')}</div>`] : [];
    });
    parts.push(section('Logos', groups.join('')));
  }
  if (kit.colors.length > 0) {
    const files = ['colors/colors.css', 'colors/colors.json'].filter((file) => kit.paths.includes(file));
    parts.push(
      section(
        'Colors',
        `<ul class="colors">${kit.colors.map(colorBlock).join('')}</ul>${files.length > 0 ? `<p>${files.map((file) => `<a href="${esc(file)}" download>${esc(file)}</a>`).join(' ')}</p>` : ''}`,
      ),
    );
  }
  if (kit.fonts) {
    const body = kit.fonts.families.map((font) => {
      const rows = fontRows(font).map((row) => ({
        label: row.label,
        html: esc(
          row.block
            ? row.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .join('\n')
            : row.value,
        ),
      }));
      return `<div class="fonts"><h3>${esc(font.name)}</h3>${dl(rows)}</div>`;
    });
    const fallback = fallbackLine(kit.fonts);
    if (fallback) body.push(`<p>${esc(fallback)}</p>`);
    if (body.length > 0) parts.push(section('Fonts', body.join('')));
  }
  if (terms) parts.push(section('Terms of use', `<div class="terms">${terms.text ? paragraphs(terms.text) : ''}${terms.url ? `<p>Full terms: ${link(terms.url)}</p>` : ''}</div>`));
  if (note) parts.push(section('Note', `<p class="note">${esc(note)}</p>`));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand.title)}: press kit</title>
<style>
${STYLE}
</style>
</head>
<body>
<main>
<header><h1>${esc(brand.title)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</header>
${parts.join('\n')}
</main>
</body>
</html>
`;
}
