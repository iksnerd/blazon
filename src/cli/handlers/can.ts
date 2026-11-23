import pc from '../../core/colors.js';
import { MAX_PAIRS } from '../../core/operations/index.js';
import { canUse, canUseMany, withoutChecks, type CanAnswer, type CanRole } from '../../core/read/index.js';
import { UsageError } from '../errors.js';
import { asked, readBrand } from '../read.js';
import type { Handler } from './types.js';

type Shown = ReturnType<typeof withoutChecks>;

/** The `--pair fg:bg` values: one string when the flag was typed once, a list when repeated. */
function pairsOf(typed: unknown): { fg: string; bg: string }[] {
  const values = typed === undefined ? [] : Array.isArray(typed) ? typed : [typed];
  return values.map((value) => {
    const parts = String(value).split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1])
      throw new UsageError(`--pair takes fg:bg, such as text.primary:surface.canvas; got "${String(value)}".`, undefined, 'invalid-option-value');
    return { fg: parts[0], bg: parts[1] };
  });
}

/** The `--alpha` value as a number, or undefined when it was not typed. The parser hands a number-like value over as a number; anything else is refused here. */
function alphaOf(typed: unknown): number | undefined {
  if (typed === undefined) return undefined;
  const value = typeof typed === 'number' ? typed : typeof typed === 'string' && typed.trim() !== '' ? Number(typed) : Number.NaN;
  if (!(value >= 0 && value <= 1)) throw new UsageError(`--alpha takes a number from 0 to 1; got "${String(typed)}".`, undefined, 'invalid-option-value');
  return value;
}

/**
 * `can_use`, `blazon can <fg> <bg>`: whether the foreground token may be text (`--role ui`: a non-text element) on the background token, by the brand's own rules. Prints the answer and the rule
 * behind it. With `--pair fg:bg` repeated, one answer for each pair. `--alpha` measures the foreground at that opacity. `--no-verbose` leaves out the checks of an allowed answer. Exit status: 0 allowed (every pair), 1 denied, 2 an unknown token, one that is not a color, or a wrong form.
 */
export const canUseHandler: Handler = async ({ fg, bg, role, theme, pairs, verbose, alpha }, { dir }) => {
  const opacity = alphaOf(alpha);
  const batch = pairsOf(pairs);
  const single = fg !== undefined || bg !== undefined;
  if (batch.length > 0 && single) throw new UsageError('give fg and bg, or --pair, not both.', undefined, 'conflicting-options');
  if (batch.length === 0 && (fg === undefined || bg === undefined)) throw new UsageError('give fg and bg, or one or more --pair fg:bg.', undefined, 'missing-argument');
  if (batch.length > MAX_PAIRS) throw new UsageError(`give at most ${MAX_PAIRS} pairs in one call; this call has ${batch.length}.`, undefined, 'invalid-option-value');
  const quiet = verbose === false;
  const shown = (answer: CanAnswer): Shown => (quiet ? withoutChecks(answer) : answer);
  const { data } = await readBrand(dir);
  const asRole = (role as CanRole | undefined) ?? 'text';
  if (batch.length > 0) {
    const results = asked(() => canUseMany(data, batch, asRole, theme as string | undefined, opacity)).map(shown);
    const allowed = results.every((r) => r.allowed);
    return { command: 'can', passed: allowed, status: allowed ? 0 : 1, body: { allowed, results }, text: () => results.forEach((r) => print(r)) };
  }
  const answer = shown(asked(() => canUse(data, fg as string, bg as string, asRole, theme as string | undefined, opacity)));
  return { command: 'can', passed: answer.allowed, status: answer.allowed ? 0 : 1, body: answer, text: () => print(answer) };
};

function print(answer: Shown): void {
  console.log(
    `\n  ${answer.allowed ? pc.green('allowed') : pc.red('denied')}  ${answer.fg} as ${answer.role === 'ui' ? 'a non-text element (--role ui)' : 'text'} on ${answer.bg}${answer.theme ? ` (theme ${answer.theme})` : ''}`,
  );
  console.log(`  ${answer.reason}`);
  if (answer.checks && answer.checks.length > 1) {
    console.log();
    for (const check of answer.checks)
      console.log(`  ${check.rule === 'contrast' && answer.role === 'text' ? pc.dim('info') : check.ok ? pc.green('ok  ') : pc.red('no  ')}  ${check.message}`);
  }
  console.log();
}
