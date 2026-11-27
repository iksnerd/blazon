import type { XmlElement } from './xml.js';

// Which elements of an SVG can paint. The logo checker and the logo-geometry plugin both read a logo and both leave out what is never drawn.

/**
 * Elements that paint nothing where they stand: a clip, a mask, a pattern tile or a definition is drawn only when something refers to it
 * (and what a clip or mask holds is never ink). Gradients are in this set too: they are paint servers, read by `fill="url(#id)"`, not
 * painted shapes. A `symbol` is drawn through a `<use>`.
 */
export const UNPAINTED = new Set(['defs', 'clipPath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'style', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker']);

/** The declarations of an element's `style` attribute. */
export function styleOf(element: XmlElement): Map<string, string> {
  const style = new Map<string, string>();
  for (const part of (element.attrs.get('style') ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) style.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return style;
}

/** A property of an element: its style, then its attribute. */
export const property = (element: XmlElement, style: Map<string, string>, name: string): string | undefined => style.get(name) ?? element.attrs.get(name);

/** Whether an element is made invisible by its own properties (and so is everything under it, as far as this reader goes): hidden, or an opacity of 0. */
export const isInvisible = (element: XmlElement, style: Map<string, string>): boolean =>
  property(element, style, 'visibility') === 'hidden' || Number(property(element, style, 'opacity') ?? 1) === 0 || Number(property(element, style, 'fill-opacity') ?? 1) === 0;
