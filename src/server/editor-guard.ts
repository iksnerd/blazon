import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/** The route Vite registers for its "open in editor" overlay link. */
export const OPEN_IN_EDITOR_ROUTE = '/__open-in-editor';

/**
 * Answers 404 on Vite's `/__open-in-editor?file=...`. Vite registers that route on every dev server with no option to turn it off, and
 * a request to it, which any web page can make to localhost, makes a running editor open the named local path. Blazon has no use for it.
 * The hook runs before Vite adds its own middleware, so this one answers first.
 */
export function refuseEditorLauncher(_req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Not found');
}

/** The Vite plugin that puts the refusal in front of the dev server's launch-editor middleware, and in front of the preview server's routes. */
export const editorLauncherGuard = (): Plugin => ({
  name: 'blazon-editor-launcher-guard',
  configureServer(server) {
    server.middlewares.use(OPEN_IN_EDITOR_ROUTE, refuseEditorLauncher);
  },
  configurePreviewServer(server) {
    server.middlewares.use(OPEN_IN_EDITOR_ROUTE, refuseEditorLauncher);
  },
});
