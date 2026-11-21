import type { ReactNode } from 'react';
import type { DocItem, BlazonData, ThemeRole } from '../../types/index.js';
import { logoDenial } from '../../core/checker/logo-rules.js';
import { type DirectiveName } from '../../core/docs/directives.js';
import { docGroup, isDarkBackground, logoOn } from '@/lib/brand';
import type { Mode } from '@/lib/theme/theme';
import { cn } from '@/lib/utils';
import { GUTTER, PageFooter } from '@/components/blazon/page';
import { SectionIndex } from '@/components/blazon/section-index';
import { TokenPreviews } from '@/components/blazon/token-preview';
import { AssetFigures, AssetSection } from '@/components/blazon/asset-figures';
import { IconRows, LogoContrast, LogoOn, LogoSpace, SampleCards, SpotTiles, StrokeSamples } from '@/components/blazon/built-previews';
import { FormatFrames, PatternTiles } from '@/components/blazon/layout-previews';
import { IconSetBrowser } from '@/components/blazon/icon-sets';
import { LogoColorways } from '@/components/blazon/logo-colorways';
import { LogoInitiative, LogoLockups, LogoMisuse, LogoPartner, LogoPlacement } from '@/components/blazon/logo-rules';
import { badgeColorCodes } from '@/lib/theme/color-badges';
import { linkTokenPaths } from '@/lib/tokens/token-links';
import { splitCodeBlocks } from '@/lib/markup/code-fences';
import { alignNumericColumns } from '@/lib/markup/numeric-columns';
import { DocCode } from '@/components/blazon/doc-code';
import { EmailSignature } from '@/components/blazon/email-signature';
import { ColorText } from '@/components/blazon/color-text';

const COVERS = {
  canvas: 'bg-muted text-foreground',
  accent: 'bg-primary text-primary-foreground',
  inverse: 'bg-[var(--blazon-inverse)] text-[var(--blazon-inverse-text)]',
} as const;

type Cover = keyof typeof COVERS;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Whether the brand's rules forbid a logo variant on the token that fills a theme role. */
function logoForbidden(data: BlazonData, role: ThemeRole, variant: string): boolean {
  const path = data.themeTokens?.[role];
  const token = path ? data.tokens.items.find((t) => t.path === path) : undefined;
  return Boolean(token && logoDenial(token, data.tokens.items, variant));
}

/** Logo usage tiles for the `<!-- blazon:logo-usage -->` directive: each variant on the background it is made for. */
function logoUsage(data: BlazonData): string {
  if (!data.logo) return '<p class="text-[13px] text-muted-foreground">No logo is configured (blazon.json → logo).</p>';
  const accent = logoOn(data, data.theme.accent, isDarkBackground(data.theme.accent, data.theme.accentText), false);
  // A surface the brand forbids this logo on is not shown with it: the rule says so on the token, and the page says it in words
  const forbidden = (role: ThemeRole, variant: string): boolean => logoForbidden(data, role, variant);
  // A dark theme makes the background the dark surface and the inverse the light one: each variant then stands on the other
  const swapped = isDarkBackground(data.theme.background, data.theme.text) && !isDarkBackground(data.theme.inverse, data.theme.inverseText);
  const background = { role: 'background' as const, className: 'bg-[var(--blazon-bg)] text-[var(--blazon-text)] border' };
  const inverse = { role: 'inverse' as const, className: 'bg-[var(--blazon-inverse)] text-[var(--blazon-inverse-text)]' };
  const [light, dark] = swapped ? [inverse, background] : [background, inverse];
  const tiles = [
    { label: 'On light backgrounds', className: light.className, src: forbidden(light.role, 'onLight') ? undefined : data.logo.onLight },
    { label: 'On dark backgrounds', className: dark.className, src: forbidden(dark.role, 'onDark') ? undefined : data.logo.onDark },
    {
      label: 'On the accent color',
      className: 'bg-primary text-primary-foreground',
      src:
        accent && accent === data.logo.onDark && forbidden('accent', 'onDark')
          ? undefined
          : accent && accent === data.logo.onLight && forbidden('accent', 'onLight')
            ? undefined
            : accent,
    },
  ].filter((t) => t.src);
  const figures = tiles.map(
    (t) =>
      `<figure class="flex min-h-40 flex-col justify-between gap-6 rounded-lg p-6 ${t.className}"><img class="my-auto h-7 w-auto self-center" src="${escapeAttr(t.src!)}" alt="" /><figcaption class="text-[13px]">${t.label}</figcaption></figure>`,
  );
  return `<div class="not-prose mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">${figures.join('')}</div>`;
}

/** Directives with no arguments expand to HTML before the page is split into sections. */
const HTML_DIRECTIVES: Record<string, (data: BlazonData) => string> = { 'logo-usage': logoUsage };

