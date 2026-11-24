import type { Finding, TokenType } from '../../types/index.js';
import type { DeclaredToken } from './walk.js';
import { finding, type CheckCode } from '../checker/catalogue.js';
import { compareText } from '../order.js';

const ALIAS = /^\{([^{}]+)\}$/;
const EMBEDDED_ALIAS = /\{[^{}]+\}/;

/** Returns the target path when `value` is exactly one alias, e.g. "{color.brand.indigo}". */
export function aliasTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim().match(ALIAS)?.[1]?.trim();
}

/** A token path is unvisited (no entry), resolving (on the stack) or resolved (has a value). */
type State = { readonly kind: 'resolving' } | { readonly kind: 'resolved'; readonly value: unknown };

export class Resolver {
  private readonly declared: Map<string, DeclaredToken>;
  private readonly states = new Map<string, State>();
  /** The paths in the `resolving` state, in the order the walk entered them. */
  private readonly stack: string[] = [];
  readonly problems: Finding[] = [];
  /** Tokens whose value cannot be known because an alias in it, or down its chain, names no token. The one finding for that cause is `alias-unresolved` on the root. */
  readonly unresolved = new Set<string>();

  constructor(tokens: DeclaredToken[]) {
    this.declared = new Map(tokens.map((t) => [t.path, t]));
  }

  /** Resolves a token's `$value`, following aliases through nested composite values. */
  token(path: string): unknown {
    const state = this.states.get(path);
    if (state?.kind === 'resolved') return state.value;
    const token = this.declared.get(path)!;
    this.states.set(path, { kind: 'resolving' });
    this.stack.push(path);
    const value = this.value(token.rawValue, path);
    this.stack.pop();
    this.states.set(path, { kind: 'resolved', value });
    return value;
  }

  private value(value: unknown, owner: string): unknown {
    if (Array.isArray(value)) return value.map((v) => this.value(v, owner));
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.value(v, owner)]));
    }
    const target = aliasTarget(value);
    if (target === undefined) {
      if (typeof value === 'string' && EMBEDDED_ALIAS.test(value)) {
        this.report(owner, 'alias-embedded', `"${value}" mixes an alias with other text; DTCG aliases must be the whole value`);
      }
      return value;
    }
    if (!this.declared.has(target)) {
      this.report(owner, 'alias-unresolved', `Alias {${target}} does not match any token`);
      this.unresolved.add(owner);
      return value;
    }
    if (this.states.get(target)?.kind === 'resolving') {
      // Reported on the smallest member of the loop, so the finding does not depend on which token the walk reached first
      const loop = this.stack.slice(this.stack.indexOf(target));
      const first = loop.reduce((a, b) => (compareText(b, a) < 0 ? b : a));
      this.report(first, 'alias-circular', `Alias {${loop[(loop.indexOf(first) + 1) % loop.length]}} leads back to ${first}`);
      return value;
    }
    const resolved = this.token(target);
    if (this.unresolved.has(target)) this.unresolved.add(owner);
    return resolved;
  }

  /** The declared type of a token, or of the first token down its alias chain that has one. A loop or a broken link gives undefined. */
  typeOf(token: DeclaredToken): TokenType | undefined {
    const visited = new Set<string>();
    let current: DeclaredToken | undefined = token;
    while (current && !visited.has(current.path)) {
      if (current.type) return current.type;
      visited.add(current.path);
      const target = aliasTarget(current.rawValue);
      current = target === undefined ? undefined : this.declared.get(target);
    }
    return undefined;
  }

  report(path: string, code: CheckCode, message: string): void {
    this.problems.push(finding(code, { path, message }));
  }
}
