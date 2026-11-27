import { colorWanted } from '../core/colors.js';
import { contrastOf, hexToRgb, labelOn, type Contrast, type Level } from '../core/init/palette.js';

// How the guided start looks: swatches, contrast lines, the ramp row. Every function takes a `Look` and returns a
// string; with color off the same information is written as plain text, so a screen reader or a log loses nothing.

export interface Look {
  /** Whether ANSI color may be used */
  color: boolean;
  /** Whether the terminal shows 24-bit color; otherwise the nearest of the 256 colors is used */
  truecolor: boolean;
}

/** Color is on for a terminal, unless NO_COLOR is set or TERM is dumb; FORCE_COLOR turns it on (NO_COLOR still wins). */
export function lookFor(env: NodeJS.ProcessEnv = process.env, tty: boolean = Boolean(process.stdout.isTTY)): Look {
  const color = colorWanted(env, tty, []);
  const truecolor = color && /^(truecolor|24bit)$/i.test(env['COLORTERM'] ?? '');
  return { color, truecolor };
}

const PLAIN: Look = { color: false, truecolor: false };
export { PLAIN };

function background(hex: string, look: Look): string {
  const [r, g, b] = (hexToRgb(hex) ?? [0, 0, 0]).map((c) => Math.round(c * 255)) as [number, number, number];
  if (look.truecolor) return `\x1b[48;2;${r};${g};${b}m`;
  const cube = (c: number) => Math.round((c / 255) * 5);
  return `\x1b[48;5;${16 + 36 * cube(r) + 6 * cube(g) + cube(b)}m`;
}

/** A block of the color; without color, the hex in brackets. */
export function swatch(hex: string, look: Look, width = 2): string {
  return look.color ? `${background(hex, look)}${' '.repeat(width)}\x1b[0m` : `[${hex}]`;
}

const LEVEL_WORDS: Record<Level, string> = { AAA: 'AAA', AA: 'AA', 'AA-large': 'AA for large text only', fail: 'below AA' };

const ratio = (n: number): string => `${n.toFixed(1)}:1`;

/** The color, a swatch, and how it reads on white and on near-black. One line each. */
export function contrastLines(hex: string, look: Look, c: Contrast = contrastOf(hex)): string[] {
  const text = (l: Level) => (l === 'AAA' || l === 'AA' ? 'yes' : 'no');
  return [
    `${swatch(hex, look, 4)} ${hex}`,
    `AA for text on white: ${text(c.onWhite.level)} (${ratio(c.onWhite.ratio)}, ${LEVEL_WORDS[c.onWhite.level]})`,
    `AA for text on near-black: ${text(c.onNearBlack.level)} (${ratio(c.onNearBlack.ratio)}, ${LEVEL_WORDS[c.onNearBlack.level]})`,
  ];
}

/** What the label on the color will be: blazon's labels are graphite, bone when graphite is under AA, white or black when neither starter ink reaches it, and a warning when nothing does. */
export function labelNote(hex: string): string {
  const { ink, ratio, aa } = labelOn(hex);
  if (!aa)
    return `None of graphite, bone, white or black reaches AA (4.5:1) as a label on ${hex} (best is ${ink} at ${ratio.toFixed(1)}:1). blazon check will report it; a lighter or darker color fixes that.`;
  return `Labels on ${hex} will be ${ink} (${ratio.toFixed(1)}:1).`;
}

export const stepTitle = (n: number, of: number, name: string): string => `${n} of ${of}  ${name}`;

export function kilobytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}
