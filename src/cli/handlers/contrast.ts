import pc from '../../core/colors.js';
import { measureContrast, type ContrastMeasure } from '../../core/read/index.js';
import { asked, printRows, readBrand } from '../read.js';
import type { Handler } from './types.js';

/** A `--alpha` or `--with-alpha` value as a number. A word becomes NaN, which the read refuses by name. */
const numberOf = (typed: unknown): number | undefined => {
  if (typed === undefined) return undefined;
  return typeof typed === 'number' ? typed : typeof typed === 'string' && typed.trim() !== '' ? Number(typed) : Number.NaN;
};

/**
 * `measure_contrast`, `blazon contrast <fg> <bg>`: the contrast of the foreground token on the background token, with `--with <token> --with-alpha <0-1>`
 * blended over the background first. A measurement, not a verdict: the exit status is 0 whatever the ratio, and 2 for what cannot be measured (an unknown
 * token, a translucent background, a `with` that is not a color, an opacity outside 0 to 1, `--with` without `--with-alpha`). `blazon can` says whether the brand allows a pair.
 */
export const measureContrastHandler: Handler = async ({ fg, bg, with: overlay, withAlpha, alpha, theme }, { dir }) => {
  const { data } = await readBrand(dir);
  const answer = asked(() =>
    measureContrast(data, {
      fg: fg as string,
      bg: bg as string,
      with: overlay as string | undefined,
      withAlpha: numberOf(withAlpha),
      alpha: numberOf(alpha),
      theme: theme as string | undefined,
    }),
  );
  return { command: 'contrast', status: 0, body: answer, text: () => print(answer) };
};

function print(answer: ContrastMeasure): void {
  const tint = answer.with === undefined ? '' : `, with ${answer.with} at ${answer.withAlpha} over it`;
  console.log(`\n  ${pc.bold(`${answer.ratio.toFixed(2)}:1`)}  ${answer.level}  ${answer.fg} on ${answer.bg}${tint}${answer.theme ? ` (theme ${answer.theme})` : ''}`);
  printRows([
    ['non-text', answer.nonText ? 'reaches 3:1' : 'below 3:1'],
    ['seen', `${answer.seen.fg} on ${answer.seen.bg}`],
    ['alpha', answer.alpha === undefined ? undefined : String(answer.alpha)],
    [
      'base pairs',
      answer.brandPairs.length === 0 ? 'none listed for this fg on the base bg' : answer.brandPairs.map((p) => `${p.fg} on ${p.bg} (${p.min}, from ${p.from})`).join('; '),
    ],
  ]);
  console.log(`\n  ${pc.dim(answer.note)}\n`);
}
