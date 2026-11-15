import type { PreviewKind, TokenItem } from '../../../types/index.js';

const KINDS: readonly PreviewKind[] = ['radius', 'square', 'stroke', 'tracking', 'fontSize', 'frame', 'opacity', 'border', 'bar'];

/**
 * The preview that says what a token is for: dev.blazon.preview when the brand sets it, else a guess
 * from the type and the name, falling back to a bar. Names are matched as words a brand would use.
 */
export function previewKind(token: TokenItem): PreviewKind | undefined {
  const explicit = token.blazon.preview;
  if (explicit && KINDS.includes(explicit)) return explicit;

  const name = token.name.toLowerCase();
  const path = token.path.toLowerCase();
  if (token.type === 'border') return 'border';
  if (token.type === 'number') return /opacity|alpha/.test(name) ? 'opacity' : undefined;
  if (token.type !== 'dimension') return undefined;
  if (/radius|radii|corner/.test(path)) return 'radius';
  if (/letterspacing|tracking|kerning/.test(name)) return 'tracking';
  if (/fontsize/.test(name)) return 'fontSize';
  if (/stroke|linewidth|borderwidth/.test(name)) return 'stroke';
  if (/canvas|artboard|frame/.test(name)) return 'frame';
  if (/size|grid/.test(name)) return 'square';
  return 'bar';
}

/** CSS pixels for a dimension value: px as is, rem and em at 16px. Undefined for anything else. */
export function toPx(value: string | number): number | undefined {
  const match = String(value)
    .trim()
    .match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return match[2] === 'rem' || match[2] === 'em' ? n * 16 : n;
}
