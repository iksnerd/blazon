import type { BlazonData } from '../../types/index.js';
import { copy } from '@/lib/copy';
import { byParent } from '@/lib/tokens/group';
import { humanize, lastSegment } from '@/lib/tokens/format';
import { previewKind } from '@/lib/tokens/preview';
import { Doc, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { Preview } from '@/components/blazon/previews';
import { TokenRow } from '@/components/blazon/token-row';
import { ColorText } from '@/components/blazon/color-text';

export function DimensionsPage({ data }: { data: BlazonData }) {
  const tokens = data.tokens.items.filter((t) => t.type === 'dimension' && !t.path.startsWith('font.'));

  return (
    <>
      <PageHeader label="Tokens" title="Dimensions" intro="Each value is drawn as what it measures. Click one to copy its CSS variable." />
      <Doc>
        {byParent(tokens).map(([parent, group]) => {
          const radii = group.every((t) => previewKind(t) === 'radius');
          return (
            <Section key={parent} heading={lastSegment(parent)} path={parent}>
              {radii ? (
                // Radii read best side by side, the way the deck lays out its container sizes
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                  {group.map((token) => (
                    <button
                      key={token.path}
                      type="button"
                      data-token={token.path}
                      className="flex flex-col gap-2 text-left text-sm"
                      title={`Copy var(${token.cssVariable})`}
                      onClick={() => copy(`var(${token.cssVariable})`)}
                    >
                      <Preview token={token} kind="radius" />
                      <span>
                        {humanize(token.name)} {String(token.value)}
                      </span>
                      {token.description && (
                        <span className="text-[13px] text-muted-foreground">
                          <ColorText text={token.description} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                group.map((token) => <TokenRow key={token.path} token={token} demo={<Preview token={token} kind={previewKind(token) ?? 'bar'} />} />)
              )}
            </Section>
          );
        })}
      </Doc>
      <PageFooter title={data.title} trail="Tokens / Dimensions" />
    </>
  );
}
