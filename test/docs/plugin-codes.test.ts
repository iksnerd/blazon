import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT, read, walk } from '../support/spec-helpers.js';

// Every finding a shipped plugin can raise is described in its section of chapter 14 of the manual. The codes are read from the plugin's source,
// however it writes them, so a code added without a row fails here. This does not judge the prose.

const lock = JSON.parse(read('plugins/shipped.lock')) as { plugins: Record<string, unknown> };
const manual = read('docs/manual/14-shipped-plugins.md');

/** The text of one plugin's section: from its `### name` heading to the next heading of the same level. */
function section(name: string): string {
  const start = manual.indexOf(`### ${name}\n`);
  if (start === -1) return '';
  const next = manual.indexOf('\n### ', start + 1);
  return manual.slice(start, next === -1 ? undefined : next);
}

/** The codes a plugin's source raises, bare: `finding('x'`, `${NAME}/x` and a quoted `name/x`. */
function codesOf(name: string): string[] {
  const dir = path.join('src/shipped', name.split('.')[1]!);
  const found = new Set<string>();
  for (const file of walk(dir).filter((f) => f.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    for (const m of source.matchAll(/\bfinding\(\s*'([a-z0-9]+(?:-[a-z0-9]+)*)'/g)) found.add(m[1]!);
    for (const m of source.matchAll(/\$\{NAME\}\/([a-z0-9]+(?:-[a-z0-9]+)*)/g)) found.add(m[1]!);
    for (const m of source.matchAll(new RegExp(`['"\`]${name.replace(/\./g, '\\.')}/([a-z0-9]+(?:-[a-z0-9]+)*)['"\`]`, 'g'))) found.add(m[1]!);
  }
  return [...found].sort();
}

describe.each(Object.keys(lock.plugins).sort())('%s', (name) => {
  it('has a section in chapter 14 of the manual', () => {
    expect(section(name), `docs/manual/14-shipped-plugins.md has no "### ${name}" section`).not.toBe('');
  });

  it('describes every finding code it raises in that section', () => {
    const codes = codesOf(name);
    const text = section(name);
    expect(codes.length, `${name}: no finding codes found in its source, so the pattern or the folder moved`).toBeGreaterThan(0);
    expect(codes.filter((code) => !text.includes(`${name}/${code}`) && !text.includes(`\`${code}\``))).toEqual([]);
  });
});
