import type { ThemeRole } from '../../types/index.js';
import { isObject, requireBrand } from '../shared/plugin.js';

// What the plugin reads from brand.json (the `brand` of the request): the theme roles with the token each came from, every token with its
// type, value and alias, the contrast `pairs` the groups declare, and each context with the tokens it changes. It trusts none of it: a field
// of the wrong shape is a field that is not there.

export interface TokenRead {
  path: string;
  type: string;
  /** brand.json's CSS-ready `value` */
  value: string;
  aliasOf?: string;
}

export interface ContextRead {
  modifier: string;
  context: string;
  selector: string;
  tokens: TokenRead[];
}

export interface PairRead {
  fg: string;
  bg: string;
}

export interface BrandRead {
  /** Each theme role's value, and the token it came from */
  roles: Partial<Record<ThemeRole, string>>;
  roleTokens: Partial<Record<ThemeRole, string>>;
  tokens: TokenRead[];
  pairs: PairRead[];
  contexts: ContextRead[];
}

const textMap = (value: unknown): Record<string, string> =>
  isObject(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};

const tokensOf = (list: unknown): TokenRead[] =>
  (Array.isArray(list) ? list : []).flatMap((item) =>
    isObject(item) && typeof item.path === 'string' && (typeof item.value === 'string' || typeof item.value === 'number')
      ? [{ path: item.path, type: typeof item.type === 'string' ? item.type : '', value: String(item.value), ...(typeof item.aliasOf === 'string' && { aliasOf: item.aliasOf }) }]
      : [],
  );

export function readBrand(brand: unknown): BrandRead {
  const root = requireBrand(brand);
  const theme = isObject(root.theme) ? root.theme : {};
  const pairs = (Array.isArray(root.groups) ? root.groups : []).flatMap((group) => {
    const rules = isObject(group) && isObject(group.blazon) && Array.isArray(group.blazon.pairs) ? group.blazon.pairs : [];
    return rules.flatMap((rule) => (isObject(rule) && typeof rule.fg === 'string' && typeof rule.bg === 'string' ? [{ fg: rule.fg, bg: rule.bg }] : []));
  });
  const contexts = (Array.isArray(root.contexts) ? root.contexts : []).flatMap((item) =>
    isObject(item) && typeof item.context === 'string'
      ? [
          {
            modifier: typeof item.modifier === 'string' ? item.modifier : '',
            context: item.context,
            selector: typeof item.selector === 'string' ? item.selector : '',
            tokens: tokensOf(item.tokens),
          },
        ]
      : [],
  );
  return { roles: textMap(theme.roles), roleTokens: textMap(theme.tokens), tokens: tokensOf(root.tokens), pairs, contexts };
}
