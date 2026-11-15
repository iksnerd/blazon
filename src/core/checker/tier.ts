import type { Finding, TokenItem } from '../../types/index.js';
import { aliasTarget } from '../tokens/alias.js';
import { finding } from './catalogue.js';

/** True when the value, or any part of a composite value, is an alias. */
function referencesToken(value: unknown): boolean {
  if (aliasTarget(value) !== undefined) return true;
  if (Array.isArray(value)) return value.some(referencesToken);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(referencesToken);
  return false;
}

export function tierFindings(item: TokenItem): Finding[] {
  const tier = item.blazon.tier;
  if ((tier === 'semantic' || tier === 'component') && !referencesToken(item.rawValue)) {
    return [finding('semantic-literal', { path: item.path, message: `A ${tier} token should alias a primitive, not hold ${item.value}` })];
  }
  return [];
}
