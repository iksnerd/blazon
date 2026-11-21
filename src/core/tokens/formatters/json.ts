import type { ParsedTokens } from '../../../types/index.js';
import { dictionary } from '../walk.js';

/**
 * Formats resolved tokens as a DTCG document: aliases replaced, `$extensions` kept for other tools. A group's `$extensions` other than
 * `dev.blazon` come back at the group's path, first among its keys, for each group that holds a token in `parsed.items`.
 */
export function formatJsonTokens(parsed: ParsedTokens): string {
  const root = dictionary();
  const groupExtensions = new Map(parsed.groupMeta.flatMap((group) => (group.extensions ? [[group.path, group.extensions] as const] : [])));

  for (const item of parsed.items) {
    const parts = item.path.split('.');
    let node = root;
    for (const [depth, part] of parts.slice(0, -1).entries()) {
      if (typeof node[part] !== 'object' || node[part] === null) {
        const group = dictionary();
        const extensions = groupExtensions.get(parts.slice(0, depth + 1).join('.'));
        if (extensions) group.$extensions = extensions;
        node[part] = group;
      }
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
