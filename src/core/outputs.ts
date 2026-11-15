import path from 'node:path';
import type { BlazonConfig } from '../types/index.js';
import { projectInputs, type Input } from './inputs.js';
import { canonical, isWithin } from './confine.js';

// Where blazon writes (outDir for the site, tokensOutDir for the code) against where it reads. `blazon build` empties outDir, so an outDir
// that is or holds an input would delete the brand. An output inside an input folder is read back by the next build as if it were part of
// the brand. Both are refused before anything is written, by `blazon check` as a finding and by buildSite and emitTokenOutputs as an error,
// so the command and the public functions give the same guarantee.

export { canonical, isWithin };

const quoted = (name: string, as: string) => `${name} ("${as}")`;

/** The inputs with their links followed, which is how a path is compared. */
const real = (config: BlazonConfig, cwd: string): Input[] =>
  projectInputs(config, cwd).flatMap((input) => {
    // What it points to, and where it is: a source that is a link inside an output folder is deleted with the folder, though its target is elsewhere
    const target = canonical(input.path);
    const link = path.join(canonical(path.dirname(input.path)), path.basename(input.path));
    return link === target
      ? [{ ...input, path: target }]
      : [
          { ...input, path: target },
          { ...input, path: link },
        ];
  });

/**
 * Whether blazon would be writing over, or deleting, a file or folder the compile reads: `target` is an input, or is inside an input folder,
 * or holds one. The writers ask before each write and each deletion, so a name that looks like blazon's own output is left alone when it is
 * really somebody's source.
 */
export function isInput(config: BlazonConfig, cwd: string, target: string): Input | undefined {
  const there = canonical(target);
  return real(config, cwd).find((input) => !input.holdsOnly && (input.folder ? isWithin(input.path, there) : input.path === there));
}

/**
 * The inputs inside `folder`, or the folder itself being one: what emptying the folder would delete. Asked by the output check for a plugin
 * named in the config, and by the plugin writer itself before it empties a folder, so a plugin named only on the command line is held to it too.
 */
export function inputsWithin(config: BlazonConfig, cwd: string, folder: string): Input[] {
  const there = canonical(folder);
  return real(config, cwd).filter((input) => !input.holdsOnly && isWithin(there, input.path));
}

/**
 * What is wrong with where the outputs go, as sentences: an outDir that is or holds an input (the build would empty it), and an outDir or
 * tokensOutDir that is inside an input folder (the next build would read it back). The overlap of the two outputs with each other is the
 * first rule. Empty when the outputs are safe, or when the config is too broken to say.
 */
export function outputDirProblems(config: BlazonConfig, cwd: string): string[] {
  if (typeof config.outDir !== 'string' || typeof config.tokensOutDir !== 'string') return [];
  const site = canonical(path.resolve(cwd, config.outDir));
  const tokens = canonical(path.resolve(cwd, config.tokensOutDir));
  const problems: string[] = [];

  if (isWithin(tokens, site)) {
    const same = isWithin(site, tokens);
    problems.push(
      `${same ? 'outDir and tokensOutDir are the same folder' : 'tokensOutDir holds outDir'} ("${config.outDir}", "${config.tokensOutDir}"): emptying one would remove the other's files. Put the site in its own folder, such as "dist/site"`,
    );
  }

  const all = real(config, cwd);
  const held = all.filter((i) => isWithin(site, i.path));
  if (held.length > 0)
    problems.push(
      `outDir ("${config.outDir}") ${held.length === 1 && held[0]!.path === site ? 'is' : 'holds'} ${held.map((i) => quoted(i.name, i.as)).join(', ')}: blazon build empties outDir and would delete ${held.length === 1 ? 'it' : 'them'}. Put the site in its own folder, such as "dist/site"`,
    );
  for (const [key, out, as] of [
    ['outDir', site, config.outDir],
    ['tokensOutDir', tokens, config.tokensOutDir],
  ] as const) {
    const around = all.filter((i) => i.folder && !i.holdsOnly && isWithin(i.path, out) && !(key === 'outDir' && held.includes(i)));
    if (around.length > 0)
      problems.push(
        `${key} ("${as}") is inside ${around.map((i) => quoted(i.name, i.as)).join(', ')}: the next build would read the output as part of the brand. Put it in its own folder, such as "dist/${key === 'outDir' ? 'site' : 'tokens'}"`,
      );
  }
  // A build plugin's folder under tokensOutDir is emptied before it runs, so it may not hold an input either
  for (const plugin of Array.isArray(config.plugins) ? config.plugins : []) {
    if (!plugin || typeof plugin.name !== 'string') continue;
    const id = plugin.as ?? plugin.name;
    const inside = inputsWithin(config, cwd, path.join(tokens, id));
    if (inside.length > 0)
      problems.push(
        `the folder of the plugin ${id} ("${path.join(config.tokensOutDir, id)}") holds ${inside.map((i) => quoted(i.name, i.as)).join(', ')}: blazon empties it before the plugin runs and would delete ${inside.length === 1 ? 'it' : 'them'}. Move the file, or move tokensOutDir`,
      );
  }
  return problems;
}
