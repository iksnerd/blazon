import type { BlazonData, TokenItem } from '../../../types/index.js';
import { tokensAt as tokensIn } from '../../../core/docs/directives.js';
import { TOKEN_PAGES } from '../brand';
import { colorBadgeHtml, escapeAttr } from '../theme/color-badges';

/** The tokens a path names: the token itself, or every token under it when it is a group ("icon.marketing", "icon.marketing.*"). */
export function tokensAt(data: BlazonData, path: string): TokenItem[] {
  return tokensIn(data.tokens.items, path);
}

/** The token page that shows a token, opened at that token. */
export function tokenHref(token: TokenItem): string {
  const page = TOKEN_PAGES.find((p) => p.has(token))?.hash ?? '#tokens/all';
  return `${page}?token=${encodeURIComponent(token.path)}`;
}

/**
 * Doc HTML with every `token.path` code span that names a token (or a group of them) turned into a
 * link to that token's page, a color or gradient token as a badge in its own color. Code that names no
 * token is left alone.
 */
export function linkTokenPaths(html: string, data: BlazonData): string {
  return html.replace(/<code>([A-Za-z][\w-]*(?:\.[\w-]+)+(?:\.\*)?)<\/code>/g, (match, path: string) => {
    const [first] = tokensAt(data, path);
    if (!first) return match;
    const paintable = !path.endsWith('.*') && (first.type === 'color' || first.type === 'gradient');
    const label = paintable ? colorBadgeHtml(String(first.value), path, 'code') : match;
    return `<a class="blazon-token-link" href="${escapeAttr(tokenHref(first))}" title="${escapeAttr(`${first.path}: ${String(first.value)}`)}">${label}</a>`;
  });
}
