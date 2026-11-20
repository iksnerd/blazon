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

/**
 * Names of modifiers, contexts and sets end up in output file names (`tokens.<modifier>.<context>.json`), CSS selectors and CSS comments.
 * The DTCG resolver module does not restrict them; blazon does, so that none can name another folder or close a comment.
 */
export const RESOLVER_NAME = /^[A-Za-z0-9_-]+$/;

function checkName(kind: string, name: string): void {
  if (!RESOLVER_NAME.test(name)) fail(`${kind} name ${JSON.stringify(name)} is not allowed: use letters, digits, "_" and "-" only`);
}

function readModifier(name: string, value: unknown): ModifierDef {
  checkName('modifier', name);
  if (!isObject(value) || !isObject(value.contexts)) fail(`modifier "${name}" must declare "contexts"`);
  const names = Object.keys(value.contexts);
  // §4.1.5.1: a modifier with no contexts MUST be an error
  if (names.length === 0) fail(`modifier "${name}" has no contexts`);
  names.forEach((c) => checkName(`context of modifier "${name}"`, c));
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
  const declaredModifiers = Object.entries(isObject(content.modifiers) ? content.modifiers : {}).map(([name, m]) => readModifier(name, m));
  // A pointer names an entry of "sets" or "modifiers", never an inline item, so what it finds does not depend on the item order.
  const modifiers = [...declaredModifiers];

  const seenInline = new Set<string>();
  const declared = new Set([...Object.keys(sets), ...modifiers.map((m) => m.name)]);
  const order = content.resolutionOrder.map((item): OrderItem => {
    if (!isObject(item)) fail('resolutionOrder items must be objects');
    if (typeof item.$ref === 'string') {
      const set = item.$ref.match(/^#\/sets\/(.+)$/)?.[1];
      if (set !== undefined) {
        if (!Object.hasOwn(sets, set)) fail(`resolutionOrder points at ${item.$ref}, which does not exist`);
        return { kind: 'set', name: set, sources: sets[set]! };
      }
      const modifier = item.$ref.match(/^#\/modifiers\/(.+)$/)?.[1];
      const found = declaredModifiers.find((m) => m.name === modifier);
      if (!found) fail(`resolutionOrder points at ${item.$ref}, which does not exist`);
      return { kind: 'modifier', modifier: found };
    }
    // §4.1.6.1: inline items need a name and a type, and names must be unique
    if (typeof item.name !== 'string' || (item.type !== 'set' && item.type !== 'modifier')) {
      fail('an inline resolutionOrder item needs "name" and "type" ("set" or "modifier")');
    }
    if (seenInline.has(item.name)) fail(`inline resolutionOrder name "${item.name}" is used twice`);
    if (declared.has(item.name)) fail(`inline resolutionOrder name "${item.name}" is already a declared set or modifier`);
    checkName(item.type, item.name);
    seenInline.add(item.name);
    if (item.type === 'set') return { kind: 'set', name: item.name, sources: readSources(item.sources, `inline set "${item.name}".sources`) };
    const inline = readModifier(item.name, item);
    modifiers.push(inline);
    return { kind: 'modifier', modifier: inline };
  });

  return { file, dir: path.dirname(file), sets, modifiers, order };
}