type Argued = Exclude<DirectiveName, 'logo-usage'>;
type Renderer = (props: { data: BlazonData; args: string[] }) => ReactNode;

/** One component per directive that takes arguments; a directive added to the core table without one fails to compile. */
const RENDERERS: Record<Argued, Renderer> = {
  tokens: ({ data, args }) => <TokenPreviews data={data} paths={args} />,
  assets: AssetFigures,
  section: AssetSection,
  icons: IconRows,
  'logo-on': LogoOn,
  'logo-contrast': LogoContrast,
  'logo-space': LogoSpace,
  'logo-lockups': LogoLockups,
  'logo-partner': LogoPartner,
  'logo-initiative': LogoInitiative,
  'logo-placement': LogoPlacement,
  'logo-misuse': LogoMisuse,
  'logo-colorways': LogoColorways,
  cards: SampleCards,
  strokes: StrokeSamples,
  spots: SpotTiles,
  'icon-set': IconSetBrowser,
  formats: FormatFrames,
  patterns: PatternTiles,
  'email-signature': EmailSignature,
};

const ARGUED = (Object.keys(RENDERERS) as Argued[]).join('|');

function expandDirectives(html: string, data: BlazonData): string {
  return (
    html
      // `<!-- blazon:tokens a.b -->`, `<!-- blazon:assets folder name -->` and the other directives drawn by a
      // component (`blazon:email-signature` takes no arguments) become placeholders that survive sectionize; DocBody renders them
      .replace(
        new RegExp(`<!--\\s*blazon:(${ARGUED})(?:\\s+([^>]*?))?\\s*-->`, 'g'),
        (_, kind: string, args: string | undefined) => `<div data-blazon-${kind}="${(args ?? '').replace(/"/g, '')}"></div>`,
      )
      .replace(/<!--\s*blazon:([\w-]+)\s*-->/g, (match, name: string) => HTML_DIRECTIVES[name]?.(data) ?? match)
  );
}

const PLACEHOLDER = new RegExp(`<div data-blazon-(${ARGUED})="([^"]*)"></div>`, 'g');

/** A section body: prose, with token paths linked, and live token cards or asset figures where the doc asked for them. */
function DocBody({ html, data }: { html: string; data: BlazonData }) {
  // split() with two capture groups repeats [prose, kind, args]; the prose comes first and last
  const parts = html.split(PLACEHOLDER);
  const blocks = [];
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i]!;
    splitCodeBlocks(prose).forEach((piece, j) => {
      if ('code' in piece) blocks.push(<DocCode key={`${i}-${j}`} code={piece.code} language={piece.language} />);
      else if (piece.html)
        blocks.push(<div key={`${i}-${j}`} data-print-split="" dangerouslySetInnerHTML={{ __html: badgeColorCodes(linkTokenPaths(alignNumericColumns(piece.html), data)) }} />);
    });
    const kind = parts[i + 1];
    const args = (parts[i + 2] ?? '').split(/\s+/).filter(Boolean);
    if (kind) {
      const Render = RENDERERS[kind as Argued];
      blocks.push(<Render key={`${i}-${kind}`} data={data} args={args} />);
    }
  }
  return <div className="blazon-prose min-w-0 max-w-[980px]">{blocks}</div>;
}

/** Splits doc HTML at each h2: the heading goes in the left column, what follows it on the right. */
function sectionize(html: string): { heading: string; body: string }[] {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild!;
  const sections: { heading: string; body: string }[] = [];
  let current = { heading: '', body: '' };
  const flush = () => {
    if (current.heading || current.body) sections.push(current);
    current = { heading: '', body: '' };
  };
  for (const node of Array.from(root.children)) {
    if (node.tagName === 'H2') {
      flush();
      current.heading = node.innerHTML;
    } else if (node.tagName !== 'H1') {
      // the cover already shows the title
      current.body += node.outerHTML;
    }
  }
  flush();
  return sections;
}

/** A heading's text without its markup: "Logo <em>sizes</em>" -> "Logo sizes". */
function headingText(heading: string): string {
  return new DOMParser().parseFromString(heading, 'text/html').body.textContent?.trim() ?? '';
}

/** A section's anchor from its heading's text: "Logo sizes" -> "section-logo-sizes". */
function headingId(text: string): string | undefined {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
  return slug ? `section-${slug}` : undefined;
}

/**
 * Each section with its heading text and an id that is its own: two headings with the same text get -2, -3 after the
 * first, and a heading of only symbols (no letters or digits to make a slug from) gets its position. The lead, before
 * the first heading, has none.
 */
