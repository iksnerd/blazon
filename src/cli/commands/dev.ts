import { loadProject } from '../project.js';
import { startDevServer } from '../../server/dev-server.js';
import { busyPort } from '../errors.js';

export async function runDev(cwd: string = process.cwd(), portOverride?: number, options: { strictPort?: boolean } = {}) {
  const config = await loadProject(cwd, portOverride ? { port: portOverride } : undefined);
  try {
    await startDevServer(config, cwd, options);
  } catch (err) {
    // Vite's own sentence, "Port 3977 is already in use", is the only sign that the port was the reason
    if (options.strictPort && err instanceof Error && /already in use/.test(err.message)) throw busyPort(config.port);
    throw err;
  }
}
