import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import { loadTokenTree } from '../../../tokens/load.js';
import { resolveTokenTree } from '../../../tokens/resolve.js';

// The starter's pages place tokens with `<!-- blazon:tokens color.base ... -->`. `--from` replaces the starter's tokens with the site's, so a
// path the starter had and the site does not is gone, and a page that still names it would fail `blazon check`. A path that no longer
// resolves is taken out of the directive, and a directive left with none is taken out of the page.

const DIRECTIVE = /^[ \t]*<!--\s*blazon:tokens\b([^>]*?)-->[ \t]*\r?\n?/gm;

export function pruneTokenDirectives(ctx: Ctx): void {
  const { destDir, created, result } = ctx;
  const docs = path.join(destDir, 'docs');
  if (!fs.existsSync(docs)) return;
  const items = resolveTokenTree(loadTokenTree(path.join(destDir, 'tokens'), destDir), '--').items;
  const resolves = (token: string) => items.some((item) => item.path === token || item.path.startsWith(`${token}.`));

  for (const name of fs.readdirSync(docs).filter((file) => file.endsWith('.md'))) {
    const relative = `docs/${name}`;
    if (!created.has(relative)) continue;
    const file = path.join(docs, name);
    const before = fs.readFileSync(file, 'utf-8');
    const dropped: string[] = [];
    const after = before
      .replace(DIRECTIVE, (whole, args: string) => {
        const wanted = args.split(/\s+/).filter(Boolean);
        const kept = wanted.filter(resolves);
        dropped.push(...wanted.filter((token) => !resolves(token)));
        if (kept.length === wanted.length) return whole;
        return kept.length === 0 ? '' : `<!-- blazon:tokens ${kept.join(' ')} -->\n`;
      })
      // A directive taken out leaves its blank lines behind
      .replace(/\n{3,}/g, '\n\n');
    if (after === before) continue;
    fs.writeFileSync(file, after);
    result.removed.push(`${dropped.join(', ')} in ${relative} (the site has no such token to show)`);
  }
}