function sectionIds<T extends { heading: string }>(sections: T[]): { section: T; text: string; id: string | undefined }[] {
  const seen = new Map<string, number>();
  return sections.map((section, index) => {
    const text = headingText(section.heading);
    if (!text) return { section, text, id: undefined };
    const base = headingId(text) ?? `section-${index + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { section, text, id: n === 1 ? base : `${base}-${n}` };
  });
}

/**
 * The full cover opens the book's first page and every chapter of the print book; the other pages open with a short
 * header, so a reader looking something up sees content on the first screen. `opener: full | compact` overrides it.
 */
function fullOpener(data: BlazonData, doc: DocItem): boolean {
  if (doc.meta.opener === 'full' || doc.meta.opener === 'compact') return doc.meta.opener === 'full';
  return data.docs[0]?.slug === doc.slug;
}

export function DocPage({ data, doc, mode, print = false }: { data: BlazonData; doc: DocItem; mode: Mode; print?: boolean }) {
  const cover: Cover = String(doc.meta.cover) in COVERS ? (String(doc.meta.cover) as Cover) : 'canvas';
  const full = print || fullOpener(data, doc);
  const group = docGroup(doc);
  // The canvas cover follows the viewer's mode; the accent and inverse covers keep their brand pair in both
  const dark =
    cover === 'canvas'
      ? mode === 'dark'
      : cover === 'accent'
        ? isDarkBackground(data.theme.accent, data.theme.accentText)
        : isDarkBackground(data.theme.inverse, data.theme.inverseText);
  const coverPaint = cover === 'accent' ? data.theme.accent : cover === 'inverse' ? data.theme.inverse : undefined;
  const picked = logoOn(data, coverPaint, dark, false);
  // The cover's logo follows the same rule as the usage tiles: none on a surface the brand forbids it on
  const variant = picked === undefined ? undefined : picked === data.logo?.onDark ? 'onDark' : picked === data.logo?.onLight ? 'onLight' : undefined;
  const coverRole: ThemeRole = cover === 'accent' ? 'accent' : cover === 'inverse' ? 'inverse' : 'background';
  const logo = variant !== undefined && logoForbidden(data, coverRole, variant) ? undefined : picked;
  const description = typeof doc.meta.description === 'string' ? doc.meta.description : undefined;
  const sections = sectionIds(sectionize(expandDirectives(doc.html, data)));

  return (
    <>
      {full ? (
        <section className={cn(GUTTER, COVERS[cover], 'relative flex min-h-[min(78vh,720px)] flex-col justify-center pt-8 pb-24')}>
          <p data-opener-label="" className="absolute top-7 text-[13px] font-semibold">
            {group}
          </p>
          {/* 40px at the narrowest: a long one-word title (Photography) is wider than a phone at 64px; hyphenation, then a break, is the last resort */}
          <h1 className="mb-7 font-heading text-[clamp(40px,10vw,152px)] leading-[0.95] font-semibold tracking-[-0.035em] hyphens-auto [overflow-wrap:anywhere]">{doc.title}</h1>
          {description && (
            <p className="max-w-[34em] text-base">
              <ColorText text={description} />
            </p>
          )}
          {logo && <img data-opener-mark="" className="absolute bottom-7 h-[22px] w-auto" src={logo} alt="" />}
        </section>
      ) : (
        <section className={cn(GUTTER, COVERS[cover], 'pt-12 pb-10')}>
          <p data-opener-label="" className="mb-3 text-[13px] font-semibold">
            {group}
          </p>
          <h1 className="font-heading text-[clamp(32px,4.5vw,56px)] leading-[1.05] font-semibold tracking-[-0.03em] [overflow-wrap:anywhere]">{doc.title}</h1>
          {description && (
            <p className="mt-4 max-w-[40em] text-base">
              <ColorText text={description} />
            </p>
          )}
        </section>
      )}
      {/* The print book is one long flow cut into slides: an index and the room it asks for would only narrow the measure */}
      {!print && <SectionIndex />}
      <article data-page-body="" className={GUTTER}>
        {sections.map(({ section, text, id }, index) => {
          return (
            <section
              key={index}
              id={id}
              data-section={text || undefined}
              className={cn(
                'grid scroll-mt-28 gap-x-12 gap-y-6 border-b py-10 last:border-b-0',
                // A page's lead, before its first heading, starts at the header's edge rather than in the content column
                section.heading && 'lg:grid-cols-[minmax(140px,220px)_minmax(0,1fr)]',
              )}
            >
              {section.heading && (
                <div>
                  <h2 className="text-[15px] font-semibold" dangerouslySetInnerHTML={{ __html: section.heading }} />
                </div>
              )}
              <DocBody html={section.body} data={data} />
            </section>
          );
        })}
      </article>
      <PageFooter title={data.title} trail={`${group} / ${doc.title}`} />
    </>
  );
}
