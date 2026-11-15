import type { BlazonData, TokenItem } from '../../types/index.js';
import { EFFECT_TYPES } from '@/lib/brand';
import { byParent } from '@/lib/tokens/group';
import { lastSegment } from '@/lib/tokens/format';
import { measureText } from '@/lib/tokens/motion';
import { Doc, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { TokenRow } from '@/components/blazon/token-row';
import { Preview } from '@/components/blazon/previews';
import { previewKind } from '@/lib/tokens/preview';

/** A stroke style: a CSS border style by name, or the DTCG object form drawn as an SVG line. */
function Stroke({ token }: { token: TokenItem }) {
  const value = token.resolvedValue;
  if (value && typeof value === 'object' && 'dashArray' in value) {
    const { dashArray, lineCap } = value as { dashArray: unknown[]; lineCap?: string };
    return (
      <svg viewBox="0 0 160 12" className="h-3 w-full" aria-hidden="true">
        <line
          x1="6"
          y1="6"
          x2="154"
          y2="6"
          className="stroke-foreground"
          strokeWidth="4"
          strokeDasharray={dashArray.map(measureText).join(' ')}
          strokeLinecap={lineCap as 'round' | 'butt' | 'square'}
        />
      </svg>
    );
  }
  return <span data-demo className="block w-full border-t-4 border-foreground" style={{ borderTopStyle: String(token.value) as 'dashed' }} />;
}

function EffectRow({ token }: { token: TokenItem }) {
  const value = String(token.value);
  if (token.type === 'strokeStyle') return <TokenRow token={token} demo={<Stroke token={token} />} />;
  if (token.type === 'border') return <TokenRow token={token} demo={<Preview token={token} kind="border" />} />;
  if (token.type === 'shadow') return <TokenRow token={token} demo={<span data-demo className="block size-12 rounded-md bg-background" style={{ boxShadow: value }} />} />;
  const kind = previewKind(token);
  if (kind) return <TokenRow token={token} demo={<Preview token={token} kind={kind} />} detail={<span>{value}</span>} />;
  // A bare number with no recognizable meaning is shown as written
  return <TokenRow token={token} demo={<span className="font-heading text-3xl font-semibold">{value}</span>} detail={<span>{token.type}</span>} />;
}

export function EffectsPage({ data }: { data: BlazonData }) {
  const tokens = data.tokens.items.filter((t) => EFFECT_TYPES.includes(t.type ?? ''));
  return (
    <>
      <PageHeader label="Tokens" title="Strokes & effects" intro="Stroke styles, borders, shadows and plain numbers. Click one to copy its CSS variable." />
      <Doc>
        {byParent(tokens).map(([parent, group]) => (
          <Section key={parent} heading={lastSegment(parent)} path={parent}>
            {group.map((token) => (
              <EffectRow key={token.path} token={token} />
            ))}
          </Section>
        ))}
      </Doc>
      <PageFooter title={data.title} trail="Tokens / Strokes & effects" />
    </>
  );
}
