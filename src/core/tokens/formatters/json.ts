import type { ParsedTokens } from '../../../types/index.js';
import { dictionary } from '../walk.js';

/** Formats resolved tokens as a DTCG document: aliases replaced, `$extensions` kept for other tools. */
export function formatJsonTokens(parsed: ParsedTokens): string {
  const root = dictionary();

  for (const item of parsed.items) {
    const parts = item.path.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = dictionary();
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = {
      ...(item.type && { $type: item.type }),
      $value: item.resolvedValue,
      ...(item.description && { $description: item.description }),
      ...(item.deprecated !== undefined && { $deprecated: item.deprecated }),
      ...(item.extensions && { $extensions: item.extensions }),
    };
  }

  return `${JSON.stringify(root, null, 2)}\n`;
}
