import fs from 'node:fs';
import path from 'node:path';
import type { Finding, ParsedTokens, TokenContext, TokenItem } from '../../../types/index.js';
import { stripBom } from '../key-lines.js';
import { loadTokenDocuments } from '../merge.js';
import { resolveTokenTree } from '../resolve.js';
import { parseResolver, ResolverError, type Resolver } from './parse.js';
import { SourceReader, type Selection } from './sources.js';
import { finding } from '../../checker/catalogue.js';

export interface ContextCompilation {
  /** The default context, with `contexts` listing what each other context changes */
  tokens: ParsedTokens;
  /** Every non-default context resolved in full, for checking */
  resolved: { context: TokenContext; tokens: ParsedTokens }[];
}

function selectorFor(modifier: string, context: string, selectors: Record<string, string> | undefined): string {
  const template =
    (selectors && Object.hasOwn(selectors, modifier) ? selectors[modifier] : undefined) ?? (modifier === 'locale' ? ':lang({context})' : `[data-${modifier}="{context}"]`);
  return template.replace(/\{context\}/g, context);
}

function differs(a: TokenItem | undefined, b: TokenItem): boolean {
  return !a || a.value !== b.value || JSON.stringify(a.resolvedValue) !== JSON.stringify(b.resolvedValue);
}

/**
 * The fields beside the value that a context can change and CSS has nothing to say about: how the token is described, and how its value is
 * written. A token pointed at another token that holds the same value has the same CSS and a different `aliasOf`.
 */
const metadata = (t: TokenItem): string => JSON.stringify([t.type, t.description, t.deprecated, t.extensions, t.blazon, t.aliasOf, t.rawValue]);

/** Same CSS value as the default, but described or written differently: the part of a context's difference that CSS has nothing to say about. */
function metadataOnly(a: TokenItem | undefined, b: TokenItem): boolean {
  return a !== undefined && !differs(a, b) && metadata(a) !== metadata(b);
}

/** `collected` is what the reader already found in token files before the resolver failed: those findings are still true. */
function invalid(file: string, message: string, collected: Finding[] = []): ContextCompilation {
  const problems: Finding[] = [finding('resolver-invalid', { path: path.basename(file), message }), ...collected];
  return { tokens: resolveTokenTree({ tokens: [], groupMeta: [], problems }), resolved: [] };
}

/**
 * Compiles tokens through a DTCG resolver document: the defaults of every modifier become the main
 * token set, and each other context is resolved with one modifier changed at a time. Spec violations
 * become `resolver-invalid` errors rather than exceptions, like every other token problem.
 */
export function compileWithResolver(file: string, root: string, cssPrefix: string, selectors?: Record<string, string>): ContextCompilation {
  let resolver: Resolver;
  let reader: SourceReader;
  try {
    resolver = parseResolver(file, JSON.parse(stripBom(fs.readFileSync(file, 'utf-8'))));
    reader = new SourceReader(resolver, root);
  } catch (err) {
    return invalid(file, err instanceof ResolverError ? err.message : `cannot read the resolver document: ${String(err)}`);
  }

  try {
    const defaults: Selection = Object.fromEntries(resolver.modifiers.map((m) => [m.name, m.default]));
    const compile = (selection: Selection) => resolveTokenTree(loadTokenDocuments(reader.documents(selection)), cssPrefix);

    const base = compile(defaults);
    const resolved = resolver.modifiers.flatMap((modifier) =>
      Object.keys(modifier.contexts)
        .filter((context) => context !== modifier.default)
        .map((context) => {
          const tokens = compile({ ...defaults, [modifier.name]: context });
          return {
            context: {
              modifier: modifier.name,
              context,
              selector: selectorFor(modifier.name, context, selectors),
              tokens: tokens.items.filter((t) => differs(base.byPath.get(t.path), t)),
              ...(tokens.items.some((t) => metadataOnly(base.byPath.get(t.path), t)) && {
                metadataChanges: tokens.items.filter((t) => metadataOnly(base.byPath.get(t.path), t)),
              }),
            },
            tokens,
          };
        }),
    );

    base.problems.push(...reader.problems);
    const modifiers = resolver.modifiers.map((m) => ({ name: m.name, default: m.default, contexts: Object.keys(m.contexts) }));
    return { tokens: { ...base, contexts: resolved.map((r) => r.context), modifiers }, resolved };
  } catch (err) {
    if (err instanceof ResolverError) return invalid(file, err.message, reader.problems);
    throw err;
  }
}
