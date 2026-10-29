// Kleiner statischer Server für Entwicklung und Tests (npm start → http://localhost:8080).
// Schickt absichtlich dieselbe Cache-Vorgabe wie GitHub Pages (max-age=600), damit Tests
// zeigen, dass neue Versionen trotz HTTP-Cache ankommen.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

export function starteServer({ wurzel = fileURLToPath(new URL('..', import.meta.url)), port = 0, cache = 'public, max-age=600' } = {}) {
  const server = createServer(async (req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const datei = normalize(join(wurzel, pfad.endsWith('/') ? `${pfad}index.html` : pfad));
    if (!datei.startsWith(normalize(wurzel))) {
      res.writeHead(403).end();
      return;
    }
    try {
      const inhalt = await readFile(datei);
      res.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] ?? 'application/octet-stream', 'Cache-Control': cache });
      res.end(inhalt);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
    }
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}/`, schliessen: () => new Promise((z) => server.close(z)) }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await starteServer({ port: Number(process.env.PORT ?? 8080), cache: 'no-cache' });
  console.log(`gym-log läuft auf ${url}`);
}
