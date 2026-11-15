import fs from 'node:fs';
import path from 'node:path';
import type { BlazonConfig, BlazonData } from '../types/index.js';
import { formatCssTokens, formatTypographyCss } from './tokens/formatters/css.js';
import { formatTailwindReset, formatTailwindTheme } from './tokens/formatters/tailwind.js';
import { formatTsTokens } from './tokens/formatters/ts.js';
import { formatJsonTokens } from './tokens/formatters/json.js';
import { contextItems } from './tokens/contexts.js';
import { isInput } from './outputs.js';
import { assertCanWrite, type WriteOptions } from './preflight.js';

/**
 * Everything emitTokenOutputs refuses, decided and thrown before a file is written or deleted: the files it would write, by name.
 * buildSite asks it before it empties its own folder, so a refusal never leaves a half-replaced site.
 */
export function planTokenOutputs(data: BlazonData, config: BlazonConfig, cwd: string, options: WriteOptions = {}): { outDir: string; files: Map<string, string> } {
  // The same refusals as buildSite's and the commands': an unsafe output folder, a pin that is not met, and errors in the brand
  assertCanWrite(data, config, cwd, options);
  const outDir = path.resolve(cwd, config.tokensOutDir);

  // Every file this run writes, decided before any is written
  const files = new Map<string, string>();
  files.set('theme.css', formatCssTokens(data.tokens, { selector: config.cssSelector, prefix: config.cssPrefix }));
  files.set('tokens.ts', formatTsTokens(data.tokens));
  files.set('tokens.json', formatJsonTokens(data.tokens));
  // A complete DTCG document per context: the defaults with that context's changes applied
  for (const context of data.tokens.contexts ?? []) {
    files.set(`tokens.${context.modifier}.${context.context}.json`, formatJsonTokens({ ...data.tokens, items: contextItems(data.tokens.items, [context]) }));
  }
  const typographyCss = formatTypographyCss(data.tokens);
  if (typographyCss) files.set('typography.css', typographyCss);
  const tailwind = formatTailwindTheme(data.tokens);
  if (tailwind) files.set('tailwind.css', tailwind);
  const tailwindReset = formatTailwindReset(data.tokens);
  if (tailwindReset) files.set('tailwind-reset.css', tailwindReset);

  // A file of the project's own that has the name of one of these is not ours to overwrite: refuse before writing any of them
  for (const name of files.keys()) {
    const input = isInput(config, cwd, path.join(outDir, name));
    if (input)
      throw new Error(`[blazon] ${name} in tokensOutDir ("${config.tokensOutDir}") would be written over ${input.name} ("${input.as}"), which the brand reads. Move one of them`);
  }

  return { outDir, files };
}

/**
 * Writes token output artifacts (theme.css, typography.css, tailwind.css, tailwind-reset.css, tokens.ts, tokens.json)
 */
export async function emitTokenOutputs(
  data: BlazonData,
  config: BlazonConfig,
  cwd: string = process.cwd(),
  options: WriteOptions = {},
): Promise<{ cssPath: string; tsPath: string; jsonPath: string; typographyPath?: string; tailwindPath?: string; tailwindResetPath?: string }> {
  const { outDir, files } = planTokenOutputs(data, config, cwd, options);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, text] of files) fs.writeFileSync(path.join(outDir, name), text, 'utf-8');

  // What an earlier run wrote and this one has no reason to: a file for typography or a Tailwind theme the tokens no longer have, and the
  // document of a context that is gone. Only the names blazon writes here are touched, and not one of them that the brand reads as an input
  // (a plugin's own folder, or a file of the project's, stays).
  for (const entry of fs.readdirSync(outDir)) {
    const ours = entry === 'typography.css' || entry === 'tailwind.css' || entry === 'tailwind-reset.css' || /^tokens\.[^./\\]+\.[^./\\]+\.json$/.test(entry);
    if (ours && !files.has(entry) && !isInput(config, cwd, path.join(outDir, entry))) fs.rmSync(path.join(outDir, entry), { force: true });
  }
  const at = (name: string) => (files.has(name) ? path.join(outDir, name) : undefined);
  return {
    cssPath: path.join(outDir, 'theme.css'),
    tsPath: path.join(outDir, 'tokens.ts'),
    jsonPath: path.join(outDir, 'tokens.json'),
    typographyPath: at('typography.css'),
    tailwindPath: at('tailwind.css'),
    tailwindResetPath: at('tailwind-reset.css'),
  };
}
