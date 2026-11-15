import type { AssetCatalog, AssetMeta, Finding, DocItem, IconSet, ParsedTokens, TokenItem } from '../../types/index.js';
import { formatsAt, patternsAt } from '../tokens/groups.js';
import { finding } from '../checker/catalogue.js';

/** Which tokens a directive argument may name. */
export type TokenKind = 'any' | 'paint' | 'border' | 'paint-or-border';

export interface DirectiveSpec {
  /** The first argument names an asset folder (`icons`, `logo-usage`, a custom folder) */
  folder?: boolean;
  /** Arguments after the folder name assets in it; with none, the whole folder */
  assetNames?: boolean;
  /** The token paths the directive takes, by what each must resolve to */
  tokens?: TokenKind;
  /** The paths name groups that are social formats or patterns (RFC 0001 §8) */
  groups?: 'format' | 'pattern';
  /** Takes no arguments at all */
  bare?: boolean;
  /** The first argument names an icon set from `iconSets`; the rest name its categories */
  iconSet?: boolean;
  /** Draws the configured logo, so it is an error to use without one */
  needsLogo?: boolean;
  /** The arguments are this many asset ids, each written `category/name`, then (with `text`) an optional free text */
  assetRefs?: number;
  /** After the asset ids, one optional free-text argument: a URL, a name */
  text?: boolean;
  /**
   * Draws what an asset's sidecar states: at least one of these fields must be stated. For a folder
   * directive, by at least one asset it names; for asset ids, by the first.
   */
  needsMeta?: readonly (keyof AssetMeta)[];
  /** Generates from the config's `emailSignature` block, so it is an error to use without one */
  needsEmailSignature?: boolean;
}

/**
 * Every `<!-- blazon:name args -->` a guideline page may place. The viewer renders each from this table
 * and `blazon check` validates each page against it, so a new directive is one entry here and one
 * component in the viewer.
 */
export const DIRECTIVES = {
  tokens: { tokens: 'any' },
  assets: { folder: true, assetNames: true },
  section: { folder: true, assetNames: true },
  icons: { folder: true, tokens: 'paint' },
  'logo-usage': { bare: true, needsLogo: true },
  'logo-on': { tokens: 'paint', needsLogo: true },
  'logo-contrast': { tokens: 'paint', needsLogo: true },
  'logo-space': { folder: true, assetNames: true, needsMeta: ['clearSpace', 'minSize'] },
  'logo-lockups': { folder: true, assetNames: true, needsMeta: ['lockup'] },
  'logo-partner': { assetRefs: 2, needsMeta: ['partnership'] },
  'logo-initiative': { assetRefs: 1, needsMeta: ['initiative'] },
  'logo-placement': { assetRefs: 1, text: true, needsMeta: ['placement'] },
  cards: { tokens: 'paint' },
  strokes: { tokens: 'border' },
  spots: { tokens: 'paint-or-border' },
  'icon-set': { iconSet: true },
  formats: { groups: 'format' },
  patterns: { groups: 'pattern' },
  'email-signature': { bare: true, needsEmailSignature: true },
} as const satisfies Record<string, DirectiveSpec>;

export type DirectiveName = keyof typeof DIRECTIVES;

export function isDirective(name: string): name is DirectiveName {
  return Object.hasOwn(DIRECTIVES, name);
}

const PAINT_TYPES: readonly string[] = ['color', 'gradient'];

export function isPaint(token: TokenItem): boolean {
  return PAINT_TYPES.includes(token.type ?? '');
}

export function isBorder(token: TokenItem): boolean {
  return token.type === 'border';
}

const KINDS: Record<TokenKind, (token: TokenItem) => boolean> = {
  any: () => true,
  paint: isPaint,
  border: isBorder,
  'paint-or-border': (t) => isPaint(t) || isBorder(t),
};

/** The tokens a path names: the token itself, or every token under it when it is a group ("icon.marketing", "icon.marketing.*"). */
export function tokensAt(items: readonly TokenItem[], path: string): TokenItem[] {
  const clean = path.replace(/\.\*$/, '');
  const exact = items.find((t) => t.path === clean);
  if (exact) return [exact];
  return items.filter((t) => t.path.startsWith(`${clean}.`));
}

/** The tokens a path names that a directive argument of this kind accepts. */
export function tokensOfKind(items: readonly TokenItem[], path: string, kind: TokenKind): TokenItem[] {
  return tokensAt(items, path).filter(KINDS[kind]);
}

export interface PlacedDirective {
  name: string;
  args: string[];
  /** The comment as written, for messages */
  text: string;
}

/** The Markdown with its fenced code blocks (``` and ~~~) cut out, so what a page shows as an example is not read as the page. */
export const withoutFences = (markdown: string): string => markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');

