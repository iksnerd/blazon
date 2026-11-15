import fs from 'node:fs';
import path from 'node:path';
import type { Finding, BlazonConfig, BlazonData, LogoSet, ParsedTokens, Vocabulary } from '../types/index.js';
import { loadTokenTree } from './tokens/load.js';
import { resolveTokenTree } from './tokens/resolve.js';
import { DEFAULT_RESOLVER_FILE } from './tokens/resolver/parse.js';
import { compileWithResolver, type ContextCompilation } from './tokens/resolver/compile.js';
import { parseDocs } from './docs/parser.js';
import { directiveFindings } from './docs/directives.js';
import { fontMetaFindings } from './checker/font-meta.js';
import { CONFIGURED_LOGO_VARIANTS, logoRuleFindings } from './checker/logo-rules.js';
import { outputDirProblems } from './outputs.js';
import { resolveConfig } from './config/validate.js';
import { resolveVocabulary } from './config/vocabulary.js';
import { configuredSections, missingSections } from './docs/sections.js';
import { scanIconSets } from './icons/icon-sets.js';
import { unitFindings } from './assets/measure.js';
import {
  absentLocalCategories,
  absentLocalFindings,
  assetCategoryInfo,
  categoryDirs,
  ungatedAssetIds,
  resolveCategories,
  ruleFindings,
  unusedFindings,
} from './assets/categories.js';
import { scanAssets } from './assets/scanner.js';
import { initiativeFindings, replacementFindings } from './assets/sidecar.js';
import { checkTokens } from './checker/index.js';
import { withoutCascade } from './checker/cascade.js';
import { staleApprovals } from './checker/approvals.js';
import { resolveTheme, shadcnProblems } from './brand-theme.js';
import { starterFileFindings, starterLogoFindings } from './starter.js';
import { declareInks, loadLogo, logoFiles } from './logo.js';
import { fontFindings, loadFonts } from './fonts.js';
import { logoSurfaceFindings } from './checker/logo-surfaces.js';
import { pageTokenFindings } from './checker/page-tokens.js';
import { keyLines } from './tokens/key-lines.js';
import { finding } from './checker/catalogue.js';
import { compareFindings } from './order.js';

export { emitTokenOutputs, planTokenOutputs } from './emit.js';
export { outputDirProblems } from './outputs.js';
export { assertCanWrite, writeBlockers, type WriteOptions } from './preflight.js';

/** The sentences of outputDirProblems (outputs.ts) as findings, one error each. */
function outputDirFindings(config: BlazonConfig, cwd: string): Finding[] {
  return outputDirProblems(config, cwd).map((message) => finding('output-dirs-overlap', { path: 'blazon.json', message }));
}

/**
 * Compiles all source files into unified BlazonData in-memory
 */
