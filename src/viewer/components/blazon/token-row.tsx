import type { ReactNode } from 'react';
import type { TokenItem } from '../../../types/index.js';
import { copy } from '@/lib/copy';
import { humanize } from '@/lib/tokens/format';
import { TokenPath } from '@/components/blazon/token-path';
import { ColorText } from '@/components/blazon/color-text';

/**
 * One token on a token page: a live demo on the left, its name, path and value on the right.
 * Clicking it copies the CSS variable, as on every other token page.
 */
export function TokenRow({ token, demo, detail }: { token: TokenItem; demo: ReactNode; detail?: ReactNode }) {
  return (
    <button
      type="button"
      data-token={token.path}
      className="grid w-full grid-cols-[minmax(0,160px)_minmax(0,1fr)] items-center gap-6 border-b py-4 text-left last:border-b-0 hover:bg-muted/50"
      title={`Copy var(${token.cssVariable})`}
      onClick={() => copy(`var(${token.cssVariable})`)}
    >
      <span className="flex min-h-12 items-center">{demo}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{humanize(token.name)}</span>
        <TokenPath path={token.path} className="text-muted-foreground" />
        <span className="font-mono text-xs">{typeof detail === 'string' || detail === undefined ? <ColorText text={detail ?? String(token.value)} /> : detail}</span>
        {token.description && (
          <span className="text-[13px] text-muted-foreground">
            <ColorText text={token.description} />
          </span>
        )}
      </span>
    </button>
  );
}
