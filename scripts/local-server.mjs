import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = 8000;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4'
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const relativePath = url.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const filePath = resolve(join(root, relativePath));
  if (!filePath.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Retro player running at http://localhost:${port}`));
