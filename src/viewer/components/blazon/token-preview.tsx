import type { BlazonData, TokenItem } from '../../../types/index.js';
import { copy } from '@/lib/copy';
import { inkOn } from '@/lib/theme/color';
import { humanize, styleLabel } from '@/lib/tokens/format';
import { previewKind } from '@/lib/tokens/preview';
import { tokensAt } from '@/lib/tokens/token-links';
import { ColorBadge } from '@/components/blazon/color-badge';
import { Preview } from '@/components/blazon/previews';
import { TokenPath } from '@/components/blazon/token-path';
import { ColorText } from '@/components/blazon/color-text';

/** A token's name as the brand writes it: a short description (CIAM, not Ciam), else the humanized key. */
export function tokenTitle(token: TokenItem): string {
  return token.description && token.description.length < 32 ? token.description : humanize(token.name);
}

/** One token as a compact card: a swatch, a type specimen, or the token page's own preview. */
function TokenCard({ token }: { token: TokenItem }) {
  const value = String(token.value);
  const kind = previewKind(token);
  // A color or a gradient is its own preview: paint a swatch with it
  const paintable = token.type === 'color' || token.type === 'gradient';
  return (
    <button
      type="button"
      data-token={token.path}
      className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 text-left hover:bg-muted/50"
      title={`Copy var(${token.cssVariable})`}
      onClick={() => copy(`var(${token.cssVariable})`)}
    >
      {paintable && <span data-swatch className="h-14 rounded-md border" style={{ background: value, color: inkOn(value) }} />}
      {token.type === 'typography' && (
        <>
          {/* The style's own family and weight, at a size that fits a card */}
          <span className="text-4xl leading-none" style={{ fontFamily: String(token.parts?.fontFamily ?? 'inherit'), fontWeight: String(token.parts?.fontWeight ?? 'inherit') }}>
            Aa
          </span>
          <span className="text-xs">{styleLabel(token)}</span>
        </>
      )}
      {!paintable && token.type !== 'typography' && kind && <Preview token={token} kind={kind} />}
      {/* A short description names the token as the brand does (CIAM, not Ciam), as on the Colors page */}
      <span className="text-sm font-semibold">{tokenTitle(token)}</span>
      <TokenPath path={token.path} className="text-muted-foreground" />
      {paintable && <ColorBadge paint={value} />}
      {!paintable && token.type !== 'typography' && (
        <span className="font-mono text-xs">
          <ColorText text={value} />
        </span>
      )}
    </button>
  );
}

/** The `<!-- blazon:tokens path ... -->` directive: live previews of the named tokens inside a doc. */
export function TokenPreviews({ data, paths }: { data: BlazonData; paths: string[] }) {
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-2.5">
      {paths.flatMap((path) => {
        const tokens = tokensAt(data, path);
        if (tokens.length === 0) {
          return [
            <p key={path} className="col-span-full text-[13px] text-destructive">
              No token at {path}
            </p>,
          ];
        }
        return tokens.map((token) => <TokenCard key={`${path}:${token.path}`} token={token} />);
      })}
    </div>
  );
}
