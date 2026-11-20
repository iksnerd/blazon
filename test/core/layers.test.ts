import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';

// The layers of src/ and which of them each may import. core was once cyclic with the plugin host, and the dev server with the CLI, until the
// shared pieces moved down into core; every layer has a row in scripts/layers.json, the one table (scripts/gen-layers-docs.ts draws it into
// ARCHITECTURE.md), so that no new dependency is a decision nobody made. `root` is the files directly in src/ (the package's public entry),
// which may import anything. A folder with no row fails the first test.
const MAY_IMPORT = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'scripts/layers.json'), 'utf-8')) as Record<string, string[]>;

const SRC = path.join(ROOT_DIR, 'src');
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });

/** The relative module specifiers in source text: static imports and exports, side-effect imports, dynamic `import()` and `require()`, in either quote. */
export function relativeSpecifiers(text: string): string[] {
  const code = text.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])(\.[^'"\n]*)\1/g)].map((m) => m[2]!);
}

/** The layer a path in src/ belongs to: its first folder, or `root` for a file directly in src/. */
const layerOf = (file: string): string => {
  const [first, ...rest] = path.relative(SRC, file).split(path.sep);
  return rest.length === 0 ? 'root' : first!;
};

/** The layers a file imports, each with the specifier that reaches it. */
function layersImported(file: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const specifier of relativeSpecifiers(fs.readFileSync(file, 'utf-8'))) {
    const target = path.resolve(path.dirname(file), specifier);
    if (target === SRC || target.startsWith(SRC + path.sep)) found.set(layerOf(target), specifier);
  }
  return found;
}

describe('the layers of src/', () => {
  const imports = sources(SRC).map((file) => ({ file: path.relative(SRC, file), layer: layerOf(file), layers: layersImported(file) }));

  it('has a row for every folder of src/', () => {
    const folders = fs
      .readdirSync(SRC, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(folders).toEqual(Object.keys(MAY_IMPORT).sort());
  });

  it.each(Object.entries(MAY_IMPORT))('%s imports only %j and itself', (layer, allowed) => {
    const bad = imports
      .filter((i) => i.layer === layer)
      .flatMap((i) => [...i.layers].filter(([to]) => to !== layer && !allowed.includes(to)).map(([to, via]) => `${i.file} -> ${to} (${via})`));
    expect(bad).toEqual([]);
  });

  it('has no folder whose files import nothing from the layers they sit in, which would mean the scan found no imports', () => {
    // A scan that silently finds nothing would pass every row above: the layers that do import across folders must show it
    const crossings = imports.filter((i) => [...i.layers.keys()].some((to) => to !== i.layer)).length;
    expect(crossings).toBeGreaterThan(100);
  });
});

describe('the scan for imports', () => {
  it('finds every form of a relative import, in either quote, and nothing else', () => {
    const text = [
      "import a from './single.js';",
      'import b from "../double.js";',
      "import type { C } from './types.js';",
      "export { d } from './reexport.js';",
      "export * from './star.js';",
      "import './side-effect.js';",
      'import "../side-effect-double.js";',
      "const e = await import('./dynamic.js');",
      'const f = await import("./dynamic-double.js");',
      "const g = require('./required.js');",
      "import pkg from 'a-package';",
      "import alias from '@/lib/alias.js';",
      "// import hidden from './commented.js';",
      "/* import hidden from './block.js'; */",
    ].join('\n');
    expect(relativeSpecifiers(text)).toEqual([
      './single.js',
      '../double.js',
      './types.js',
      './reexport.js',
      './star.js',
      './side-effect.js',
      '../side-effect-double.js',
      './dynamic.js',
      './dynamic-double.js',
      './required.js',
    ]);
  });
});

describe('the core knows no framework by name', () => {
  // A CSS framework or a UI library is a build plugin's business (src/shipped/): the core writes no file for one, checks no name of one and
  // imports nothing of one. Two places name a plugin: the refusal of a config key that plugin took over (core/config/removed-keys.ts) and the
  // list of plugins a new book enables (core/starter.ts), which is a list of names and holds no logic about either.
  const FRAMEWORKS = /tailwind|shadcn/i;
  const ALLOWED = new Set(['core/config/removed-keys.ts', 'core/starter.ts']);
  const code = (file: string) =>
    fs
      .readFileSync(file, 'utf-8')
      .replace(/\/\*[^]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('names none in the code of src/core, src/types, src/plugins, src/builder, src/server or src/cli', () => {
    const found = ['core', 'types', 'plugins', 'builder', 'server', 'cli']
      .flatMap((folder) => sources(path.join(SRC, folder)))
      .filter((file) => !ALLOWED.has(path.relative(SRC, file)) && FRAMEWORKS.test(code(file)))
      .map((file) => path.relative(SRC, file));
    expect(found).toEqual([]);
  });

  it('keeps the allowed files to the one refusal and the one list of names, so the allowance is not a way in', () => {
    expect(fs.readFileSync(path.join(SRC, 'core/config/removed-keys.ts'), 'utf-8').match(/shadcn|tailwind/gi)).toHaveLength(4);
    // Comments are not counted, as in the check above: the two entries of STARTER_PLUGINS are the only code that names a plugin.
    expect(code(path.join(SRC, 'core/starter.ts')).match(/shadcn|tailwind/gi)).toHaveLength(2);
  });
});
