import pc from '../../core/colors.js';
import { listTokens, type TokenList } from '../../core/read/index.js';
import { asked, readBrand } from '../read.js';
import type { Handler } from './types.js';

/**
 * `list_tokens`, `blazon list [group]`: the tokens of the brand, or of one group, to choose a path from. `blazon get <path>` describes one.
 * Prints only; exits 0, or 2 when there is no such group or type.
 */
export const listTokensHandler: Handler = async ({ group, type }, { dir }) => {
  const { data } = await readBrand(dir);
  const list = asked(() => listTokens(data, { group: group as string | undefined, type: type as string | undefined }));
  const body = { ...(list.group !== undefined && { group: list.group }), ...(list.type && { type: list.type }), tokens: list.tokens };
  return { command: 'list', passed: true, status: 0, body, text: () => printList(list) };
};

/** A token a line, under a dim header for each top-level group, the columns lined up across the whole list. */
function printList(list: TokenList): void {
  if (list.tokens.length === 0) return console.log(pc.dim(`\n  no tokens${list.type ? ` of type ${list.type}` : ''}${list.group ? ` in ${list.group}` : ''}\n`));
  const pathWidth = Math.max(...list.tokens.map((t) => t.path.length));
  const typeWidth = Math.max(...list.tokens.map((t) => (t.type ?? '').length));
  let top: string | undefined;
  for (const token of list.tokens) {
    const group = token.path.split('.')[0]!;
    if (group !== top) console.log(`\n  ${pc.dim(group)}`);
    top = group;
    const alias = token.aliasOf ? `  ${pc.dim(`-> ${token.aliasOf}`)}` : '';
    console.log(`  ${token.path.padEnd(pathWidth)}  ${pc.dim((token.type ?? '').padEnd(typeWidth))}  ${String(token.value)}${alias}`);
  }
  console.log(`\n  ${pc.dim(`${list.tokens.length} token${list.tokens.length === 1 ? '' : 's'}; blazon get <path> shows one in full`)}\n`);
}
