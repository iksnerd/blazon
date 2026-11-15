import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../../types/index.js';
import { readTokenFile } from '../load.js';
import type { TokenDocument } from '../merge.js';
import { fail, type ModifierDef, type Resolver, type Source } from './parse.js';

/** Context choice per modifier; every modifier in the resolver has an entry. */
export type Selection = Record<string, string>;

export class SourceReader {
  private readonly cache = new Map<string, TokenDocument>();
  readonly problems: Finding[] = [];

  constructor(
    private readonly resolver: Resolver,
    private readonly root: string,
  ) {}

  documents(selection: Selection): TokenDocument[] {
    return this.resolver.order.flatMap((item) => (item.kind === 'set' ? this.expand(item.sources, [item.name]) : this.expand(this.context(item.modifier, selection), [])));
  }

  private context(modifier: ModifierDef, selection: Selection): Source[] {
    const name = selection[modifier.name];
    const sources = name === undefined || !Object.hasOwn(modifier.contexts, name) ? undefined : modifier.contexts[name];
    return sources ?? fail(`modifier "${modifier.name}" has no context ${JSON.stringify(name)}`);
  }

  private expand(sources: Source[], stack: string[]): TokenDocument[] {
    return sources.flatMap((source): TokenDocument[] => {
      if (typeof source.$ref !== 'string') return [{ name: `${path.relative(this.root, this.resolver.file).split(path.sep).join('/')} (inline)`, content: source }];
      const ref = source.$ref;
      if (ref.startsWith('#/sets/')) {
        const name = ref.slice('#/sets/'.length);
        if (stack.includes(name)) fail(`sets reference each other in a circular chain: ${[...stack, name].join(' -> ')}`);
        if (!Object.hasOwn(this.resolver.sets, name)) fail(`a source points at ${ref}, which does not exist`);
        return this.expand(this.resolver.sets[name]!, [...stack, name]);
      }
      if (ref.startsWith('#/modifiers/')) fail(`a source points at ${ref}; sources cannot reference modifiers`);
      if (ref.startsWith('#') || ref.includes('#')) fail(`a source points at ${ref}; blazon reads whole token files and #/sets/ references only`);
      return [this.file(ref)];
    });
  }

  private file(ref: string): TokenDocument {
    const cached = this.cache.get(ref);
    if (cached) return cached;
    const full = path.resolve(this.resolver.dir, ref);
    const realRoot = fs.realpathSync(this.root);
    let real: string;
    try {
      real = fs.realpathSync(full);
    } catch {
      return fail(`a source points at ${ref}, which does not exist`);
    }
    // RFC 0001 security: references resolve inside the project root only
    if (!real.startsWith(realRoot + path.sep)) fail(`a source points at ${ref}, which is outside the project`);
    const name = path.relative(realRoot, real).split(path.sep).join('/');
    // A file that does not parse is an invalid-json finding with its line, as without a resolver, and holds no tokens: the other files still load
    const doc = readTokenFile(real, name, this.problems) ?? { name, content: {} };
    this.cache.set(ref, doc);
    return doc;
  }
}
