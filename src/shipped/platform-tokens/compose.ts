import { hexOf } from './colors.js';
import { dp } from './dimensions.js';
import { typeName } from './names.js';
import type { Plan } from './plan.js';

const HEADER = '// Written by blazon.platform-tokens from brand.json. Do not edit: build again instead.';

/** Jetpack Compose: Colors.kt with an object of Color values and, when a dark context changes a color, a second one with every color; Dimens.kt with Dp values */
export function composeFiles(plan: Plan): Map<string, string> {
  const files = new Map<string, string>();
  const colorOf = (c: Plan['colors'][number]['light']) => `Color(0x${hexOf(c, true)})`;
  if (plan.colors.length) {
    const night = plan.colors.filter((c) => c.dark);
    const colors = typeName(plan.prefix, 'Colors');
    const out = [
      HEADER,
      'package blazon.tokens',
      '',
      'import androidx.compose.ui.graphics.Color',
      '',
      `object ${colors} {`,
      ...plan.colors.map((c) => `    val ${c.kotlin} = ${colorOf(c.light)}`),
      '}',
    ];
    if (night.length)
      out.push(
        '',
        `/** Every color for the dark appearance: the dark context's value where it sets one, else the value in ${colors}. Swap the whole object. */`,
        `object ${typeName(plan.prefix, 'DarkColors')} {`,
        ...plan.colors.map((c) => `    val ${c.kotlin} = ${colorOf(c.dark ?? c.light)}`),
        '}',
      );
    files.set('compose/Colors.kt', `${out.join('\n')}\n`);
  }
  if (plan.dimensions.length) {
    const out = [
      HEADER,
      'package blazon.tokens',
      '',
      'import androidx.compose.ui.unit.Dp',
      'import androidx.compose.ui.unit.dp',
      '',
      '// px tokens are dp 1:1; rem tokens are 16 dp to the rem.',
      `object ${typeName(plan.prefix, 'Dimens')} {`,
      ...plan.dimensions.map((d) => `    val ${d.kotlin}: Dp = ${dp(d.dp)}.dp`),
      '}',
    ];
    files.set('compose/Dimens.kt', `${out.join('\n')}\n`);
  }
  return files;
}
