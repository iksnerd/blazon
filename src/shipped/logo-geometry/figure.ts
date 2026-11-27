import { coordinate as fmt, round, signed } from './numbers.js';
import { AXES, type Measurement } from './measure.js';
import { readSvg } from './svg.js';

// The construction figure: the logo with its measurements drawn over it, in the shape of the construction pages of brand guidelines. The
// artwork is embedded as an image, so the figure shows it exactly as it is and carries no script.

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The figure for an SVG logo already measured, as text. The same measurement draws the same bytes. */
export function constructionSvg(svgText: string, result: Measurement & { box: NonNullable<Measurement['box']> }, accent: string, name: string): string {
  const { viewBox } = readSvg(svgText);
  const { box } = result;
  const pad = Math.max(box.w, box.h) * 0.12;
  const [x0, y0] = [box.x - pad, box.y - pad];
  const [w, h] = [box.w + 2 * pad, box.h + 2 * pad];
  const captionHeight = Math.max(box.w, box.h) * 0.2;
  const unit = Math.max(box.w, box.h) / 100;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svgText, 'utf-8').toString('base64')}`;
  const total = fmt(h + captionHeight);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${total}" role="img" aria-label="${escape(name)} construction">`,
    `<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(w)}" height="${total}" fill="#ffffff"/>`,
    `<image x="${fmt(viewBox[0])}" y="${fmt(viewBox[1])}" width="${fmt(viewBox[2])}" height="${fmt(viewBox[3])}" href="${uri}"/>`,
  ];
  const step = result.grid?.stated ?? result.grid?.detected;
  if (step) {
    const gridStroke = `stroke="${accent}" stroke-opacity="0.25" stroke-width="${fmt(unit * 0.25)}"`;
    for (let k = Math.ceil(box.x / step - 1e-9); k * step <= box.x + box.w + 1e-9; k++)
      parts.push(`<line class="grid" x1="${fmt(k * step)}" y1="${fmt(box.y)}" x2="${fmt(k * step)}" y2="${fmt(box.y + box.h)}" ${gridStroke}/>`);
    for (let k = Math.ceil(box.y / step - 1e-9); k * step <= box.y + box.h + 1e-9; k++)
      parts.push(`<line class="grid" x1="${fmt(box.x)}" y1="${fmt(k * step)}" x2="${fmt(box.x + box.w)}" y2="${fmt(k * step)}" ${gridStroke}/>`);
  }
  parts.push(
    `<rect class="box" x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.w)}" height="${fmt(box.h)}" fill="none" stroke="${accent}" stroke-width="${fmt(unit * 0.4)}"/>`,
  );
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const dash = `stroke-dasharray="${fmt(unit * 2)} ${fmt(unit * 1.5)}"`;
  parts.push(
    `<line class="axis" x1="${fmt(cx)}" y1="${fmt(y0 + pad * 0.4)}" x2="${fmt(cx)}" y2="${fmt(box.y + box.h + pad * 0.6)}" stroke="${accent}" stroke-width="${fmt(unit * 0.4)}" ${dash}/>`,
  );
  parts.push(
    `<line class="axis" x1="${fmt(x0 + pad * 0.4)}" y1="${fmt(cy)}" x2="${fmt(box.x + box.w + pad * 0.6)}" y2="${fmt(cy)}" stroke="${accent}" stroke-width="${fmt(unit * 0.4)}" ${dash}/>`,
  );
  const [bx, by] = [cx + result.balance.x * box.w, cy + result.balance.y * box.h];
  parts.push(`<circle class="center" cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(unit * 2.8)}" fill="none" stroke="${accent}" stroke-width="${fmt(unit * 0.4)}"/>`);
  parts.push(`<circle class="mass" cx="${fmt(bx)}" cy="${fmt(by)}" r="${fmt(unit * 1.6)}" fill="${accent}"/>`);
  const scores = AXES.flatMap((axis) => (result.symmetry[axis] ? [`${axis} ${round(result.symmetry[axis]!.silhouette * 100)}%`] : [])).join('  ');
  const held = result.axes.join(', ') || `no axis at ${round(result.tolerance * 100)}% or more`;
  const lines = [
    `${name}: ${held}`,
    scores,
    `center of mass (dot) ${signed(result.balance.x * 100, 1)}% x, ${signed(result.balance.y * 100, 1)}% y from the box center (ring)${step ? ` · grid ${step}` : ''}`,
  ];
  const size = unit * 3.2;
  lines.forEach((line, n) =>
    parts.push(
      `<text x="${fmt(x0 + pad * 0.5)}" y="${fmt(y0 + h + size * (1.6 + 1.5 * n))}" font-family="Helvetica, Arial, sans-serif" font-size="${fmt(size)}" fill="#1e1f21">${escape(line)}</text>`,
    ),
  );
  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}
