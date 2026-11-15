import path from 'node:path';

/** DTCG Resolver Module 2025.10 (https://www.designtokens.org/TR/2025.10/resolver/). */
export const RESOLVER_VERSION = '2025.10';
export const DEFAULT_RESOLVER_FILE = 'blazon.resolver.json';

export type Source = Record<string, unknown>;

export interface ModifierDef {
  name: string;
  contexts: Record<string, Source[]>;
  default: string;
}

export type OrderItem = { kind: 'set'; name: string; sources: Source[] } | { kind: 'modifier'; modifier: ModifierDef };

export interface Resolver {
  file: string;
  dir: string;
  sets: Record<string, Source[]>;
  modifiers: ModifierDef[];
  order: OrderItem[];
}

export class ResolverError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fail(message: string): never {
  throw new ResolverError(message);
}

function readSources(value: unknown, where: string): Source[] {
  if (!Array.isArray(value) || !value.every(isObject)) fail(`${where} must be an array of sources`);
  return value as Source[];
}

function readModifier(name: string, value: unknown): ModifierDef {
  if (!isObject(value) || !isObject(value.contexts)) fail(`modifier "${name}" must declare "contexts"`);
  const names = Object.keys(value.contexts);
  // §4.1.5.1: a modifier with no contexts MUST be an error
  if (names.length === 0) fail(`modifier "${name}" has no contexts`);
  const contexts = Object.fromEntries(names.map((c) => [c, readSources((value.contexts as Record<string, unknown>)[c], `context "${name}.${c}"`)]));
  // §4.1.5.3: default MUST name a context. Blazon also requires one: the default context is its main output.
  if (value.default === undefined) fail(`modifier "${name}" needs a "default" context; blazon compiles the defaults as its main tokens`);
  if (typeof value.default !== 'string' || !names.includes(value.default)) fail(`modifier "${name}" default "${String(value.default)}" is not one of its contexts`);
  return { name, contexts, default: value.default };
}

export function parseResolver(file: string, content: unknown): Resolver {
  if (!isObject(content)) fail('the resolver document must be a JSON object');
  if (content.version !== RESOLVER_VERSION) fail(`version must be "${RESOLVER_VERSION}", got ${JSON.stringify(content.version)}`);
  if (!Array.isArray(content.resolutionOrder)) fail('resolutionOrder is required and must be an array');

  const sets = Object.fromEntries(
    Object.entries(isObject(content.sets) ? content.sets : {}).map(([name, set]) => [name, readSources(isObject(set) ? set.sources : undefined, `set "${name}".sources`)]),
  );
  const modifiers = Object.entries(isObject(content.modifiers) ? content.modifiers : {}).map(([name, m]) => readModifier(name, m));

  const seenInline = new Set<string>();
  const order = content.resolutionOrder.map((item): OrderItem => {
    if (!isObject(item)) fail('resolutionOrder items must be objects');
    if (typeof item.$ref === 'string') {
      const set = item.$ref.match(/^#\/sets\/(.+)$/)?.[1];
      if (set !== undefined) {
        if (!Object.hasOwn(sets, set)) fail(`resolutionOrder points at ${item.$ref}, which does not exist`);
        return { kind: 'set', name: set, sources: sets[set]! };
      }
      const modifier = item.$ref.match(/^#\/modifiers\/(.+)$/)?.[1];
      const found = modifiers.find((m) => m.name === modifier);
      if (!found) fail(`resolutionOrder points at ${item.$ref}, which does not exist`);
      return { kind: 'modifier', modifier: found };
    }
    // §4.1.6.1: inline items need a name and a type, and names must be unique
    if (typeof item.name !== 'string' || (item.type !== 'set' && item.type !== 'modifier')) {
      fail('an inline resolutionOrder item needs "name" and "type" ("set" or "modifier")');
    }
    if (seenInline.has(item.name)) fail(`inline resolutionOrder name "${item.name}" is used twice`);
    seenInline.add(item.name);
    if (item.type === 'set') return { kind: 'set', name: item.name, sources: readSources(item.sources, `inline set "${item.name}".sources`) };
    const inline = readModifier(item.name, item);
    modifiers.push(inline);
    return { kind: 'modifier', modifier: inline };
  });

  return { file, dir: path.dirname(file), sets, modifiers, order };
}
