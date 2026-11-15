import fs from 'node:fs';
import path from 'node:path';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The file references in a list of sources: `$ref` strings that are not `#...` pointers to a set. */
function refsIn(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source) => (isObject(source) && typeof source.$ref === 'string' && !source.$ref.includes('#') ? [source.$ref] : []));
}

function refsInEntry(entry: unknown): string[] {
  if (!isObject(entry)) return [];
  const contexts = isObject(entry.contexts) ? Object.values(entry.contexts).flatMap(refsIn) : [];
  return [...refsIn(entry.sources), ...contexts];
}

/**
 * The files a resolver document reads: the document itself, and every token file its sources name, as absolute paths
 * (a reference resolves relative to the document). Read leniently, for the dev server's watcher: a document that is
 * missing or does not parse names only itself, so a half-finished edit never throws.
 */
export function resolverInputs(file: string): string[] {
  let content: unknown;
  try {
    content = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return [file];
  }
  if (!isObject(content)) return [file];
  const named = [
    ...Object.values(isObject(content.sets) ? content.sets : {}).flatMap(refsInEntry),
    ...Object.values(isObject(content.modifiers) ? content.modifiers : {}).flatMap(refsInEntry),
    // An item of resolutionOrder may hold its sources or contexts in place
    ...(Array.isArray(content.resolutionOrder) ? content.resolutionOrder.flatMap(refsInEntry) : []),
  ];
  const dir = path.dirname(file);
  return [file, ...new Set(named.map((ref) => path.resolve(dir, ref)))];
}
