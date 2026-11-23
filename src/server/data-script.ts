import type { BlazonData } from '../types/index.js';

/** Id of the inline JSON script the prebuilt viewer reads its BlazonData from. */
export const DATA_SCRIPT_ID = 'blazon-data';

/** JSON safe inside a <script> element: escaping "<" means no "</script>" or "<!--" can end it early. */
export function serializeBlazonData(data: BlazonData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Text inside a tag or an attribute value: every character that could end it or start markup becomes a numeric reference. */
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The page's own name in its HTML: the `<title>` and the description and Open Graph tags, from the brand's title and description. The
 * viewer sets `document.title` itself once its script runs, but a link preview, a search result and the tab while the page loads read the
 * HTML, which would otherwise say "Brand Book" for every brand. No description tag when the brand has no description.
 */
export function withBrandHead(html: string, data: Pick<BlazonData, 'title' | 'description'>): string {
  const title = typeof data.title === 'string' && data.title !== '' ? data.title : undefined;
  const description = typeof data.description === 'string' && data.description !== '' ? data.description : undefined;
  let page = html;
  if (title !== undefined) {
    const tag = `<title>${escapeHtml(title)}</title>`;
    page = /<title>[\s\S]*?<\/title>/i.test(page) ? page.replace(/<title>[\s\S]*?<\/title>/i, () => tag) : page.replace('</head>', () => `    ${tag}\n  </head>`);
  }
  const tags = [
    ...(description !== undefined ? [`<meta name="description" content="${escapeHtml(description)}" />`] : []),
    ...(title !== undefined ? [`<meta property="og:title" content="${escapeHtml(title)}" />`] : []),
    ...(description !== undefined ? [`<meta property="og:description" content="${escapeHtml(description)}" />`] : []),
    ...(title !== undefined ? ['<meta property="og:type" content="website" />'] : []),
  ];
  return tags.length === 0 ? page : page.replace('</head>', () => `${tags.map((tag) => `    ${tag}`).join('\n')}\n  </head>`);
}

/** Writes the brand book's data, and the brand's own page title and description, into the prebuilt viewer's index.html. */
export function injectBlazonData(html: string, data: BlazonData): string {
  if (!html.includes('</head>')) throw new Error('[blazon] viewer index.html has no </head>');
  const script = `<script id="${DATA_SCRIPT_ID}" type="application/json">${serializeBlazonData(data)}</script>`;
  return withBrandHead(
    html.replace('</head>', () => `    ${script}\n  </head>`),
    data,
  );
}
