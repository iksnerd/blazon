import type { Handler } from './types.js';
import { getTokenHandler } from './get.js';
import { listTokensHandler } from './list.js';
import { getRulesHandler } from './rules.js';
import { canUseHandler } from './can.js';
import { measureContrastHandler } from './contrast.js';
import { getFontsHandler } from './fonts.js';
import { getLogoHandler } from './logo.js';
import { getBrandHandler } from './brand.js';
import { getOutputsHandler } from './outputs.js';

/**
 * One handler for each operation of the list that has a command (src/core/operations/list.ts), by the operation's name. `check_brand` has none:
 * it is `blazon check`, which runs plugins and is not an operation yet.
 */
export const HANDLERS: Record<string, Handler> = {
  get_token: getTokenHandler,
  list_tokens: listTokensHandler,
  get_rules: getRulesHandler,
  can_use: canUseHandler,
  measure_contrast: measureContrastHandler,
  get_fonts: getFontsHandler,
  get_logo: getLogoHandler,
  get_brand: getBrandHandler,
  get_outputs: getOutputsHandler,
};

export type { Context, Handler, Outcome } from './types.js';
