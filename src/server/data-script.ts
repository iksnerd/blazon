import type { BlazonData } from '../types/index.js';

/** Id of the inline JSON script the prebuilt viewer reads its BlazonData from. */
export const DATA_SCRIPT_ID = 'blazon-data';

/** JSON safe inside a <script> element: escaping "<" means no "</script>" or "<!--" can end it early. */
export function serializeBlazonData(data: BlazonData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Writes the brand book's data into the prebuilt viewer's index.html. */
export function injectBlazonData(html: string, data: BlazonData): string {
  if (!html.includes('</head>')) throw new Error('[blazon] viewer index.html has no </head>');
  const script = `<script id="${DATA_SCRIPT_ID}" type="application/json">${serializeBlazonData(data)}</script>`;
  return html.replace('</head>', () => `    ${script}\n  </head>`);
}