export async function compileBlazonData(input: BlazonConfig, cwd: string = process.cwd()): Promise<BlazonData> {
  // A key that is wrong is reported and left out, so the rest of the compile never sees it
  const { config, problems: configProblems } = resolveConfig(input as unknown as Record<string, unknown>);
  const tokensDirPath = path.resolve(cwd, config.tokensDir);
  const docsDirPath = path.resolve(cwd, config.docsDir);
  const assetsDirPath = path.resolve(cwd, config.assetsDir);

  // 1. Tokens: through the DTCG resolver document when there is one, else every file in tokensDir
  const resolverPath = path.resolve(cwd, config.resolver ?? DEFAULT_RESOLVER_FILE);
  const resolverExists = fs.existsSync(resolverPath);
  const compiled = resolverExists
    ? compileWithResolver(resolverPath, cwd, config.cssPrefix, config.contextSelectors)
    : { tokens: resolveTokenTree(loadTokenTree(tokensDirPath, cwd), config.cssPrefix), resolved: [] };
  const resolvedTokens = compiled.tokens;
  const missingResolver: Finding[] =
    config.resolver && !resolverExists ? [finding('resolver-invalid', { path: config.resolver, message: `resolver ${config.resolver} does not exist` })] : [];

  // 2. Docs
  const { vocabulary, sections } = resolveVocabulary(config);
  const validSections = sections.map((section) => section.id);
  const docProblems: Finding[] = [];
  const docs = parseDocs(docsDirPath, docProblems, validSections);
  docProblems.push(...missingSections(docs, configuredSections(config.sections, validSections, docProblems), validSections));

  // 3. Assets
  const assetProblems: Finding[] = [];
  const categories = resolveCategories(config.assets, cwd);
  const assets = scanAssets(assetsDirPath, { tokens: resolvedTokens, problems: assetProblems, extraRoots: categories.roots, lockups: vocabulary.lockups });
  // An experimental category holds explorations and a reference category holds material kept for comparison: a sidecar's review is data there, and its warnings do not gate the book
  const ungated = ungatedAssetIds(assets, categories.configs);
  assetProblems.splice(0, assetProblems.length, ...assetProblems.filter((f) => !((f.code === 'review-pending' || f.code === 'asset-review-missing') && ungated.has(f.path))));
  assetProblems.push(...categories.problems, ...unusedFindings(assets, categories.configs), ...ruleFindings(assets, categories.configs), ...unitFindings(assets.all));
  // A local category with no image was not made in this checkout: one note, and none of the findings that follows from it
  const absentLocal = absentLocalCategories(assets, categories.configs);
  const inAbsentLocal = (file: string) => absentLocal.has(path.relative(assetsDirPath, path.resolve(cwd, file)).split(path.sep)[0]!);
  const localProblems = [
    ...absentLocalFindings(absentLocal, categories.configs),
    ...replacementFindings(assets.all, absentLocal),
    ...initiativeFindings(assets.all, absentLocal),
    ...assetProblems.filter((f) => !(f.code === 'asset-sidecar-orphaned' && absentLocal.has(f.path.split('/')[0]!))),
  ];

  const icons = scanIconSets(config.iconSets, cwd);
  const theme = resolveTheme(config, resolvedTokens);
  const fonts = loadFonts(config.fonts, cwd);
  const logo = loadLogo(config, cwd, inAbsentLocal);
  const logoIsAbsentLocal = !logo.set && logoFiles(config).some(inAbsentLocal);
  const directives = directiveFindings(docs, {
    tokens: resolvedTokens,
    assets,
    hasLogo: Boolean(logo.set),
    iconSets: icons.iconSets,
    absentLocal,
    logoIsAbsentLocal,
    ungated,
    hasEmailSignature: Boolean(config.emailSignature),
  });

  // A finding about a token or an asset says which file to open: tokens are in the tokens folder, assets in the assets folder
  const files = new Map<string, string>();
  const inProject = (dir: string, file: string): string => path.relative(cwd, path.join(dir, file)).split(path.sep).join('/');
  // Every token file is named from the project root, whichever loader read it; a source written inside a resolver document is the resolver
  const resolverFile = path.relative(cwd, resolverPath).split(path.sep).join('/');
  for (const item of resolvedTokens.items) files.set(item.path, item.file.replace(/ \(inline\)$/, ''));
  for (const asset of assets.all) files.set(asset.id, inProject(assetsDirPath, asset.filePath));
  // and a token's finding also says which line of that file its key is on
  const keys = new Map<string, Map<string, number>>();
  const lineIn = (file: string, tokenPath: string): number | undefined => {
    if (!keys.has(file)) {
      let text = '';
      try {
        text = fs.readFileSync(path.join(cwd, file), 'utf-8');
      } catch {
        // a file that cannot be read has no lines to point at
      }
      keys.set(file, keyLines(text));
    }
    return keys.get(file)!.get(tokenPath);
  };
  const tokenPaths = new Set(resolvedTokens.items.map((item) => item.path));
  const located = (finding: Finding): Finding => {
    const file = finding.file ?? files.get(finding.path);
    if (file === undefined || finding.line !== undefined) return finding;
    // The keys of a resolver document are not token paths, so a token written inside it has no line of its own
    const line = (tokenPaths.has(finding.path) || finding.context !== undefined) && file !== resolverFile ? lineIn(file, finding.path) : undefined;
    return { ...finding, file, ...(line !== undefined && { line }) };
  };

  const noTokens: Finding[] =
    resolvedTokens.items.length === 0
      ? [finding('tokens-missing', { path: path.relative(cwd, tokensDirPath) || config.tokensDir, message: 'the tokens folder holds no tokens, so the book has nothing to show' })]
      : [];

  return {
    title: config.title,
    description: config.description,
    tokens: resolvedTokens,
    findings: withoutCascade(
      [
        ...configProblems,
        ...noTokens,
        ...outputDirFindings(config, cwd),
        ...contextFindings(resolvedTokens, compiled.resolved, vocabulary, [...CONFIGURED_LOGO_VARIANTS, ...assets.logos.map((a) => a.id)]),
        ...missingResolver,
        ...docProblems,
        ...starterFileFindings(cwd, { docs: config.docsDir, tokens: config.tokensDir, assets: config.assetsDir }),
        ...starterLogoFindings(cwd, logoFiles(config)),
        ...localProblems,
        ...icons.problems,
        ...theme.problems,
        ...shadcnProblems(config, resolvedTokens),
        ...fonts.problems,
        ...fontFindings(resolvedTokens, fonts),
        ...logo.problems,
        ...staleApprovals(resolvedTokens, assets.all, { assetsDir: assetsDirPath, dirs: categoryDirs(config.assets, cwd) }),
        ...logoContextFindings(logo.set, config, theme, resolvedTokens, compiled.resolved),
        ...pageTokenFindings(docs, resolvedTokens.items),
        ...directives,
      ].map(located),
    ).sort(compareFindings),
    theme: theme.values,
    themeTokens: theme.tokens,
    fonts: fonts.stylesheets,
    ...(logo.set && { logo: declareInks(logo.set, config, cwd, assets) }),
    docs,
    assets,
    iconSets: icons.iconSets,
    assetCategories: assetCategoryInfo(assets, categories.configs),
    vocabulary,
    sections,
    ...(config.emailSignature && { emailSignature: config.emailSignature }),
  };
}

