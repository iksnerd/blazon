import { preview } from 'vite';
import path from 'node:path';
import pc from '../../core/colors.js';
import fs from 'node:fs';
import { loadConfig } from '../../core/config/index.js';
import { busyPort, UsageError } from '../errors.js';
import { requireFolder } from '../project.js';
import { blazonCommand, shownDir } from '../where.js';

export async function runPreview(cwd: string = process.cwd(), portOverride?: number, options: { strictPort?: boolean } = {}) {
  requireFolder(cwd);
  const config = await loadConfig(cwd, portOverride ? { port: portOverride } : undefined);
  const outDir = path.resolve(cwd, config.outDir);
  // A server with nothing to serve answers 404 and exits 0: say what is missing instead
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    throw new UsageError(`no built site at "${outDir}"`, `Run ${blazonCommand('build', shownDir(cwd))} first.`, 'no-built-site');
  }

  let previewServer;
  try {
    previewServer = await preview({
      build: {
        outDir,
      },
      preview: {
        port: config.port,
        strictPort: options.strictPort ?? false,
        host: true,
        open: false,
      },
    });
  } catch (err) {
    if (options.strictPort && err instanceof Error && /already in use/.test(err.message)) throw busyPort(config.port);
    throw err;
  }

  const info = previewServer.resolvedUrls;
  const localUrl = info?.local[0] || `http://localhost:${config.port}/`;

  console.log(`\n  ${pc.bold(pc.blue('blazon preview'))}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Local:')}   ${pc.cyan(localUrl)}`);
  console.log(`  ${pc.dim('➜')}  ${pc.bold('Dist:')}    ${pc.dim(outDir)}\n`);
}
