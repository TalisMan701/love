// Local browser QA: /slow/ delays music by 5s; /stalled/ by 12s.
// This helper and its routes are not included in the published dist directory.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const mode = pathname.startsWith('/stalled/') ? 'stalled' : 'slow';
  const relative = pathname.replace(/^\/(slow|stalled)\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(file);
    if (file.endsWith('.mp3')) await new Promise((resolve) => setTimeout(resolve, mode === 'stalled' ? 12000 : 5000));
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
}).listen(4174, '127.0.0.1', () => console.log('Loading QA: http://127.0.0.1:4174/slow/'));
