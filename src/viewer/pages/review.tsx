import type { Finding, BlazonData, Review } from '../../types/index.js';
import { Doc, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { tokenHref } from '@/lib/tokens/token-links';
import { TokenPath } from '@/components/blazon/token-path';
import { assetCategories, categoryKind, type CategoryKind } from '@/lib/brand';
import { ColorText } from '@/components/blazon/color-text';

/** A finding's path, linked to its token page (opened at the token) when it names a token. */
function FindingPath({ data, path }: { data: BlazonData; path: string }) {
  const token = data.tokens.items.find((t) => t.path === path);
  const code = <TokenPath path={path} />;
  return token ? (
    <a href={tokenHref(token)} className="text-foreground underline underline-offset-2">
      {code}
    </a>
  ) : (
    code
  );
}

function Findings({ data, findings }: { data: BlazonData; findings: Finding[] }) {
  return (
    <ul className="flex flex-col">
      {findings.map((finding, index) => (
        <li key={index} className="grid gap-x-6 gap-y-1 border-b py-3 last:border-b-0 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
          <FindingPath data={data} path={finding.path} />
          <span>
            <ColorText text={finding.message} />
          </span>
          <span className="text-[13px] text-muted-foreground">{finding.context ? `${finding.code}, only in ${finding.context}` : finding.code}</span>
        </li>
      ))}
    </ul>
  );
}

interface Approved {
  path: string;
  review: Review;
  /** `approval-stale`: the value changed after the person confirmed it */
  stale: boolean;
}

/** Tokens, token groups and assets that say `review: ok`, the changed ones first. */
function approvedItems(data: BlazonData): Approved[] {
  const stale = new Set(data.findings.filter((f) => f.code === 'approval-stale').map((f) => f.path));
  const reviews: [string, Review | undefined][] = [
    ...data.tokens.items.map((t): [string, Review | undefined] => [t.path, t.blazon.review]),
    ...data.tokens.groupMeta.map((g): [string, Review | undefined] => [g.path, g.blazon.review]),
    ...assetCategories(data).flatMap((c) => c.assets.map((a): [string, Review | undefined] => [a.id, a.meta?.review])),
  ];
  return reviews
    .flatMap(([path, review]) => (review?.status === 'ok' ? [{ path, review, stale: stale.has(path) }] : []))
    .sort((a, b) => Number(b.stale) - Number(a.stale) || a.path.localeCompare(b.path));
}

/** Who confirmed the value and when, as far as the review says. */
function approvedBy({ by, at }: Review): string {
  if (by && at) return `Approved by ${by} on ${at}`;
  if (by) return `Approved by ${by}`;
  if (at) return `Approved on ${at}`;
  return 'Approved, with no name or date recorded';
}

function ApprovedList({ data, items }: { data: BlazonData; items: Approved[] }) {
  return (
    <ul className="flex flex-col">
      {items.map(({ path, review, stale }) => (
        <li key={path} className="grid gap-x-6 gap-y-1 border-b py-3 last:border-b-0 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
          <FindingPath data={data} path={path} />
          <span>
            {approvedBy(review)}
            {review.note ? `. ${review.note}` : ''}
          </span>
          <span className="text-[13px] text-muted-foreground">{stale ? 'changed since' : review.value ? 'value recorded' : 'no value recorded'}</span>
        </li>
      ))}
    </ul>
  );
}

/** The asset categories of one kind (explorations, or material kept for comparison) and how many files each holds: visible, and not findings. */
function CategoryList({ data, kind }: { data: BlazonData; kind: CategoryKind }) {
  const categories = assetCategories(data).filter((c) => categoryKind(c) === kind);
  return (
    <ul className="flex flex-col">
      {categories.map((c) => (
        <li
          key={c.category}
          {...{ [kind === 'experiment' ? 'data-experiment-category' : 'data-reference-category']: c.category }}
          className="grid gap-x-6 gap-y-1 border-b py-3 last:border-b-0 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]"
        >
          <a href={`#assets/${c.category}`} className="text-foreground underline underline-offset-2">
            <TokenPath path={c.category} />
          </a>
          <span>{c.description ?? (kind === 'experiment' ? "Explorations, not the brand's identity." : 'Kept for comparison or supplied by someone else.')}</span>
          <span className="text-[13px] text-muted-foreground">
            {c.assets.length} {c.assets.length === 1 ? 'file' : 'files'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewPage({ data }: { data: BlazonData }) {
  const errors = data.findings.filter((f) => f.severity === 'error');
  const warnings = data.findings.filter((f) => f.severity === 'warning');
  const approved = approvedItems(data);
  const hasExperiments = assetCategories(data).some((c) => categoryKind(c) === 'experiment');
  const hasReference = assetCategories(data).some((c) => categoryKind(c) === 'reference');
  const intro = data.findings.some((f) => f.severity !== 'info')
    ? 'What blazon check found in these tokens. Errors stop blazon build; warnings mark open questions.'
    : 'blazon check found nothing to review.';

  return (
    <>
      <PageHeader label="Quality" title="Review" intro={intro} />
      <Doc>
        {errors.length > 0 && (
          <Section heading="Errors">
            <Findings data={data} findings={errors} />
          </Section>
        )}
        {warnings.length > 0 && (
          <Section heading="Warnings">
            <Findings data={data} findings={warnings} />
          </Section>
        )}
        {approved.length > 0 && (
          <Section heading="Approved">
            <ApprovedList data={data} items={approved} />
          </Section>
        )}
        {hasExperiments && (
          <Section heading="Experiments">
            <p className="mb-2 text-sm text-muted-foreground">Explorations, not the brand's identity. Their review status does not gate the book, so they raise no warnings.</p>
            <CategoryList data={data} kind="experiment" />
          </Section>
        )}
        {hasReference && (
          <Section heading="Reference">
            <p className="mb-2 text-sm text-muted-foreground">
              Kept for comparison or supplied by someone else, not the brand's live assets. Their review status does not gate the book, so they raise no warnings.
            </p>
            <CategoryList data={data} kind="reference" />
          </Section>
        )}
      </Doc>
      <PageFooter title={data.title} trail="Quality / Review" />
    </>
  );
}
