// Writes the diagram of which folder of src/ may import which into ARCHITECTURE.md, from scripts/layers.json, the one table that
// test/core/layers.test.ts enforces. Only the block between the `layers:begin` and `layers:end` markers is written.
//   npm run layers-docs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BEGIN = '<!-- layers:begin -->';
export const END = '<!-- layers:end -->';
export const FILE = 'ARCHITECTURE.md';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The rules: each folder of src/ and the folders it may import, in the order of the file. */
export function readLayers(): Record<string, string[]> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/layers.json'), 'utf-8')) as Record<string, string[]>;
}

/** The fenced Mermaid block: one arrow for each import a folder may make. */
export function block(layers: Record<string, string[]>): string {
  const lines = ['flowchart TB', ...Object.keys(layers).map((layer) => `  ${layer}["src/${layer}"]`)];
  for (const [layer, allowed] of Object.entries(layers)) for (const to of allowed) lines.push(`  ${layer} --> ${to}`);
  return ['```mermaid', ...lines, '```', ''].join('\n');
}

/** The document with the text between its markers replaced by the block. */
export function withBlock(text: string, layers: Record<string, string[]>): string {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 || end === -1 || end < begin || text.indexOf(BEGIN, begin + 1) !== -1) {
    throw new Error(`${FILE} needs exactly one ${BEGIN} before one ${END}`);
  }
  return `${text.slice(0, begin + BEGIN.length)}\n${block(layers)}${text.slice(end)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = path.join(ROOT, FILE);
  const current = fs.readFileSync(target, 'utf-8');
  const next = withBlock(current, readLayers());
  if (next !== current) fs.writeFileSync(target, next);
  console.log(next !== current ? `layers-docs: wrote ${FILE}` : 'layers-docs: already current');
}
