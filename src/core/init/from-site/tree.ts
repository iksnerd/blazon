import fs from 'node:fs';
import path from 'node:path';

// The token files and folders `blazon init --from` rewrites: a token tree as JSON, and the paths and aliases in it.

export type Json = Record<string, unknown>;

export const isToken = (node: unknown): boolean => typeof node === 'object' && node !== null && '$value' in node;

export function readJson(file: string): Json {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Json;
}

export function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export const devBlazon = (extra: Json): Json => ({ 'dev.blazon': extra });

/** The dotted path of every token under a group. */
export function tokenPaths(node: Json, prefix: string[] = []): string[] {
  const out: string[] = [];
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || typeof child !== 'object' || child === null) continue;
    if (isToken(child)) out.push([...prefix, key].join('.'));
    else out.push(...tokenPaths(child as Json, [...prefix, key]));
  }
  return out;
}

export const tokenAt = (root: Json, dotted: string): Json | undefined => {
  let node: unknown = root;
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Json)[part];
  }
  return isToken(node) ? (node as Json) : undefined;
};

export const aliasesIn = (value: unknown): string[] => [...JSON.stringify(value).matchAll(/\{([A-Za-z0-9_.-]+)\}/g)].map((m) => m[1]!);

/** Every file under a folder whose name ends with one of `extensions`. */
export function filesUnder(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, extensions);
    return extensions.some((e) => entry.name.endsWith(e)) ? [full] : [];
  });
}

/** Removes the token at a dotted path, and every group it leaves empty (but not the first one, `color`). */
export function removeToken(root: Json, dotted: string): void {
  const parts = dotted.split('.');
  const chain: Json[] = [root];
  for (const part of parts.slice(0, -1)) chain.push(chain.at(-1)![part] as Json);
  delete chain.at(-1)![parts.at(-1)!];
  for (let k = chain.length - 1; k >= 2; k--) {
    if (Object.keys(chain[k]!).some((key) => !key.startsWith('$'))) break;
    delete chain[k - 1]![parts[k - 1]!];
  }
}
