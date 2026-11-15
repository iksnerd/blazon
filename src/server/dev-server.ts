import { createServer, type ViteDevServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import pc from '../core/colors.js';
import type { BlazonConfig } from '../types/index.js';
import { packageRoot } from '../core/package-root.js';
import { BLAZON_VERSION } from '../core/version.js';
import { createBlazonVitePlugin } from './plugin.js';

export type ViewerSource =
  /** Running blazon from its own source: Vite compiles src/viewer with vite.viewer.config.ts and hot-reloads it */
  | { kind: 'source'; configFile: string }
  /** Installed blazon: the viewer was compiled at publish time into dist/ui */
  | { kind: 'prebuilt'; dir: string };

/**
 * Finds the brand book viewer. Brand books never compile it; only blazon's own source checkout does.
 */
export function resolveViewer(): ViewerSource {
  const root = packageRoot();
  // The published package ships dist only, so src/viewer means a source checkout
  const configFile = path.join(root, 'vite.viewer.config.ts');
  if (fs.existsSync(path.join(root, 'src/viewer/index.html')) && fs.existsSync(configFile)) {
    return { kind: 'source', configFile };
  }
  return { kind: 'prebuilt', dir: resolvePrebuiltViewerDir() };
}

/** The prebuilt viewer directory, for static builds. A source checkout needs `npm run build` first. */
export function resolvePrebuiltViewerDir(): string {
  const dir = path.join(packageRoot(), 'dist/ui');
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    throw new Error('[blazon] No prebuilt viewer in dist/ui. Run `npm run build` first.');
  }
  return dir;
}

export async function startDevServer(config: BlazonConfig, cwd: string = process.cwd(), options: { strictPort?: boolean } = {}): Promise<ViteDevServer> {
  const viewer = resolveViewer();

  const server = await createServer({
    ...(viewer.kind === 'source' ? { configFile: viewer.configFile } : { configFile: false, root: viewer.dir }),
    server: {
      port: config.port,
      strictPort: options.strictPort ?? false,
      host: true,
      open: false,
    },
    plugins: [createBlazonVitePlugin(config, cwd)],
    optimizeDeps: {
      include: [],
    },
  });

  await server.listen();

  const info = server.resolvedUrls;
  const localUrl = info?.local[0] || `http://localhost:${config.port}/`;

  console.log(`\n  ${pc.bold(pc.blue('blazon'))} ${pc.green(`v${BLAZON_VERSION}`)}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Local:')}   ${pc.cyan(localUrl)}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Tokens:')}  ${pc.dim(config.tokensDir)}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Docs:')}    ${pc.dim(config.docsDir)}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Assets:')}  ${pc.dim(config.assetsDir)}\n`);

  return server;
}
