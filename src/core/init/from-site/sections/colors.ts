import path from 'node:path';
import type { Ctx } from '../context.js';
import { cleanStarterColors } from '../clean-colors.js';
import { devBlazon, isToken, readJson, tokenAt, tokenPaths, writeJson, type Json } from '../tree.js';
import { setLabelInk } from '../../vocabulary.js';
import { pickColors, pickRole, type ColorPick } from '../colors.js';
import { rel } from '../context.js';

/** The site's colors into tokens/colors.json: the color group, interactive.primary and the roles it can fill, and the starter colors nothing uses any more. */
export function applyColors(ctx: Ctx, skipVars?: Set<string>) {
  const { destDir, vars, result, note, review, source, mayChange } = ctx;
  const picks = pickColors(vars).filter((p) => !skipVars?.has(p.cssVar));
  if (picks.length === 0)
    result.missing.push('no brand color: no custom property named brand, primary, secondary, accent, background, foreground or surface holds a hex or rgb() color');
  else if (mayChange(rel('tokens', 'colors.json'))) {
    const file = path.join(destDir, 'tokens', 'colors.json');
    const tree = readJson(file);
    const colorGroup = (tree['color'] ??= {}) as Json;
    const starterColors = new Set(tokenPaths(colorGroup, ['color']));
    const wrote = new Set<ColorPick>();
    const paths = new Set(picks.map((p) => p.segments.join('.')));
    for (const p of picks) {
      let segments = p.segments;
      if ([...paths].some((other) => other.startsWith(`${segments.join('.')}.`))) segments = [...segments, 'base'];
      let node = colorGroup;
      let flaggedGroup = false;
      let ok = true;
      for (const [i, seg] of segments.slice(0, -1).entries()) {
        const next = node[seg];
        if (next === undefined) {
          const group: Json = {};
          if (i === 0) {
            group['$extensions'] = devBlazon({ review });
            flaggedGroup = true;
          }
          node[seg] = group;
          node = group;
        } else if (isToken(next) || typeof next !== 'object' || next === null) {
          ok = false;
          break;
        } else node = next as Json;
      }
      const leaf = segments.at(-1)!;
      if (!ok || (typeof node[leaf] === 'object' && node[leaf] !== null && !isToken(node[leaf]))) {
        result.missing.push(`${p.cssVar} was not written: color.${segments.join('.')} clashes with a starter token`);
        continue;
      }
      // An rgb() value is written as hex, so the variable cannot be compared by `blazon drift`: it is left out.
      node[leaf] = {
        $value: p.hex,
        $extensions: devBlazon({ source: source(`:root { ${p.cssVar} }`, p.exact ? p.cssVar : undefined), ...(flaggedGroup ? {} : { review }) }),
      };
      p.segments = segments;
      wrote.add(p);
    }
    const siteColors = new Set([...wrote].map((p) => `color.${p.segments.join('.')}`));
    // The site's primary color is the brand's signal: interactive.primary points at it, and so does the ink's contrast pair
    const primary = pickRole(picks, 'primary');
    const interactive = tree['interactive'] as Json | undefined;
    const old = tokenAt(tree, 'interactive.primary');
    if (!primary) result.missing.push("no primary color: interactive.primary keeps the starter's value");
    else if (interactive && old) {
      const target = `color.${primary.segments.join('.')}`;
      interactive['primary'] = {
        $value: `{${target}}`,
        ...(typeof old['$description'] === 'string' && { $description: old['$description'] }),
        $extensions: devBlazon({ source: source(`:root { ${primary.cssVar} }`, primary.exact ? primary.cssVar : undefined), review }),
      };
      result.repointed.push(`interactive.primary to {${target}}`);
      const ink = setLabelInk(tree, primary.hex, `{${target}}`, true);
      for (const hint of ink.hints) result.missing.push(hint);
    } else result.missing.push('interactive.primary was not found in tokens/colors.json, so the primary color was not set');
    cleanStarterColors({ tree, destDir, picks: [...wrote], starterColors, siteColors, note, review, source, result });
    writeJson(file, tree);
    result.written.push(rel('tokens', 'colors.json'));
  }
}
