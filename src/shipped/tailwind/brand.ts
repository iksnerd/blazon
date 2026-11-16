import { isObject, requireBrand } from '../shared/plugin.js';

// What the plugin reads from brand.json (the `brand` of the request): the tokens in the order the brand lists them, each with its path,
// its DTCG type and its CSS-ready value, and the CSS variable theme.css gives it. It trusts none of it: a field of the wrong shape is a
// field that is not there.

export interface TokenRead {
  path: string;
  /** The token's DTCG type; empty when it has none */
  type: string;
  /** brand.json's CSS-ready `value`: "#635DFF", "24px" */
  value: string;
  /** The variable theme.css writes for it, as brand.json states it; empty when it does not */
  cssVariable: string;
}

export function readBrand(brand: unknown): TokenRead[] {
  const root = requireBrand(brand);
  return (Array.isArray(root.tokens) ? root.tokens : []).flatMap((item) =>
    isObject(item) && typeof item.path === 'string' && (typeof item.value === 'string' || typeof item.value === 'number')
      ? [
          {
            path: item.path,
            type: typeof item.type === 'string' ? item.type : '',
            value: String(item.value),
            cssVariable: typeof item.cssVariable === 'string' ? item.cssVariable : '',
          },
        ]
      : [],
  );
}
