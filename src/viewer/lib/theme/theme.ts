import { useEffect, useState } from 'react';
import type { BlazonData, ThemeRole } from '../../../types/index.js';
import { contrastBetween } from './color';
import { isDarkBackground } from '../brand';

/** Brand roles as --blazon-* variables; index.css derives shadcn's variables from them for both modes. */
const THEME_VARS: Record<ThemeRole, string> = {
  background: '--blazon-bg',
  canvas: '--blazon-canvas',
  text: '--blazon-text',
  muted: '--blazon-muted',
  border: '--blazon-border',
  accent: '--blazon-accent',
  accentText: '--blazon-accent-text',
  inverse: '--blazon-inverse',
  inverseText: '--blazon-inverse-text',
  fontDisplay: '--blazon-font-display',
  fontBody: '--blazon-font-body',
  radius: '--blazon-radius',
};

/** WCAG AA for body text. */
const TEXT_CONTRAST = 4.5;

function linkColor(accent: string | undefined, background: string | undefined, text: string | undefined): string | undefined {
  if (!accent || !background || !text) return undefined;
  const ratio = contrastBetween(accent, background);
  return ratio === undefined || ratio >= TEXT_CONTRAST ? accent : text;
}

/** WCAG's minimum for graphics: an edge that separates a color from the page. */
const GRAPHIC_CONTRAST = 3;

/** The brand's border as the edge of a color, where it reaches graphic contrast; undefined leaves the stylesheet's mix. */
function edgeColor(border: string | undefined, background: string | undefined): string | undefined {
  if (!border || !background) return undefined;
  const ratio = contrastBetween(border, background);
  // A border blazon cannot read is the brand's call, so it stays
  return ratio === undefined || ratio >= GRAPHIC_CONTRAST ? border : undefined;
}

function setOrRemove(root: HTMLElement, cssVar: string, value: string | undefined): void {
  if (value) root.style.setProperty(cssVar, value);
  else root.style.removeProperty(cssVar);
}

export function applyTheme(data: BlazonData): void {
  const root = document.documentElement;
  for (const [role, cssVar] of Object.entries(THEME_VARS) as [ThemeRole, string][]) {
    setOrRemove(root, cssVar, data.theme[role]);
  }

  // Links take the accent only where it reads as body text; elsewhere the text color, still underlined.
  // A brand whose accent is a signal color, not a text color, keeps it off its prose.
  const { accent, background, text, inverse, inverseText } = data.theme;
  setOrRemove(root, '--blazon-link-light', linkColor(accent, background, text));
  setOrRemove(root, '--blazon-link-dark', linkColor(accent, inverse, inverseText));
  // A dark theme makes the page the dark surface and the inverse the light one: a logo drawn for a light background goes on the inverse
  const swapped = isDarkBackground(background, text) && !isDarkBackground(inverse, inverseText);
  setOrRemove(root, '--blazon-surface-light', swapped ? 'var(--blazon-inverse)' : undefined);
  setOrRemove(root, '--blazon-surface-light-text', swapped ? 'var(--blazon-inverse-text)' : undefined);
  setOrRemove(root, '--blazon-surface-dark', swapped ? 'var(--blazon-bg)' : undefined);
  setOrRemove(root, '--blazon-surface-dark-text', swapped ? 'var(--blazon-text)' : undefined);
  // A color tile's edge is the brand's border where it shows; a pale rule on its own page does not
  setOrRemove(root, '--blazon-edge-light', edgeColor(data.theme.border, background));

  document.querySelectorAll('link[data-blazon-font]').forEach((link) => link.remove());
  for (const href of data.fonts) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.blazonFont = '';
    document.head.appendChild(link);
  }
  document.title = data.title;
}

export type Mode = 'light' | 'dark';

const MODE_KEY = 'blazon-mode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Light or dark, remembered per viewer. Dark is the brand's inverse pair. */
export function useMode(): [Mode, (mode: Mode) => void] {
  const [mode, setMode] = useState(readMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Private windows can refuse storage; the mode still applies for this visit.
    }
  }, [mode]);

  return [mode, setMode];
}
