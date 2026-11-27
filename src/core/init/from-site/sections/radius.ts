import path from 'node:path';
import type { Ctx } from '../context.js';
import { rel } from '../context.js';
import { devBlazon, readJson, writeJson, type Json } from '../tree.js';

// The site's radii into tokens/form.json: only the custom properties NAMED for a radius (`--radius`, `--radius-md`, `--border-radius-lg`).
// The `border-radius` values its rules use are counted in extract.json and never written: a count is not a decision.

const RADIUS_NAME = /(?:^|-)(?:border-)?radius(?:-|$)/i;
const DIMENSION = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)$/i;

export interface RadiusPick {
  cssVar: string;
  name: string;
  value: { value: number; unit: 'px' | 'rem' };
}

/** The radius custom properties whose value is one length in px or rem (or 0), named by what follows `radius` (`--radius` is `base`). */
export function pickRadii(vars: Map<string, string>): { picks: RadiusPick[]; skipped: string[] } {
  const picks: RadiusPick[] = [];
  const skipped: string[] = [];
  for (const [cssVar, raw] of vars) {
    if (!RADIUS_NAME.test(cssVar.slice(2))) continue;
    const text = raw.trim();
    const m = text === '0' ? ['0', '0', 'px'] : text.match(DIMENSION);
    if (!m) {
      skipped.push(`${cssVar} (${text}) is not one length in px or rem, so no radius token was written for it`);
      continue;
    }
    const segments = cssVar
      .slice(2)
      .toLowerCase()
      .split(/[-_]+/)
      .filter((s) => s && !['border', 'radius', 'rounded'].includes(s));
    const name = segments.join('-') || 'base';
    if (picks.some((p) => p.name === name)) continue;
    picks.push({ cssVar, name, value: { value: Number(m[1]), unit: m[2]!.toLowerCase() as 'px' | 'rem' } });
  }
  return { picks, skipped };
}

export function applyRadius(ctx: Ctx): void {
  const { destDir, vars, result, review, source, mayChange } = ctx;
  const { picks, skipped } = pickRadii(vars);
  result.missing.push(...skipped);
  if (picks.length === 0 || !mayChange(rel('tokens', 'form.json'))) return;
  const file = path.join(destDir, 'tokens', 'form.json');
  const tree = readJson(file);
  const group = (tree['radius'] ??= { $type: 'dimension' }) as Json;
  let wrote = 0;
  for (const p of picks) {
    if (group[p.name] !== undefined) {
      result.missing.push(`${p.cssVar} was not written: radius.${p.name} is a starter token`);
      continue;
    }
    // The value as written is the token's value in DTCG form, so `blazon drift` can compare the variable
    group[p.name] = { $value: p.value, $extensions: devBlazon({ source: source(`:root { ${p.cssVar} }`, p.cssVar), review }) };
    wrote++;
  }
  if (wrote === 0) return;
  writeJson(file, tree);
  result.written.push(rel('tokens', 'form.json'));
}
