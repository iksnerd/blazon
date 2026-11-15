import { normalizeColor } from '../../drift/compare.js';

/** A color value as hex, from hex or rgb(); undefined for anything else. `exact` is false when a conversion was needed. */
export function toHex(value: string): { hex: string; exact: boolean } | undefined {
  const text = value.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return { hex: normalizeColor(text), exact: true };
  const m = text.match(/^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (!m) return undefined;
  const channel = (n: string) => Math.max(0, Math.min(255, Math.round(m[2] ? (Number(n) * 255) / 100 : Number(n))));
  const hex2 = (n: number) => n.toString(16).padStart(2, '0');
  let hex = `#${hex2(channel(m[1]!))}${hex2(channel(m[3]!))}${hex2(channel(m[4]!))}`;
  if (m[5] !== undefined) {
    const alpha = Math.max(0, Math.min(1, m[6] ? Number(m[5]) / 100 : Number(m[5])));
    if (alpha < 1) hex += hex2(Math.round(alpha * 255));
  }
  return { hex, exact: false };
}
