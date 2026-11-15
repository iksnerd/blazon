/**
 * A table column whose body cells are all numbers (an amount, a percent, a size) lines up on its decimal sign: right
 * aligned, in tabular figures. Only a column that is numeric in every body cell is touched, so a mixed column (a number
 * and a word, a range, a date) keeps the alignment it has. Blazon reads the cell text and nothing else.
 */

/** A number as the brand writes it (docs/04.2): optional sign, optional currency sign, grouped digits with a decimal dot or comma, optional unit. */
const NUMBER =
  /^[-+−]?\s?[$€£]?\s?\d{1,3}(?:[ \u00a0\u202f,.']\d{3})*(?:[.,]\d+)?(?:\s?(?:%|‰|€|EUR|BGN|USD|px|pt|em|rem|ms|s|×|x))?$|^[-+−]?\s?[$€£]?\s?\d+(?:[.,]\d+)?(?:\s?(?:%|‰|€|EUR|BGN|USD|px|pt|em|rem|ms|s|×|x))?$/;

export const isNumericCell = (text: string): boolean => NUMBER.test(text.trim());

const STYLE = 'text-align:right;font-variant-numeric:tabular-nums';

/** The html with each all-numeric column of each table aligned. Html without a table comes back as it was. */
export function alignNumericColumns(html: string): string {
  if (!/<table[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  let changed = false;
  for (const table of root.querySelectorAll('table')) {
    // A merged cell breaks the idea of a column
    if (table.querySelector('[colspan], [rowspan]')) continue;
    const rows = [...table.querySelectorAll('tbody > tr')].map((tr) => [...tr.children] as HTMLElement[]);
    const head = [...table.querySelectorAll('thead > tr')].map((tr) => [...tr.children] as HTMLElement[]);
    const width = Math.max(0, ...rows.map((r) => r.length));
    if (rows.length === 0 || rows.some((r) => r.length !== width)) continue;
    for (let col = 0; col < width; col++) {
      if (!rows.every((r) => isNumericCell(r[col]!.textContent ?? ''))) continue;
      for (const cell of [...rows.map((r) => r[col]!), ...head.map((r) => r[col]).filter((c): c is HTMLElement => c !== undefined)]) {
        cell.setAttribute('style', [cell.getAttribute('style'), STYLE].filter(Boolean).join(';'));
        changed = true;
      }
    }
  }
  return changed ? root.innerHTML : html;
}
