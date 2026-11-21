import type { BlazonData, FontMeta, TokenItem } from '../../types/index.js';
import { typographyClassName } from '../../core/tokens/names.js';
import { cleanFontMeta } from '../../core/font-roles.js';
import { findingsFor } from '@/lib/brand';
import { copy } from '@/lib/copy';
import { firstFamily, humanize, styleLabel } from '@/lib/tokens/format';
import { Doc, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { ReviewFlag } from '@/components/blazon/review-flag';
import { ColorText } from '@/components/blazon/color-text';

// The brand book does not load it. A computer that has it installed still shows it, so the note says which font is used, not that it is a fallback.
const NOT_LOADED = 'Not loaded by this brand book: the specimen uses the first font in its stack that this computer has.';

/** The typeface token a style's fontFamily aliases, when the brand book cannot load it. */
function unloadedFamily(data: BlazonData, token: TokenItem): TokenItem | undefined {
  const raw = token.rawValue as { fontFamily?: unknown } | undefined;
  const alias = typeof raw?.fontFamily === 'string' ? raw.fontFamily.match(/^\{([^{}]+)\}$/)?.[1] : undefined;
  const family = alias ? data.tokens.items.find((t) => t.path === alias) : undefined;
  return family && family.blazon.webFont !== undefined ? family : undefined;
}

/** Where the typeface comes from and its license, as the token states them. An address is text, not a link: the card is a button and a link in it cannot be followed. */
function FontFacts({ font }: { font: FontMeta }) {
  const license = [font.license, font.licenseUrl].filter(Boolean).join(', ');
  return (
    <span data-font-facts="" className="flex flex-col text-[13px] text-muted-foreground">
      {font.role && <span>Role: {font.role}</span>}
      {font.reason && <span>Why: {font.reason}</span>}
      {font.fallbackFor && <span>Stands in for: {font.fallbackFor}</span>}
      {font.source && <span>Source: {font.source}</span>}
      {license && <span>License: {license}</span>}
    </span>
  );
}

export function TypographyPage({ data }: { data: BlazonData }) {
  const allFamilies = data.tokens.items.filter((t) => t.type === 'fontFamily');
  // A token that only aliases another typeface (a style's own fontFamily) would repeat its card
  const familyPaths = new Set(allFamilies.map((t) => t.path));
  const families = allFamilies.filter((t) => !t.aliasOf || !familyPaths.has(t.aliasOf));
  const styles = data.tokens.items.filter((t) => t.type === 'typography');
  const weights = data.tokens.items.filter((t) => t.type === 'fontWeight');

  return (
    <>
      <PageHeader label="Tokens" title="Typography" intro="Each style is set in itself. Click a style to copy its class name from typography.css." />
      <Doc>
        {families.length > 0 && (
          <Section heading="Typefaces">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
              {families.map((token) => (
                <button
                  key={token.path}
                  type="button"
                  data-token={token.path}
                  className="relative flex flex-col gap-1 rounded-lg bg-muted p-6 text-left"
                  onClick={() => copy(`var(${token.cssVariable})`)}
                >
                  {findingsFor(data, token.path).length > 0 && <ReviewFlag className="absolute top-4 right-4" />}
                  <span className="text-[96px] leading-none" style={{ fontFamily: String(token.value) }}>
                    Aa
                  </span>
                  <span className="mt-4 font-semibold">{firstFamily(token.value)}</span>
                  {token.description && (
                    <span className="text-[13px] text-muted-foreground">
                      <ColorText text={token.description} />
                    </span>
                  )}
                  {token.blazon.webFont !== undefined && (
                    <span data-not-loaded="" className="flex flex-col text-[13px] text-muted-foreground">
                      <span>{NOT_LOADED}</span>
                      {token.blazon.webFont && <span>{token.blazon.webFont}</span>}
                    </span>
                  )}
                  {token.blazon.font && <FontFacts font={cleanFontMeta(token.blazon.font)} />}
                  <code className="font-mono text-xs text-muted-foreground">{token.path}</code>
                </button>
              ))}
            </div>
          </Section>
        )}
        {styles.length > 0 && (
          <Section heading="Font scale" wide>
            <ol className="flex flex-col">
              {styles.map((token) => (
                <li key={token.path} data-token={token.path}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b py-4 text-left"
                    title="Copy class name"
                    onClick={() => copy(typographyClassName(token.path))}
                  >
                    <span style={{ font: String(token.value), letterSpacing: String(token.parts?.letterSpacing ?? 'normal') }}>{styleLabel(token)}</span>
                    <span className="flex items-center gap-2">
                      {unloadedFamily(data, token) && (
                        <span data-not-loaded="" className="text-xs text-muted-foreground" title={NOT_LOADED}>
                          Not loaded here
                        </span>
                      )}
                      <code className="font-mono text-xs text-muted-foreground">{token.path}</code>
                      {findingsFor(data, token.path).length > 0 && <ReviewFlag />}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}
        {weights.length > 0 && (
          <Section heading="Weights">
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-2xl">
              {weights.map((token) => (
                <button key={token.path} type="button" style={{ fontWeight: String(token.value) }} onClick={() => copy(`var(${token.cssVariable})`)}>
                  {humanize(token.name)} {String(token.value)}
                </button>
              ))}
            </div>
          </Section>
        )}
      </Doc>
      <PageFooter title={data.title} trail="Tokens / Typography" />
    </>
  );
}
