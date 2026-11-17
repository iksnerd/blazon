// Builds the MCP server into the one file mcp/dist/index.js: mcp/src/index.ts with the MCP SDK and zod bundled in, an ES module with
// a shebang that resolves nothing from node_modules when it runs. Both packages stay in mcp/package.json "dependencies" for the
// build and the tests, and in no dependency list of the published package, the way scripts/build-plugins.mjs bundles pptxgenjs.
// The output is a pure function of the sources: no build stamp, no hashed names, no source map (a map would hold absolute paths).
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));

/** The versions the bundle freezes: blazon's own, and the two packages it carries. `blazon-mcp --version` prints them. */
export function bundledVersions() {
  return {
    blazon: read('package.json').version,
    sdk: read('node_modules/@modelcontextprotocol/sdk/package.json').version,
    zod: read('node_modules/zod/package.json').version,
  };
}

/** Builds into `outDir` (default mcp/dist) and returns the path of the file. */
export async function buildMcp(outDir = path.join(root, 'mcp/dist')) {
  const versions = bundledVersions();
  fs.mkdirSync(outDir, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'warn',
    define: { __BLAZON_MCP_VERSIONS__: JSON.stringify(versions) },
    build: {
      target: 'node24',
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      lib: { entry: path.join(root, 'mcp/src/index.ts'), formats: ['es'] },
      rollupOptions: {
        external: [...builtinModules.flatMap((name) => [name, `node:${name}`]), /^node:/],
        // The default adds a `// <module path>` comment to each module, which would put this machine's folders in the file.
        experimental: { attachDebugInfo: 'none' },
        output: { entryFileNames: 'index.js', codeSplitting: false },
      },
    },
  });
  const file = path.join(outDir, 'index.js');
  fs.chmodSync(file, 0o755);
  return file;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const file = await buildMcp();
  console.log(`build-mcp: ${path.relative(root, file)} (${fs.statSync(file).size} bytes)`);
}
