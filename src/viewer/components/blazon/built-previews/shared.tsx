import type { ReactNode } from 'react';
import type { BlazonData, TokenItem } from '../../../../types/index.js';
import { tokensAt } from '@/lib/tokens/token-links';
import { isPaint } from '../../../../core/docs/directives.js';
import { tokenTitle } from '@/components/blazon/token-preview';
import { TokenPath } from '@/components/blazon/token-path';

// Previews a doc builds from the brand's own assets and tokens, where a brand book would show a picture.

export function Missing({ children }: { children: ReactNode }) {
  return <p className="col-span-full text-[13px] text-destructive">{children}</p>;
}

/** The color and gradient tokens the paths name, or a "No token at" line per path that names none. */
export function paints(data: BlazonData, paths: string[]): (TokenItem | { missing: string })[] {
  return paths.flatMap((path): (TokenItem | { missing: string })[] => {
    const tokens = tokensAt(data, path).filter(isPaint);
    return tokens.length ? tokens : [{ missing: path }];
  });
}

export function TokenLabel({ token }: { token: TokenItem }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm font-semibold">{tokenTitle(token)}</span>
      <TokenPath path={token.path} className="text-muted-foreground" />
    </span>
  );
}