/**
 * The directives a page's Markdown places. Code fences and inline code are skipped: a page that shows
 * the syntax as an example must not be taken to use it.
 */
export function directivesIn(markdown: string): PlacedDirective[] {
  const prose = withoutFences(markdown).replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/<!--\s*blazon:([\w-]+)(?:\s+([^>]*?))?\s*-->/g)].map((m) => ({
    name: m[1]!,
    args: (m[2] ?? '').split(/\s+/).filter(Boolean),
    text: m[0],
  }));
}

export interface DirectiveContext {
  tokens: Pick<ParsedTokens, 'items' | 'groupMeta'>;
  assets: AssetCatalog;
  hasLogo: boolean;
  /** Icon sets read from packages; absent means none */
  iconSets?: IconSet[];
  /** Local categories whose images are not in this checkout: a directive that needs them is not checked */
  absentLocal?: ReadonlySet<string>;
  /** The logo files are in such a category */
  logoIsAbsentLocal?: boolean;
  /** Ids of assets in experimental or reference categories: drawing one is not `needs-review-in-use` */
  ungated?: ReadonlySet<string>;
  /** The config has an `emailSignature` block */
  hasEmailSignature?: boolean;
}

/** True when a directive needs images that are kept out of git and not here, which a note already says. */
function waitsForLocalArt(directive: PlacedDirective, context: DirectiveContext): boolean {
  if (!isDirective(directive.name)) return false;
  const spec: DirectiveSpec = DIRECTIVES[directive.name];
  const absent = context.absentLocal ?? new Set<string>();
  if (spec.needsLogo && context.logoIsAbsentLocal) return true;
  if (spec.folder && directive.args[0] && absent.has(directive.args[0])) return true;
  if (spec.assetRefs) return directive.args.slice(0, spec.assetRefs).some((ref) => absent.has(ref.split('/')[0]!));
  return false;
}

/** The asset folders that have files, by name. It has no prototype: a directive's `constructor` or `__proto__` is a folder that is not there. */
function folders(assets: AssetCatalog): Record<string, AssetCatalog['all']> {
  const all: Record<string, AssetCatalog['all']> = { logos: assets.logos, icons: assets.icons, ...assets.custom };
  const found: Record<string, AssetCatalog['all']> = Object.create(null);
  for (const [name, list] of Object.entries(all)) if (list.length > 0) found[name] = list;
  return found;
}

function problems(directive: PlacedDirective, context: DirectiveContext): string[] {
  if (!isDirective(directive.name)) {
    return [`unknown directive blazon:${directive.name}; known: ${Object.keys(DIRECTIVES).join(', ')}`];
  }
  const spec: DirectiveSpec = DIRECTIVES[directive.name];
  const { args } = directive;
  const found: string[] = [];
  if (spec.bare && args.length > 0) found.push('takes no arguments');
  if (!spec.bare && args.length === 0) found.push('needs at least one argument');
  if (spec.needsLogo && !context.hasLogo) found.push('needs a logo (blazon.config.ts → logo)');
  if (spec.needsEmailSignature && !context.hasEmailSignature) found.push('needs an email signature (blazon.config.ts → emailSignature)');

  let rest = args;
  if (spec.folder && args[0]) {
    const folder = folders(context.assets)[args[0]];
    if (!folder) found.push(`no asset at ${args[0]}`);
    else {
      const names = args.slice(1);
      if (spec.assetNames) {
        for (const name of names) if (!folder.some((a) => a.name === name)) found.push(`no asset at ${args[0]}/${name}`);
      }
      if (spec.needsMeta) {
        const fields = spec.needsMeta;
        const picked = names.length ? folder.filter((a) => names.includes(a.name)) : folder;
        if (!picked.some((a) => fields.some((field) => a.meta?.[field] !== undefined))) {
          found.push(`no asset at ${names.length ? names.map((n) => `${args[0]}/${n}`).join(', ') : args[0]} states a ${fields.join(' or ')} in its sidecar`);
        }
      }
    }
    rest = args.slice(1);
  }
  if (spec.assetRefs && args.length > 0) {
    const refs = args.slice(0, spec.assetRefs);
    const extra = args.length - spec.assetRefs;
    if (spec.text ? args.length < spec.assetRefs || extra > 1 : args.length !== spec.assetRefs) {
      found.push(spec.text ? 'takes an asset id and at most one text' : `needs ${spec.assetRefs} asset id${spec.assetRefs === 1 ? '' : 's'}, each written category/name`);
    }
    refs.forEach((ref, index) => {
      if (!ref.includes('/')) {
        found.push(`"${ref}" is not an asset id; write category/name`);
        return;
      }
      const asset = context.assets.all.find((candidate) => candidate.id === ref);
      if (!asset) {
        found.push(`no asset at ${ref}`);
        return;
      }
      const fields = spec.needsMeta;
      if (index === 0 && fields && !fields.some((field) => asset.meta?.[field] !== undefined)) {
        found.push(`${ref} states no ${fields.join(' or ')} in its sidecar`);
      }
    });
  }
  if (spec.iconSet && args[0]) {
    const sets = context.iconSets ?? [];
    const set = sets.find((candidate) => candidate.name === args[0]);
    if (!set) found.push(`no icon set at ${args[0]}; known: ${sets.map((candidate) => candidate.name).join(', ') || 'none (add iconSets to blazon.config.ts)'}`);
    else {
      for (const category of args.slice(1)) {
        if (!set.categories.some((c) => c.name === category)) found.push(`no category ${category} in ${set.name}; known: ${set.categories.map((c) => c.name).join(', ')}`);
      }
    }
  }
  if (spec.groups) {
    for (const path of rest) {
      const { found: resolved, problems: mistakes } = spec.groups === 'format' ? formatsAt(context.tokens, path) : patternsAt(context.tokens, path);
      found.push(...mistakes);
      if (resolved.length === 0 && mistakes.length === 0) found.push(`no ${spec.groups} at ${path}`);
    }
  }
  if (spec.tokens) {
    for (const path of rest) {
      if (tokensOfKind(context.tokens.items, path, spec.tokens).length === 0) {
        const wanted =
          spec.tokens === 'any' ? 'token' : spec.tokens === 'paint' ? 'color or gradient token' : spec.tokens === 'border' ? 'border token' : 'color, gradient or border token';
        found.push(`no ${wanted} at ${path}`);
      }
    }
  }
  return found;
}

