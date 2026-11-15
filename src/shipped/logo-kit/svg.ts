import type { ClearSpacePiece, InitiativePiece, PartnershipPiece } from './kit.js';

// The kit's SVG, as text. The logos are embedded as data: images, so a file stands alone; an SVG logo inside an <image> cannot run
// script or fetch anything.

const num = (value: number): string => String(Number(value.toFixed(4)));
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const title = (text: string) => `<title>${escape(text)}</title>`;

/** What the divider and the band are drawn in, from what the sidecar says the logo is made for. */
export function inkOf(piece: { logo: { meta: { ink?: string; background?: 'light' | 'dark' } } }): string {
  const { ink, background } = piece.logo.meta;
  return ink && /^#[0-9a-f]{3,8}$/i.test(ink.trim()) ? ink.trim() : background === 'dark' ? '#FFFFFF' : '#000000';
}

/** The logo, a divider and the partner on one baseline, on no background: a file for placing on a surface. */
export function partnershipSvg(piece: PartnershipPiece, href: { logo: string; partner: string }): string {
  const { layout, logo, partner } = piece;
  const box = (b: { x: number; y: number; width: number; height: number }, source: string) =>
    `<image href="${source}" x="${num(b.x)}" y="${num(b.y)}" width="${num(b.width)}" height="${num(b.height)}"/>`;
  const divider = layout.divider
    ? `<line x1="${num(layout.divider.x)}" x2="${num(layout.divider.x)}" y1="${num(layout.divider.y1)}" y2="${num(layout.divider.y2)}" stroke="${inkOf(piece)}" stroke-width="${num(layout.divider.stroke)}"/>`
    : '';
  const label = `${logo.id} and ${partner.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width)}" height="${num(layout.height)}" viewBox="0 0 ${num(layout.width)} ${num(layout.height)}" role="img" aria-label="${escape(label)}">${title(label)}${box(layout.logo, href.logo)}${divider}${box(layout.partner, href.partner)}</svg>\n`;
}

/** The logo and the mark of its program, beside or under it, on no background. */
export function initiativeSvg(piece: InitiativePiece, href: { logo: string; mark: string }): string {
  const { layout, logo, name } = piece;
  const box = (b: { x: number; y: number; width: number; height: number }, source: string) =>
    `<image href="${source}" x="${num(b.x)}" y="${num(b.y)}" width="${num(b.width)}" height="${num(b.height)}"/>`;
  const label = `${logo.id}, ${name}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width)}" height="${num(layout.height)}" viewBox="0 0 ${num(layout.width)} ${num(layout.height)}" role="img" aria-label="${escape(label)}">${title(label)}${box(layout.logo, href.logo)}${box(layout.mark, href.mark)}</svg>\n`;
}

/** The logo inside a hatched, dashed band the width of its clear space, on the surface it is made for. */
export function clearSpaceSvg(piece: ClearSpacePiece, href: string): string {
  const { size, space, logo } = piece;
  const width = size.width + 2 * space;
  const height = size.height + 2 * space;
  const dark = logo.meta.background === 'dark';
  const surface = dark ? '#000000' : '#FFFFFF';
  const ink = inkOf(piece);
  const stroke = Math.max(1, size.height / 200);
  const label = `${logo.id}: clear space`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" role="img" aria-label="${escape(label)}">`,
    title(label),
    `<defs><pattern id="band" width="${num(stroke * 8)}" height="${num(stroke * 8)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${num(stroke * 8)}" stroke="${ink}" stroke-opacity="0.25" stroke-width="${num(stroke)}"/></pattern></defs>`,
    `<rect width="${num(width)}" height="${num(height)}" fill="${surface}"/>`,
    `<path fill-rule="evenodd" fill="url(#band)" d="M0 0H${num(width)}V${num(height)}H0Z M${num(space)} ${num(space)}V${num(space + size.height)}H${num(space + size.width)}V${num(space)}Z"/>`,
    `<rect x="${num(space)}" y="${num(space)}" width="${num(size.width)}" height="${num(size.height)}" fill="none" stroke="${ink}" stroke-width="${num(stroke)}" stroke-dasharray="${num(stroke * 6)} ${num(stroke * 4)}"/>`,
    `<image href="${href}" x="${num(space)}" y="${num(space)}" width="${num(size.width)}" height="${num(size.height)}"/>`,
    `</svg>\n`,
  ].join('');
}
