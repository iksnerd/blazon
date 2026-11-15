// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { BlazonData } from '../../src/types/index.js';

const VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Brand Book</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

function dataWith(description: string): BlazonData {
  return { title: 'Acme', description } as BlazonData;
}

/** What the viewer does in the browser: parse the page, then read the JSON script. */
function readBack(html: string): { data: BlazonData; scripts: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = doc.getElementById('blazon-data');
  return { data: JSON.parse(script?.textContent ?? 'null'), scripts: doc.querySelectorAll('script').length };
}

describe('injectBlazonData', () => {
  it('puts the brand book data where the viewer reads it', () => {
    const { data } = readBack(injectBlazonData(VIEWER_HTML, dataWith('Plain text')));
    expect(data).toEqual({ title: 'Acme', description: 'Plain text' });
  });

  it('keeps markup in brand content from closing the script early', () => {
    const hostile = '</script><script>alert(1)</script><!-- & "quotes"';
    const { data, scripts } = readBack(injectBlazonData(VIEWER_HTML, dataWith(hostile)));
    expect(data.description).toBe(hostile);
    expect(scripts).toBe(1);
  });

  it('refuses a viewer page with no head', () => {
    expect(() => injectBlazonData('<div id="root"></div>', dataWith('x'))).toThrow(/no <\/head>/);
  });
});
