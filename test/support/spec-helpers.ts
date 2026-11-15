import fs from 'node:fs';
import path from 'node:path';
import { CHECKS } from '../../src/core/checker/catalogue.js';

// Readers of the source, shared by the tests that hold a document to what the code can do: the manual and the RFC.

export const ROOT = path.resolve(__dirname, '../..');
export const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf-8');

export function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, found);
    else found.push(rel);
  }
  return found;
}

/** The keys of one exported interface in src/types/. */
export function interfaceKeys(name: string): string[] {
  const source = walk('src/types').map(read).join('\n');
  const body = source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  return [...body.matchAll(/^ {2}([A-Za-z]+)\??:/gm)].map((m) => m[1]!);
}

/** The quoted members of one exported string-union type in src/types/. A comment inside the union may hold an apostrophe, so comments are dropped first. */
export function unionMembers(name: string): string[] {
  const source = walk('src/types').map(read).join('\n');
  const body = source.match(new RegExp(`export type ${name}\\s*=([^;]*);`))?.[1] ?? '';
  return [...body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

/** Every finding code the core emits: the keys of the catalogue (src/core/checker/catalogue.ts). */
export function findingCodes(): string[] {
  return Object.keys(CHECKS).sort();
}

/** The text of the manual page a catalogue record names (`manual`, a basename such as '03-checks'). */
export function manualPage(name: string): string {
  return read(`docs/manual/${name}.md`);
}

/**
 * The text of the RFC section a catalogue record names (`rfc`, such as '1#4': RFC 0001, section 4), from its `### N. ` heading to the
 * next heading of the same or a higher level, so the subsections belong to it.
 */
export function rfcSection(pointer: string): string {
  const [number, section] = pointer.split('#');
  const file = fs.readdirSync(path.join(ROOT, 'docs/rfc')).find((name) => name.startsWith(`${String(number).padStart(4, '0')}-`));
  if (!file) throw new Error(`no RFC ${number} for the pointer ${pointer}`);
  const text = read(`docs/rfc/${file}`);
  const start = text.search(new RegExp(`^### ${section}\\. `, 'm'));
  if (start === -1) throw new Error(`RFC ${number} has no section ${section}`);
  const rest = text.slice(start + 4);
  const end = rest.search(/^##{1,2} /m);
  return end === -1 ? rest : rest.slice(0, end);
}
