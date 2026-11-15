import fs from 'node:fs';
import path from 'node:path';
import type { ColorPick } from './colors.js';
import type { FromSiteResult } from './types.js';
import { aliasesIn, devBlazon, filesUnder, readJson, removeToken, tokenAt, type Json } from './tree.js';

export interface CleanInput {
  tree: Json;
  destDir: string;
  picks: ColorPick[];
  starterColors: Set<string>;
  siteColors: Set<string>;
  note: string;
  review: Json;
  source: (locator: string, cssVar?: string) => Json;
  result: FromSiteResult;
}

/**
 * Tidies the starter's colors once the site's are in: the text and surface tokens that still point at a starter color get the
 * site's equivalent when it has one, then every starter color that nothing uses is deleted. A color counts as used when
 * a token anywhere aliases it (transitively), or the config or a page names it.
 */
export function cleanStarterColors(input: CleanInput): void {
  const { tree, destDir, picks, starterColors, siteColors, note, review, source, result } = input;
  const pointsAtStarter = (root: string, key: string): string | undefined => {
    const value = tokenAt(tree, `${root}.${key}`)?.['$value'];
    const target = typeof value === 'string' ? value.match(/^\{(.+)\}$/)?.[1] : undefined;
    return target && starterColors.has(target) && !siteColors.has(target) ? target : undefined;
  };
  const repoint = (dotted: string, to: string, reason: string, extra: Json = {}): void => {
    const [group, key] = dotted.split('.') as [string, string];
    const token = tokenAt(tree, dotted)!;
    const from = String(token['$value']);
    (tree[group] as Json)[key] = {
      $value: `{${to}}`,
      ...(typeof token['$description'] === 'string' && { $description: token['$description'] }),
      $extensions: devBlazon({ ...extra, review: reason ? { ...review, note: `${note} ${reason}` } : review }),
    };
    result.repointed.push(`${dotted} from ${from} to {${to}}${reason ? ` (${reason.replace(/\.$/, '').replace(/^The /, 'the ')})` : ''}`);
  };
  const colorPath = (p: ColorPick) => `color.${p.segments.join('.')}`;
  // Only a color named for the role itself: `destructive-foreground` is the text on red, not the page's text
  const named = (names: string[][]): ColorPick | undefined =>
    names.map((want) => picks.find((p) => (p.segments.at(-1) === 'base' ? p.segments.slice(0, -1) : p.segments).join('.') === want.join('.'))).find(Boolean);

  const roles: [string, string[][]][] = [
    ['text.primary', [['foreground'], ['text', 'primary'], ['text']]],
    ['surface.background', [['background'], ['surface', 'background'], ['surface', 'page'], ['page']]],
    ['surface.canvas', [['card'], ['surface', 'card'], ['surface', 'canvas'], ['surface']]],
  ];
  for (const [dotted, names] of roles) {
    const [group, key] = dotted.split('.') as [string, string];
    const pick = named(names);
    if (pick && pointsAtStarter(group, key)) repoint(dotted, colorPath(pick), '', { source: source(`:root { ${pick.cssVar} }`, pick.exact ? pick.cssVar : undefined) });
  }
  // What still uses a starter color: aliases in the other tokens, then the config and pages that name one
  const colorGroup = tree['color'] as Json;
  const { color: _color, ...rest } = tree;
  const used = new Set<string>(aliasesIn(rest));
  for (const file of filesUnder(path.join(destDir, 'tokens'), ['.json'])) {
    if (path.basename(file) !== 'colors.json') for (const a of aliasesIn(readJson(file))) used.add(a);
  }
  const text = [path.join(destDir, 'blazon.json'), ...filesUnder(path.join(destDir, 'docs'), ['.md', '.mdx'])]
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf-8'))
    .join('\n');
  for (const m of text.matchAll(/(?<![\w.-])color(?:\.[A-Za-z0-9_-]+)+/g)) used.add(m[0]);
  const queue = [...used];
  while (queue.length > 0) {
    const node = tokenAt(tree, queue.pop()!);
    for (const a of node ? aliasesIn(node['$value']) : []) {
      if (used.has(a)) continue;
      used.add(a);
      queue.push(a);
    }
  }
  for (const dotted of [...starterColors].filter((c) => !siteColors.has(c) && !used.has(c))) {
    if (!tokenAt({ color: colorGroup }, dotted)) continue;
    removeToken({ color: colorGroup }, dotted);
    result.removed.push(`${dotted} (a starter color nothing uses)`);
  }
}
