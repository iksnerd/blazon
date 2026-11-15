import { compareFindings } from '../order.js';
import path from 'node:path';
import {
  ASSET_URL_BASE,
  type AssetCategoryInfo,
  type AssetMeta,
  type Finding,
  type BlazonConfig,
  type BlazonData,
  type BlazonExtension,
  type IconSet,
  type SectionId,
  type SectionInfo,
  type ThemeRole,
  type TokenItem,
  type Vocabulary,
} from '../../types/index.js';
import { deriveShadcn, type ShadcnMapping } from '../tokens/shadcn.js';
import { BRAND_SCHEMA_FILE } from './schema.js';
import { artworkSize } from '../assets/measure.js';
import { assetSourcePath, categoryDirs } from '../assets/categories.js';
import { directivesIn } from '../docs/directives.js';
import { sameFile } from '../logo.js';
import { blazonIdentity, type BlazonIdentity } from '../blazon-pin.js';

// brand.json (RFC 0001 §12): the whole brand in one narrow, versioned file for tools in any language. It is a
// projection of what blazon knows, not the data the viewer receives: that one carries HTML, SVG markup and
// duplicates, and changes with every viewer refactor.

export const BRAND_FORMAT = 'blazon-brand';
/** Changes only when a field is removed or changes meaning. Adding a field does not change it. */
export const BRAND_VERSION = 1;

export interface BrandToken {
  path: string;
  type?: string;
  /** CSS-ready: "#635DFF", "24px" */
  value: string | number;
  /** DTCG structure with every alias replaced */
  resolvedValue: unknown;
  /** As authored, aliases included */
  rawValue: unknown;
  /** The parts of a composite value, CSS-ready */
  parts?: Record<string, string | number>;
  aliasOf?: string;
  description?: string;
  deprecated?: boolean | string;
  cssVariable: string;
  /** The token file it was authored in, in the project. Not shipped beside brand.json, unlike an asset's `file` */
  sourceFile: string;
  /** `$extensions` other than `dev.blazon`, as authored */
  extensions?: Record<string, unknown>;
  /** `dev.blazon`: usage, role, tier, print values, source, review, angle, preview */
  blazon?: BlazonExtension;
}

export interface BrandExport {
  /** The JSON Schema this file follows, as a path beside it */
  $schema: typeof BRAND_SCHEMA_FILE;
  format: typeof BRAND_FORMAT;
  version: typeof BRAND_VERSION;
  /** Which blazon wrote the file. No timestamp or host: the file is the same for the same inputs and blazon. `commit` and `dirty` are absent when blazon cannot say its commit */
  generator: { name: 'blazon'; commit?: string; dirty?: boolean };
  brand: { title: string; description?: string };
  theme: {
    roles: Partial<Record<ThemeRole, string>>;
    tokens: Partial<Record<ThemeRole, string>>;
    fonts: string[];
    /**
     * The shadcn/ui variables (names without the leading dashes): for each one blazon can supply, the token it comes from and its value in the
     * default context; `unsupplied` lists the rest; `pairs` (only when the brand declares contrast `pairs`) says which shadcn text-on-surface
     * pairs a rule covers. Blazon writes no shadcn file: the reader writes the CSS
     */
    shadcn: ShadcnMapping;
  };
  /** A path beside brand.json, or the file embedded as a data URI when it is not an asset. `onLightInk` and `onDarkInk`: the color a logo's sidecar declares for it, when it does; without one a reader judges the file as black on light or white on dark */
  logo: { onLight?: string; onDark?: string; onLightInk?: string; onDarkInk?: string };
  /** The lockups and usage roles a value may name: the standard ones, then the brand's own */
  vocabulary: Vocabulary;
  /** Every section a page may declare, with its title, so a reader needs no blazon to name a custom one */
  sections: SectionInfo[];
  tokens: BrandToken[];
  /** Groups that carry a description or rules: proportions, contrast pairs, patterns */
  groups: { path: string; description?: string; blazon: BlazonExtension }[];
  modifiers: { name: string; default: string; contexts: string[] }[];
  /**
   * Each non-default context with only what it changes: `tokens` have another value, `metadataChanges` (absent when there are none) keep the
   * default's value and say something else
   */
  contexts: { modifier: string; context: string; selector: string; tokens: BrandToken[]; metadataChanges?: BrandToken[] }[];
  pages: {
    slug: string;
    sourceFile: string;
    title: string;
    order: number;
    meta: Record<string, unknown>;
    sections: SectionId[];
    markdown: string;
    directives: { name: string; args: string[] }[];
  }[];
  assets: {
    id: string;
    name: string;
    category: string;
    /** Beside brand.json */
    file: string;
    format: string;
    mediaType: string;
    bytes: number;
    /** The artwork's own pixel size, when known */
    width?: number;
    height?: number;
    /** What its sidecar states */
    meta?: AssetMeta;
  }[];
  categories: AssetCategoryInfo[];
  iconSets: (IconSet & { /** The folder of `<icon>.svg` files, beside brand.json */ dir: string })[];
  findings: Finding[];
}

