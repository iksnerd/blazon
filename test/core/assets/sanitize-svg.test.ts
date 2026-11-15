// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../../../src/viewer/lib/markup/sanitize';

const HOSTILE = [
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" onload="alert(1)">',
  '<script>alert(2)</script>',
  '<a href="javascript:alert(3)"><path d="M0 0h24v24H0z"/></a>',
  '<use xlink:href="javascript:alert(4)"/>',
  '<foreignObject><iframe src="https://evil.example"></iframe></foreignObject>',
  '<animate attributeName="href" values="javascript:alert(5)"/>',
  '<circle cx="12" cy="12" r="4" fill="#635DFF" onclick="alert(6)"/>',
  '</svg>',
].join('');

describe('sanitizeSvg', () => {
  const clean = sanitizeSvg(HOSTILE);

  it('removes scripts, event handlers, javascript: URLs and foreignObject', () => {
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/\son\w+=/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/foreignObject|iframe/i);
    expect(clean).not.toMatch(/alert\(/);
  });

  it('keeps the drawing', () => {
    expect(clean).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
    expect(clean).toContain('<path d="M0 0h24v24H0z"');
    expect(clean).toContain('<circle cx="12" cy="12" r="4" fill="#635DFF"');
  });

  it('returns an empty string for markup that is not an SVG', () => {
    expect(sanitizeSvg('<img src=x onerror="alert(7)">')).toBe('');
  });
});
