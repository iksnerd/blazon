import { MISUSE_KINDS, type MisuseKind } from '../../types/index.js';

export { MISUSE_KINDS, type MisuseKind };

/** What `blazon:logo-misuse` draws when neither the directive nor the logo's sidecar names kinds. */
export const DEFAULT_MISUSE_KINDS: readonly MisuseKind[] = ['stretch', 'rotate', 'outline', 'recolor', 'shadow', 'low-contrast'];

/** The figure of each kind, in words: the caption, and what is done to the logo, for the picture's accessible name. */
const WORDS: Record<MisuseKind, { caption: string; effect: string }> = {
  stretch: { caption: 'Do not stretch the logo', effect: 'stretched wider' },
  squash: { caption: 'Do not squash the logo', effect: 'squeezed narrower' },
  rotate: { caption: 'Do not rotate the logo', effect: 'rotated' },
  outline: { caption: 'Do not outline the logo', effect: 'with an outline' },
  recolor: { caption: 'Do not recolor the logo', effect: 'in an off-brand color' },
  shadow: { caption: 'Do not add a shadow to the logo', effect: 'with a drop shadow' },
  crop: { caption: 'Do not crop the logo', effect: 'cropped by its box' },
  'low-contrast': { caption: 'Do not place the logo on a background of similar lightness', effect: 'on a background of similar lightness' },
  'busy-background': { caption: 'Do not place the logo on a busy background', effect: 'on a busy pattern' },
};

export const misuseCaption = (kind: MisuseKind): string => WORDS[kind].caption;
export const misuseEffect = (kind: MisuseKind): string => WORDS[kind].effect;

export function isMisuseKind(name: string): name is MisuseKind {
  return (MISUSE_KINDS as readonly string[]).includes(name);
}

/** The message for a kind that is not one of the nine, with the ones that are. */
export const unknownMisuseMessage = (names: readonly string[]): string =>
  `unknown misuse kind ${names.map((n) => JSON.stringify(n)).join(', ')}; known: ${MISUSE_KINDS.join(', ')}`;

/**
 * The kinds to draw: the directive's own, else the sidecar's `misuse`, else the default six. Each kind once, in the order written;
 * a name that is not a kind is returned apart, so the caller can report it.
 */
export function resolveMisuse(fromDirective: readonly string[], fromSidecar: readonly MisuseKind[] | undefined): { kinds: MisuseKind[]; unknown: string[] } {
  const wanted: readonly string[] = fromDirective.length > 0 ? fromDirective : (fromSidecar ?? DEFAULT_MISUSE_KINDS);
  const kinds: MisuseKind[] = [];
  const unknown: string[] = [];
  for (const name of wanted) {
    if (!isMisuseKind(name)) {
      if (!unknown.includes(name)) unknown.push(name);
    } else if (!kinds.includes(name)) kinds.push(name);
  }
  return { kinds, unknown };
}
