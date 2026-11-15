import type { Finding, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

/** `source.cssVar` names a CSS custom property, so it starts with two hyphens. */
export function sourceFindings(item: TokenItem): Finding[] {
  const cssVar: unknown = item.blazon.source?.cssVar;
  if (cssVar === undefined || (typeof cssVar === 'string' && /^--[A-Za-z0-9_-]+$/.test(cssVar))) return [];
  return [finding('source-css-var-invalid', { path: item.path, message: `source.cssVar must be a custom property name such as "--brand-primary", got ${JSON.stringify(cssVar)}` })];
}