/** The assets a directive draws: a folder (or the names in it) or the asset ids it is given. */
function assetsDrawnBy(directive: PlacedDirective, assets: AssetCatalog): AssetCatalog['all'] {
  if (!isDirective(directive.name)) return [];
  const spec: DirectiveSpec = DIRECTIVES[directive.name];
  if (spec.assetRefs) return directive.args.slice(0, spec.assetRefs).flatMap((ref) => assets.all.filter((a) => a.id === ref));
  const [folder, ...names] = directive.args;
  if (!spec.folder || !folder) return [];
  return (folders(assets)[folder] ?? []).filter((a) => names.length === 0 || names.includes(a.name));
}

const NAMES_SHOWN = 5;

/**
 * One warning for each page that draws an asset whose sidecar is still `needs-review` (not one in an experimental or reference category), with how many and which:
 * the asset's own warning says it is unconfirmed, this says a guideline page now shows it as the brand's.
 */
function reviewInUseFindings(docs: readonly DocItem[], assets: AssetCatalog, ungated: ReadonlySet<string>): Finding[] {
  return docs.flatMap((doc): Finding[] => {
    const flagged = [
      ...new Set(
        directivesIn(doc.markdown)
          .flatMap((d) => assetsDrawnBy(d, assets))
          .filter((a) => a.meta?.review?.status === 'needs-review' && !ungated.has(a.id))
          .map((a) => a.id),
      ),
    ];
    if (flagged.length === 0) return [];
    const shown = flagged.slice(0, NAMES_SHOWN).join(', ');
    const names = flagged.length > NAMES_SHOWN ? `${shown} and ${flagged.length - NAMES_SHOWN} more` : shown;
    return [finding('needs-review-in-use', { path: doc.filePath, message: `Shows ${flagged.length} asset${flagged.length === 1 ? '' : 's'} still marked needs-review: ${names}` })];
  });
}

/**
 * Checks every directive on every page: a known name, the right number of arguments, and arguments that
 * resolve to what the directive draws. The viewer shows a red line for the same mistakes; this makes
 * them a build error.
 */
export function directiveFindings(docs: readonly DocItem[], context: DirectiveContext): Finding[] {
  return [...invalidDirectives(docs, context), ...reviewInUseFindings(docs, context.assets, context.ungated ?? new Set())];
}

function invalidDirectives(docs: readonly DocItem[], context: DirectiveContext): Finding[] {
  return docs.flatMap((doc) =>
    directivesIn(doc.markdown).flatMap((directive) =>
      (waitsForLocalArt(directive, context) ? [] : problems(directive, context)).map((message): Finding =>
        finding(isDirective(directive.name) ? 'directive-invalid' : 'directive-unknown', {
          path: doc.filePath,
          message: `${directive.text}: ${message}`,
        }),
      ),
    ),
  );
}