const hasKeys = (value: object | undefined): value is object => value !== undefined && Object.keys(value).length > 0;

function projectToken(token: TokenItem): BrandToken {
  return {
    path: token.path,
    ...(token.type && { type: token.type }),
    value: token.value,
    resolvedValue: token.resolvedValue,
    rawValue: token.rawValue,
    ...(token.parts && { parts: token.parts }),
    ...(token.aliasOf && { aliasOf: token.aliasOf }),
    ...(token.description && { description: token.description }),
    ...(token.deprecated && { deprecated: token.deprecated }),
    cssVariable: token.cssVariable,
    sourceFile: token.file,
    ...(hasKeys(token.extensions) && { extensions: token.extensions }),
    ...(hasKeys(token.blazon) && { blazon: token.blazon }),
  };
}

/**
 * The logo as a path beside brand.json when its file is a cataloged asset, which is the usual case, so a tool
 * reads the real file. A logo outside the assets folder is embedded instead, so it is never missing.
 */
function logoReferences(data: BlazonData, config: BlazonConfig, cwd: string): BrandExport['logo'] {
  const configured = typeof config.logo === 'string' ? { onLight: config.logo } : config.logo;
  if (!configured || !data.logo) return {};
  const assetsDir = path.resolve(cwd, config.assetsDir);
  const dirs = categoryDirs(config.assets, cwd);

  const pick = (file: string | undefined, embedded: string | undefined): string | undefined => {
    if (!file || !embedded) return undefined;
    const full = path.resolve(cwd, file);
    const asset = data.assets.all.find((candidate) => sameFile(assetSourcePath(candidate, assetsDir, dirs), full));
    return asset ? `${ASSET_URL_BASE}/${asset.filePath}` : embedded;
  };
  const onLight = pick(configured.onLight, data.logo.onLight);
  const onDark = pick(configured.onDark, data.logo.onDark);
  const { onLightInk, onDarkInk } = data.logo;
  return { ...(onLight && { onLight }), ...(onDark && { onDark }), ...(onLightInk && { onLightInk }), ...(onDarkInk && { onDarkInk }) };
}

/** Builds the export: a pure projection of the compiled brand, with no timestamps, so it is the same every time. */
export function buildBrandExport(data: BlazonData, config: BlazonConfig, cwd: string, identity: BlazonIdentity | null = blazonIdentity()): BrandExport {
  return {
    $schema: BRAND_SCHEMA_FILE,
    format: BRAND_FORMAT,
    version: BRAND_VERSION,
    generator: { name: 'blazon', ...(identity && { commit: identity.commit, dirty: identity.dirty }) },
    brand: { title: data.title, ...(data.description && { description: data.description }) },
    theme: {
      roles: data.theme,
      tokens: data.themeTokens ?? {},
      fonts: data.fonts,
      shadcn: deriveShadcn(
        data.theme,
        data.themeTokens ?? {},
        config.shadcn,
        data.tokens.items,
        data.tokens.groupMeta.flatMap((g) => g.blazon.pairs ?? []),
      ),
    },
    logo: logoReferences(data, config, cwd),
    vocabulary: data.vocabulary,
    sections: data.sections,
    tokens: data.tokens.items.map(projectToken),
    groups: data.tokens.groupMeta.map((g) => ({ path: g.path, ...(g.description && { description: g.description }), blazon: g.blazon })),
    modifiers: data.tokens.modifiers ?? [],
    contexts: (data.tokens.contexts ?? []).map((c) => ({
      modifier: c.modifier,
      context: c.context,
      selector: c.selector,
      tokens: c.tokens.map(projectToken),
      ...(c.metadataChanges && { metadataChanges: c.metadataChanges.map(projectToken) }),
    })),
    pages: data.docs.map((doc) => ({
      slug: doc.slug,
      sourceFile: doc.filePath,
      title: doc.title,
      order: doc.order,
      meta: doc.meta,
      sections: doc.sections,
      markdown: doc.markdown,
      directives: directivesIn(doc.markdown).map(({ name, args }) => ({ name, args })),
    })),
    assets: data.assets.all.map((asset) => {
      const size = artworkSize(asset);
      return {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        file: `${ASSET_URL_BASE}/${asset.filePath}`,
        format: asset.format,
        mediaType: asset.mediaType,
        bytes: asset.bytes,
        ...(size && { width: size.width, height: size.height }),
        ...(asset.meta && { meta: asset.meta }),
      };
    }),
    categories: data.assetCategories ?? [],
    iconSets: data.iconSets.map((set) => ({ ...set, dir: `${ASSET_URL_BASE}/icon-sets/${set.name}` })),
    findings: [...data.findings].sort(compareFindings),
  };
}

/** brand.json as written: two-space JSON with a final newline. */
export function formatBrandJson(data: BlazonData, config: BlazonConfig, cwd: string, identity?: BlazonIdentity | null): string {
  return `${JSON.stringify(buildBrandExport(data, config, cwd, identity), null, 2)}\n`;
}
