import pc from '../../core/colors.js';
import { describeToken, isGroupPath, type TokenDescription } from '../../core/read/index.js';
import { UsageError } from '../errors.js';
import { asked, printRows, readBrand } from '../read.js';
import { ruleLines } from './rules.js';
import type { Handler } from './types.js';

/**
 * `get_token`, `blazon get <path>`: one token, as the brand states it. A group path is a list, and `blazon list` prints those.
 * Prints only; exits 0, or 2 when there is no such token or the path is a group.
 */
export const getTokenHandler: Handler = async ({ path: typedPath }, { dir }) => {
  const { data } = await readBrand(dir);
  if (isGroupPath(data, String(typedPath)))
    throw new UsageError(`"${String(typedPath)}" is a group of tokens, not one token; \`blazon list ${String(typedPath)}\` lists its tokens.`, undefined, 'not-a-token');
  const token = asked(() => describeToken(data, String(typedPath)));
  return { command: 'get', passed: true, status: 0, body: { token }, text: () => printToken(token) };
};

function printToken(token: TokenDescription): void {
  const { names } = token;
  console.log(`\n  ${pc.bold(token.path)}${token.deprecated ? pc.yellow('  deprecated') : ''}`);
  printRows([
    ['value', String(token.value)],
    ['type', token.type],
    ['alias of', token.aliasOf && `{${token.aliasOf}}`],
    ['tier', token.tier],
    ['about', token.description],
    ['theme.css', [names.theme.variable, ...Object.values(names.theme.parts ?? {})].join(', ')],
    ['typography.css', names.typographyClass && `.${names.typographyClass}`],
    ['written in', token.sourceFile],
  ]);
  for (const context of token.contexts ?? [])
    console.log(`  ${pc.dim(`${context.modifier}=${context.context}`.padEnd(12))}  ${String(context.value)}  ${pc.dim(context.selector)}`);
  const rules = ruleLines(token.rules);
  console.log(`\n  ${pc.bold('Rules')}`);
  if (rules.length === 0) console.log(pc.dim('  none written for this token'));
  for (const line of rules) console.log(`  ${line}`);
  console.log();
}