/**
 * `logo-contrast-insufficient` for the default context, plus what another context adds by changing a theme role's token (a dark theme's
 * background), tagged with it. The theme roles are resolved again from that context's tokens, as the book's mode switch does.
 */
function logoContextFindings(
  logo: LogoSet | undefined,
  config: BlazonConfig,
  theme: ReturnType<typeof resolveTheme>,
  base: ParsedTokens,
  resolved: ContextCompilation['resolved'],
): Finding[] {
  const baseFindings = logoSurfaceFindings(logo, theme.values, theme.tokens, base.items);
  const seen = new Set(baseFindings.map((f) => f.message));
  const extra = resolved.flatMap(({ context, tokens }) => {
    const roles = resolveTheme(config, tokens);
    return logoSurfaceFindings(logo, roles.values, roles.tokens, tokens.items)
      .filter((f) => !seen.has(f.message))
      .map((f) => ({ ...f, context: `${context.modifier}=${context.context}` }));
  });
  return [...baseFindings, ...extra];
}

/**
 * Check findings for the default context, plus those that occur only in another context,
 * tagged with it ("locale=ja"). A finding the default already has is not repeated per context.
 */
function contextFindings(base: ParsedTokens, resolved: ContextCompilation['resolved'], vocabulary: Vocabulary, logoVariants: readonly string[]): Finding[] {
  const findingsOf = (tokens: ParsedTokens) => [
    ...checkTokens({ tokens, vocabulary }).all,
    ...fontMetaFindings(tokens.items, tokens.groupMeta),
    ...logoRuleFindings(tokens.items, tokens.groupMeta, logoVariants),
  ];
  const baseFindings = findingsOf(base);
  const key = (f: Finding) => `${f.code}\u0000${f.path}\u0000${f.message}`;
  const seen = new Set(baseFindings.map(key));
  const extra = resolved.flatMap(({ context, tokens }) =>
    findingsOf(tokens)
      .filter((f) => !seen.has(key(f)))
      .map((f) => {
        // The file is the one this context's token was written in, not the default context's
        const file = tokens.items.find((item) => item.path === f.path)?.file.replace(/ \(inline\)$/, '');
        return { ...f, context: `${context.modifier}=${context.context}`, ...(f.file === undefined && file !== undefined && { file }) };
      }),
  );
  return [...baseFindings, ...extra];
}
