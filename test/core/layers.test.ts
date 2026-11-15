import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../plugins/support/spec.js';

// The layers of src/ and which of them each may import. core was once cyclic with the plugin host, and the dev server with the CLI, until the
// shared pieces moved down into core; every layer has a row here so that no new dependency is a decision nobody made. `root` is the files
// directly in src/ (the package's public entry), which may import anything. A folder with no row fails the first test.
const MAY_IMPORT: Record<string, string[]> = {
  types: [],
  core: ['types'],
  plugins: ['core', 'types'],
  shipped: ['core', 'types'],
  viewer: ['core', 'types'],
  server: ['core', 'plugins', 'types'],
  builder: ['core', 'server', 'types'],
  cli: ['builder', 'core', 'plugins', 'server', 'types'],
};

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
