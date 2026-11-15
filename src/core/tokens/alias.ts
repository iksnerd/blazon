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

export class Resolver {
  private readonly declared: Map<string, DeclaredToken>;
  private readonly resolved = new Map<string, unknown>();
  private readonly resolving = new Set<string>();
  readonly problems: Finding[] = [];

  constructor(tokens: DeclaredToken[]) {
    this.declared = new Map(tokens.map((t) => [t.path, t]));
  }

  /** Resolves a token's `$value`, following aliases through nested composite values. */
  token(path: string): unknown {
    if (this.resolved.has(path)) return this.resolved.get(path);
    const token = this.declared.get(path)!;
    this.resolving.add(path);
    const value = this.value(token.rawValue, path);
    this.resolving.delete(path);
    this.resolved.set(path, value);
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
        this.report(owner, 'embedded-alias', `"${value}" mixes an alias with other text; DTCG aliases must be the whole value`);
      }
      return value;
    }
    if (!this.declared.has(target)) {
      this.report(owner, 'unresolved-alias', `Alias {${target}} does not match any token`);
      return value;
    }
    if (this.resolving.has(target)) {
      // Reported on the smallest member of the loop, so the finding does not depend on which token the walk reached first
      const stack = [...this.resolving];
      const loop = stack.slice(stack.indexOf(target));
      const first = loop.reduce((a, b) => (compareText(b, a) < 0 ? b : a));
      this.report(first, 'circular-alias', `Alias {${loop[(loop.indexOf(first) + 1) % loop.length]}} leads back to ${first}`);
      return value;
    }
    return this.token(target);
  }

  typeOf(token: DeclaredToken, seen = new Set<string>()): TokenType | undefined {
    if (token.type) return token.type;
    const target = aliasTarget(token.rawValue);
    const targetToken = target ? this.declared.get(target) : undefined;
    if (!targetToken || seen.has(targetToken.path)) return undefined;
    seen.add(token.path);
    return this.typeOf(targetToken, seen);
  }

  report(path: string, code: CheckCode, message: string): void {
    this.problems.push(finding(code, { path, message }));
  }
}
