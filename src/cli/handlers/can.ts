import pc from '../../core/colors.js';
import { canUse, type CanAnswer, type CanRole } from '../../core/read/index.js';
import { asked, readBrand } from '../read.js';
import type { Handler } from './types.js';

/**
 * `can_use`, `blazon can <fg> <bg>`: whether the foreground token may be text (`--role ui`: a non-text element) on the background token, by the brand's own rules. Prints the answer and the rule
 * behind it. Exit status: 0 allowed, 1 denied, 2 an unknown token or one that is not a color.
 */
export const canUseHandler: Handler = async ({ fg, bg, role, theme }, { dir }) => {
  const { data } = await readBrand(dir);
  const answer = asked(() => canUse(data, fg as string, bg as string, (role as CanRole | undefined) ?? 'text', theme as string | undefined));
  return { command: 'can', passed: answer.allowed, status: answer.allowed ? 0 : 1, body: answer, text: () => print(answer) };
};

function print(answer: CanAnswer): void {
  console.log(
    `\n  ${answer.allowed ? pc.green('allowed') : pc.red('denied')}  ${answer.fg} as ${answer.role === 'ui' ? 'a non-text element (--role ui)' : 'text'} on ${answer.bg}${answer.theme ? ` (theme ${answer.theme})` : ''}`,
  );
  console.log(`  ${answer.reason}`);
  if (answer.checks.length > 1) {
    console.log();
    for (const check of answer.checks)
      console.log(`  ${check.rule === 'contrast' && answer.role === 'text' ? pc.dim('info') : check.ok ? pc.green('ok  ') : pc.red('no  ')}  ${check.message}`);
  }
  console.log();
}
