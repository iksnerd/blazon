// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { alignNumericColumns, isNumericCell } from '../../src/viewer/lib/markup/numeric-columns';

// docs/04.2-numbers.md of a brand says a column of amounts lines up in tabular figures on the decimal sign. Blazon can tell
// a numeric column only from its cells: a column is aligned when every body cell is a number, never a mixed one.

const table = (rows: string[][], head = ['Case', 'Written']) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const styled = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('tr')].map((tr) =>
    [...tr.children].map((c) => /text-align:right/.test(c.getAttribute('style') ?? '') && /tabular-nums/.test(c.getAttribute('style') ?? '')),
  );
};

describe('alignNumericColumns', () => {
  it('right-aligns, in tabular figures, a column that is numeric in every body cell, header included', () => {
    const html = alignNumericColumns(
      table([
        ['Amount', '14 000.00 €'],
        ['Small', '4.80 €'],
        ['Negative', '-80.00 €'],
      ]),
    );
    expect(styled(html)).toEqual([
      [false, true],
      [false, true],
      [false, true],
      [false, true],
    ]);
  });

  it('takes a percent, a size and a decimal comma', () => {
    for (const cell of ['4.25%', '150 px', '14 000,00', '+20.22 €', '12']) expect(isNumericCell(cell), cell).toBe(true);
  });

  it('leaves a mixed column, a word column and a range alone', () => {
    const html = alignNumericColumns(
      table([
        ['a', '4.25%'],
        ['b', 'n/a'],
        ['c', '1-2'],
        ['d', '14.03.2026, 16:21'],
      ]),
    );
    expect(styled(html).flat().some(Boolean)).toBe(false);
    for (const cell of ['n/a', '1-2', '14.03.2026, 16:21', 'Blue #3F73F8', '']) expect(isNumericCell(cell), cell).toBe(false);
  });

  it('leaves a table with a merged cell, and html without a table, as it was', () => {
    const merged = '<table><tbody><tr><td colspan="2">1</td></tr><tr><td>2</td><td>3</td></tr></tbody></table>';
    expect(alignNumericColumns(merged)).toBe(merged);
    expect(alignNumericColumns('<p>"4.25%"</p>')).toBe('<p>"4.25%"</p>');
  });
});
