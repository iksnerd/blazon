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

  const docOf = (html: string) => new DOMParser().parseFromString(html, 'text/html');
  const meta = (doc: Document, selector: string) => doc.querySelector(selector)?.getAttribute('content');

  it("sets the page title to the brand's own, where a browser tab, a link preview and a search result read it before any script runs", () => {
    const doc = docOf(injectBlazonData(VIEWER_HTML, { title: 'Acme Brand Book', description: 'How Acme looks' } as BlazonData));
    expect(doc.title).toBe('Acme Brand Book');
    expect(doc.querySelectorAll('title')).toHaveLength(1);
    expect(meta(doc, 'meta[name="description"]')).toBe('How Acme looks');
    expect(meta(doc, 'meta[property="og:title"]')).toBe('Acme Brand Book');
    expect(meta(doc, 'meta[property="og:description"]')).toBe('How Acme looks');
  });

  it('writes no description tag for a brand with no description, and still names the page', () => {
    const doc = docOf(injectBlazonData(VIEWER_HTML, { title: 'Acme' } as BlazonData));
    expect(doc.title).toBe('Acme');
    expect(doc.querySelector('meta[name="description"]')).toBeNull();
    expect(doc.querySelector('meta[property="og:description"]')).toBeNull();
    expect(meta(doc, 'meta[property="og:title"]')).toBe('Acme');
  });

  it('keeps markup in a title or description inside its tag', () => {
    const hostile = '</title><script>alert(1)</script>"><img src=x onerror=alert(1)> & <b>';
    const doc = docOf(injectBlazonData(VIEWER_HTML, { title: hostile, description: hostile } as BlazonData));
    expect(doc.title).toBe(hostile);
    expect(meta(doc, 'meta[name="description"]')).toBe(hostile);
    expect(meta(doc, 'meta[property="og:title"]')).toBe(hostile);
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('img')).toBeNull();
  });

  it('adds a title to a page that has none', () => {
    const doc = docOf(injectBlazonData('<html><head></head><body></body></html>', { title: 'Acme' } as BlazonData));
    expect(doc.title).toBe('Acme');
  });

  it('refuses a viewer page with no head', () => {
    expect(() => injectBlazonData('<div id="root"></div>', dataWith('x'))).toThrow(/no <\/head>/);
  });
});
