import type { Handler } from './types.js';
import { getTokenHandler } from './get.js';
import { listTokensHandler } from './list.js';
import { getRulesHandler } from './rules.js';
import { canUseHandler } from './can.js';
import { getFontsHandler } from './fonts.js';
import { getLogoHandler } from './logo.js';
import { getBrandHandler } from './brand.js';

/**
 * One handler for each operation of the list that has a command (src/core/operations/list.ts), by the operation's name. `check_brand` and
 * `get_shadcn` have none: the first is `blazon check`, which runs plugins and is not an operation yet, and the second is `blazon brand --key`.
 */
export const HANDLERS: Record<string, Handler> = {
  get_token: getTokenHandler,
  list_tokens: listTokensHandler,
  get_rules: getRulesHandler,
  can_use: canUseHandler,
  get_fonts: getFontsHandler,
  get_logo: getLogoHandler,
  get_brand: getBrandHandler,
};

export type { Context, Handler, Outcome } from './types.js';
