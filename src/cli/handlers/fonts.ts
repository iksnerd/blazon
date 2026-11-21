import pc from '../../core/colors.js';
import { describeFonts, fontFaceCss, type FontsDescription } from '../../core/read/index.js';
import { UsageError } from '../errors.js';
import { readBrand } from '../read.js';
import type { Handler } from './types.js';

/** `get_fonts`, `blazon fonts`: the stylesheets and font files the brand loads, and the families its tokens name. Prints only; exits 0. */
export const getFontsHandler: Handler = async (args, { dir }) => {
  const { config, data } = await readBrand(dir);
  const fonts = describeFonts(data, config, dir);
  if (args.css === true || typeof args.base === 'string') {
    if (args.css !== true) throw new UsageError('blazon fonts: --base goes with --css.', 'Add --css, or leave --base out.', 'conflicting-options');
    const fontFace = fontFaceCss(fonts, typeof args.base === 'string' ? args.base : undefined);
    return { command: 'fonts', passed: true, status: 0, body: { ...fonts, fontFace }, text: () => process.stdout.write(fontFace) };
  }
  return { command: 'fonts', passed: true, status: 0, body: fonts, text: () => print(fonts) };
};

function print(fonts: FontsDescription): void {
  console.log(`\n  ${pc.bold('Loaded')}`);
  if (fonts.stylesheets.length + fonts.files.length === 0) console.log(pc.dim('  The config lists no fonts.'));
  for (const url of fonts.stylesheets) console.log(`  stylesheet  ${url}`);
  for (const file of fonts.files)
    console.log(`  file        ${file.file}  ${file.family}${file.weight === undefined ? '' : `, weight ${file.weight}`}${file.style ? `, ${file.style}` : ''}`);
  console.log(`\n  ${pc.bold('Named by the tokens')}`);
  for (const [role, value] of Object.entries(fonts.roles)) console.log(`  ${pc.dim(role.padEnd(11))}  ${value.token ?? ''}  ${value.value ?? ''}`);
  for (const use of fonts.families) {
    const state = use.system
      ? 'system font'
      : use.loaded === true
        ? 'loaded'
        : use.loaded === null
          ? 'maybe loaded by a stylesheet blazon cannot read'
          : use.webFont !== undefined
            ? 'not loaded, as the token says'
            : 'not loaded';
    console.log(`  ${use.family}  ${pc.dim(`${state}; ${use.tokens.join(', ')}`)}`);
    if (use.stack && use.stack.length > 1) console.log(pc.dim(`    stack: ${use.stack.join(', ')}`));
    if (use.font?.role) console.log(pc.dim(`    role: ${use.font.role}${use.font.fallbackFor ? `, stands in for ${use.font.fallbackFor}` : ''}`));
    if (use.font?.reason) console.log(pc.dim(`    why: ${use.font.reason}`));
  }
  console.log();
}
