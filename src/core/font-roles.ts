import { FONT_FALLBACK_FOR_MAX, FONT_REASON_MAX, FONT_ROLES, type FontMeta } from '../types/index.js';

// Kept apart from fonts.ts, which reads files: the brand book's viewer and the press kit plugin use these too.

/** Text on one line, not blank, up to `max` characters: what a font's `reason` and `fallbackFor` must be */
export const isOneLine = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value) && value.length <= max;

/**
 * The `role`, `reason` and `fallbackFor` of a font's meta that are valid, and nothing else: a value `blazon check` warns about is left out
 * of what is printed. `fallbackFor` counts only on a role of `fallback`.
 */
export function fontRoleFields(meta: unknown): Pick<FontMeta, 'role' | 'reason' | 'fallbackFor'> {
  const font = (typeof meta === 'object' && meta !== null ? meta : {}) as Record<string, unknown>;
  const role = FONT_ROLES.find((name) => name === font.role);
  return {
    ...(role && { role }),
    ...(isOneLine(font.reason, FONT_REASON_MAX) && { reason: font.reason }),
    ...(role === 'fallback' && isOneLine(font.fallbackFor, FONT_FALLBACK_FOR_MAX) && { fallbackFor: font.fallbackFor }),
  };
}

/** A font's meta with its role fields reduced to the valid ones; the other fields are untouched, in their order */
export function cleanFontMeta(font: FontMeta): FontMeta {
  if (typeof font !== 'object' || font === null || Array.isArray(font)) return font;
  const { role: _role, reason: _reason, fallbackFor: _fallbackFor, ...rest } = font;
  return { ...rest, ...fontRoleFields(font) };
}
