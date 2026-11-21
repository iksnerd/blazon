// Builds the program of each plugin blazon ships into its folder: src/shipped/<short>/main.ts becomes the one CommonJS file
// plugins/<name>/bin/blazon-<name>.🔌 (RFC 0005 section 3.4), with everything it imports bundled in. What stays outside is
// Node's own modules and the packages named in plugin-externals.ts, which are resolved from blazon's node_modules when the plugin runs.
// The tree digest of the folder then covers the code, which is why shipped.lock is made after this (`npm run build:plugins`).
// The output is a pure function of the sources: no build stamp, no hashed names, no timestamps.
// A run is all or nothing: every plugin is built into a staging folder, every failure is reported, and the programs move into plugins/ only
// when all of them built, so a failed run leaves the previous programs (and shipped.lock, which `npm run build:plugins` makes after) as they were.
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

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const staging = fs.mkdtempSync(path.join(root, 'dist', '.plugins-staging-'));
const built = [];
const failures = [];

try {
  for (const name of names) {
    try {
      if (!isPluginName(name)) throw new Error(`${name} is not a plugin name`);
      const source = path.join(root, 'src/shipped', name.replace(/^blazon\./, ''), 'main.ts');
      if (!fs.existsSync(source)) throw new Error(`${name} has no source at ${path.relative(root, source)}`);
      const entry = pluginEntry(name);
      const outDir = path.join(staging, name);
      await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          target: 'node24',
          outDir,
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
      const program = path.join(outDir, path.basename(entry));
      if (!fs.existsSync(program)) throw new Error(`${name}: the build made no ${path.basename(entry)}`);
      fs.chmodSync(program, 0o755);
      built.push({ name, entry, program });
    } catch (error) {
      failures.push(`build-plugins: ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error(`${failures.join('\n')}\nbuild-plugins: ${failures.length} of ${names.length} plugins failed; nothing in plugins/ was changed`);
    process.exitCode = 1;
  } else {
    // Each program is renamed from a file beside its destination, so a program is whole or old, never half written.
    for (const { name, entry, program } of built) {
      const bin = path.join(plugins, name, 'bin');
      const destination = path.join(plugins, name, entry);
      fs.mkdirSync(bin, { recursive: true });
      const next = `${destination}.next`;
      fs.copyFileSync(program, next);
      fs.chmodSync(next, 0o755);
      fs.renameSync(next, destination);
      console.log(`build-plugins: ${entry}`);
    }
  }
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
