import { isObject, requireBrand } from '../shared/plugin.js';

// What the plugin reads from brand.json (the `brand` of the request): every token with its type and values, and the contexts, each with the
// tokens it changes. It trusts none of it: a field of the wrong shape is a field that is not there.

export interface TokenRead {
  path: string;
  /** The token's DTCG type; empty when it has none */
  type: string;
  /** brand.json's `resolvedValue`: aliases already replaced. A color is a CSS string and a dimension is `{ value, unit }` */
  resolved: unknown;
  /** brand.json's CSS-ready `value`: "#635DFF", "24px" */
  value: unknown;
}

export interface ContextRead {
  modifier: string;
  context: string;
  tokens: TokenRead[];
}

export interface BrandRead {
  tokens: TokenRead[];
  /** The contexts besides the defaults, which brand.json lists with only the tokens each changes */
  contexts: ContextRead[];
  contextNames: Set<string>;
}

const tokensOf = (list: unknown): TokenRead[] =>
  (Array.isArray(list) ? list : []).flatMap((item) =>
    isObject(item) && typeof item.path === 'string'
      ? [{ path: item.path, type: typeof item.type === 'string' ? item.type : '', resolved: item.resolvedValue, value: item.value }]
      : [],
  );

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const contexts = (Array.isArray(root.contexts) ? root.contexts : []).flatMap((item) =>
    isObject(item) && typeof item.context === 'string'
      ? [{ modifier: typeof item.modifier === 'string' ? item.modifier : '', context: item.context, tokens: tokensOf(item.tokens) }]
      : [],
  );
  return { tokens: tokensOf(root.tokens), contexts, contextNames: new Set(contexts.map((item) => item.context)) };
}
