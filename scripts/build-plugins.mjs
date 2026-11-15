// Builds the program of each plugin blazon ships into its folder: src/shipped/<short>/main.ts becomes the one CommonJS file
// plugins/<name>/bin/blazon-<name>.🔌 (RFC 0005 section 3.4), with everything it imports bundled in. What stays outside is
// Node's own modules and the packages named in plugin-externals.ts, which are resolved from blazon's node_modules when the plugin runs.
// The tree digest of the folder then covers the code, which is why shipped.lock is made after this (`npm run build:plugins`).
// The output is a pure function of the sources: no build stamp, no hashed names, no timestamps.
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { EXTERNAL } from './plugin-externals.ts';
import { isPluginName, pluginEntry } from '../src/core/plugin-name.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugins = path.join(root, 'plugins');

const external = [...builtinModules.flatMap((name) => [name, `node:${name}`]), /^node:/, ...EXTERNAL];

const names = fs
  .readdirSync(plugins, { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name)
  .sort();

for (const name of names) {
  if (!isPluginName(name)) throw new Error(`build-plugins: ${name} is not a plugin name`);
  const source = path.join(root, 'src/shipped', name.replace(/^blazon\./, ''), 'main.ts');
  if (!fs.existsSync(source)) throw new Error(`build-plugins: ${name} has no source at ${path.relative(root, source)}`);
  const entry = pluginEntry(name);
  const bin = path.join(plugins, name, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      target: 'node24',
      outDir: bin,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      lib: { entry: source, formats: ['cjs'] },
      rollupOptions: {
        external,
        // The default adds a `// <module path>` comment to each module, relative to the folder the build runs in. A node_modules
        // that sits elsewhere (a symlink, a parent folder) would change the bundle, and so the pin, for no change in the code.
        experimental: { attachDebugInfo: 'none' },
        output: { entryFileNames: path.basename(entry), banner: '#!/usr/bin/env node', codeSplitting: false, exports: 'none' },
      },
    },
  });
  fs.chmodSync(path.join(plugins, name, entry), 0o755);
  console.log(`build-plugins: ${entry}`);
}
