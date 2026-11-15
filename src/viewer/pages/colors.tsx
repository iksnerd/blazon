import type { BlazonData, TokenItem } from '../../types/index.js';
import { findingsFor, groupMetaFor } from '@/lib/brand';
import { inkOn, rgbText } from '@/lib/theme/color';
import { ColorBadge } from '@/components/blazon/color-badge';
import { copy } from '@/lib/copy';
import { colorBlocks, humanize, isRamp, lastSegment, parentOf, usageNote } from '@/lib/tokens/format';
import { Doc, Note, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { ReviewFlag } from '@/components/blazon/review-flag';
import { ColorText } from '@/components/blazon/color-text';

function copyVar(token: TokenItem) {
  copy(`var(${token.cssVariable})`);
}

/** A swatch with its specs printed on it, the way the deck shows a brand color. */
function ColorTile({ data, token }: { data: BlazonData; token: TokenItem }) {
  const value = String(token.value);
  const print = token.blazon.print;
  const review = findingsFor(data, token.path).some((f) => f.code === 'needs-review' || f.code === 'duplicate-value');
  const specs = [
    `HEX ${value.toUpperCase()}`,
    rgbText(value) ? `RGB ${rgbText(value)}` : '',
    print?.cmyk ? `CMYK ${print.cmyk.join(' ')}` : '',
    print?.pms ? `PMS ${print.pms}` : '',
    print?.ral ? `RAL ${print.ral}` : '',
  ].filter(Boolean);
  const name = token.description && token.description.length < 32 ? token.description : humanize(token.name);

  return (
    <button
      type="button"
      data-token={token.path}
      className="blazon-swatch relative flex min-h-48 flex-col justify-between gap-6 rounded-lg p-5 text-left outline-offset-2 transition-transform hover:-translate-y-0.5"
      style={{ background: value, color: inkOn(value) }}
      title={`Copy var(${token.cssVariable})`}
      onClick={() => copyVar(token)}
    >
      <span className="text-lg font-semibold">{name}</span>
      <span className="flex flex-col gap-0.5 font-mono text-xs">
        {specs.map((spec) => (
          <span key={spec}>{spec}</span>
        ))}
      </span>
      {review && <ReviewFlag className="absolute top-4 right-4" />}
    </button>
  );
}

function Ramp({ data, tokens }: { data: BlazonData; tokens: TokenItem[] }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
      <span className="text-sm font-semibold">{lastSegment(parentOf(tokens[0]!.path))}</span>
      <div className="blazon-swatch flex overflow-hidden rounded-lg">
        {tokens.map((token) => {
          const value = String(token.value);
          const review = findingsFor(data, token.path).length > 0;
          return (
            <button
              key={token.path}
              type="button"
              data-token={token.path}
              className="flex min-h-20 min-w-0 flex-1 flex-col justify-end gap-0.5 overflow-hidden p-2 text-left font-mono text-[11px]"
              style={{ background: value, color: inkOn(value) }}
              title={`Copy var(${token.cssVariable})`}
              onClick={() => copyVar(token)}
            >
              <span className="truncate">
                {humanize(token.name)}
                {review ? ' *' : ''}
              </span>
              <span className="truncate">{value.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Semantic colors that alias a palette color: the role name and what it points to. */
function Roles({ tokens }: { tokens: TokenItem[] }) {
  return (
    <div className="flex flex-col">
      {tokens.map((token) => (
        <button
          key={token.path}
          type="button"
          data-token={token.path}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b py-2 text-left last:border-b-0 hover:bg-muted"
          onClick={() => copyVar(token)}
        >
          <span className="font-mono text-sm">{token.path}</span>
          <span className="font-mono text-xs text-muted-foreground">{token.aliasOf ?? ''}</span>
          <ColorBadge paint={String(token.value)} />
        </button>
      ))}
    </div>
  );
}

function Gradients({ tokens }: { tokens: TokenItem[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
      {tokens.map((token) => (
        <button
          key={token.path}
          type="button"
          data-token={token.path}
          className="blazon-swatch flex min-h-36 items-end rounded-lg p-5 text-left font-semibold text-white"
          style={{ background: String(token.value) }}
          title={`Copy var(${token.cssVariable})`}
          onClick={() => copyVar(token)}
        >
          {humanize(token.name)}
        </button>
      ))}
    </div>
  );
}

/** A representative color for a group-path bucket: its first color that is not white. */
function groupSample(data: BlazonData, path: string) {
  return data.tokens.items.find((t) => t.path.startsWith(`${path}.`) && t.type === 'color' && !/white/i.test(t.name));
}

/** One bucket of a proportion: its share, a label, and the tokens it stands for. */
interface Bucket {
  key: string;
  share: number;
  label: string;
  /** What the bar is painted with: the named tokens, or a sample of the group */
  tokens: TokenItem[];
  /** What the bucket stands for, as the legend lists it: the named tokens, or the whole group */
  covers: string[];
}

function bucketsOf(data: BlazonData, proportion: NonNullable<BlazonData['tokens']['groupMeta'][number]['blazon']['proportion']>): Bucket[] {
  return Object.entries(proportion).map(([key, entry]) => {
    // A bucket is either a group path with its share, or a label with the tokens it covers
    if (typeof entry === 'number') {
      const sample = groupSample(data, key);
      return { key, share: entry, label: lastSegment(key), tokens: sample ? [sample] : [], covers: [key] };
    }
    const paths = (entry.tokens ?? []).map((alias) => alias.replace(/^\{|\}$/g, ''));
    const tokens = paths.map((p) => data.tokens.items.find((t) => t.path === p)).filter((t): t is TokenItem => Boolean(t));
    return { key, share: entry.share, label: key, tokens, covers: paths };
  });
}

/**
 * The documented share of each palette in a composition (dev.blazon proportion), one stacked bar per
 * group that has one. A bucket covering several tokens is drawn as one stripe per token, and the bar
 * is outlined so a bucket in the page's own background color (white on white) still shows.
 */
function Proportions({ data }: { data: BlazonData }) {
  return data.tokens.groupMeta
    .filter((meta) => meta.blazon.proportion)
    .map((meta) => {
      const buckets = bucketsOf(data, meta.blazon.proportion!);
      return (
        <Section key={meta.path} heading="Proportions" path={meta.path}>
          <div className="blazon-swatch flex min-h-24 overflow-hidden rounded-lg">
            {buckets.map((bucket) => {
              const ink = inkOn(String(bucket.tokens[0]?.value ?? ''));
              return (
                <span key={bucket.key} data-bucket className="@container relative flex min-w-0 border-r border-[var(--blazon-edge)] last:border-r-0" style={{ flex: bucket.share }}>
                  <span className="absolute inset-0 flex flex-col">
                    {bucket.tokens.length > 0 ? (
                      bucket.tokens.map((token) => <span key={token.path} data-swatch className="flex-1" style={{ background: String(token.value) }} />)
                    ) : (
                      <span className="flex-1 bg-muted" />
                    )}
                  </span>
                  {/* A narrow segment shows only its share; the legend below always has the label */}
                  <span className="relative mt-auto p-2 text-sm font-semibold @[7rem]:p-3" style={{ color: bucket.tokens.length ? ink : undefined }}>
                    {Math.round(bucket.share * 100)}%<span className="hidden @[7rem]:inline"> {bucket.label}</span>
                  </span>
                </span>
              );
            })}
          </div>
          <ul className="mt-4 flex flex-col gap-1 text-[13px]">
            {buckets.map((bucket) => (
              <li key={bucket.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">
                  {Math.round(bucket.share * 100)}% {bucket.label}
                </span>
                {bucket.covers.map((path) => (
                  <code key={path} className="font-mono text-xs text-muted-foreground">
                    {path}
                  </code>
                ))}
              </li>
            ))}
          </ul>
        </Section>
      );
    });
}

export function ColorsPage({ data }: { data: BlazonData }) {
  const tokens = data.tokens.items.filter((t) => t.type === 'color' || t.type === 'gradient');
  const described = new Set<string>();

  return (
    <>
      <PageHeader label="Tokens" title="Colors" intro="Click a color to copy its CSS variable." />
      <Doc>
        <Proportions data={data} />
        {colorBlocks(tokens).map(({ heading, groups }) => {
          // A parent group's description is shown once, under the first palette it covers.
          const found = groupMetaFor(data, heading);
          const meta = found && !described.has(found.path) ? found : undefined;
          if (meta) described.add(meta.path);
          const note = usageNote(groups[0]![0]!);
          return (
            <Section key={heading} heading={lastSegment(heading)} path={heading}>
              <div className="flex flex-col gap-4">
                {meta?.description && (
                  <p>
                    <ColorText text={meta.description} />
                  </p>
                )}
                {note && <Note>{note}</Note>}
                {groups.map((group) => {
                  const key = group[0]!.path;
                  if (group[0]!.type === 'gradient') return <Gradients key={key} tokens={group} />;
                  if (isRamp(group)) return <Ramp key={key} data={data} tokens={group} />;
                  if (group.every((t) => t.aliasOf)) return <Roles key={key} tokens={group} />;
                  return (
                    <div key={key} className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
                      {group.map((token) => (
                        <ColorTile key={token.path} data={data} token={token} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })}
      </Doc>
      <PageFooter title={data.title} trail="Tokens / Colors" />
    </>
  );
}
