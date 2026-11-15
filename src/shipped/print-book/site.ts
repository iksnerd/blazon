import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
};

/** A built site served on 127.0.0.1 and a free port, for the length of one print. Only files inside `root` are served. */
export async function serve(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const base = fs.realpathSync(root);
  const server = http.createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      // A page can ask for a malformed address (a stray %); an uncaught throw here would end the plugin with a break
      res.writeHead(400).end();
      return;
    }
    const file = path.join(base, pathname === '/' ? 'index.html' : pathname);
    const real = fs.existsSync(file) ? fs.realpathSync(file) : '';
    if (!real.startsWith(base + path.sep) || !fs.statSync(real).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(real).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(() => done())) };
}
