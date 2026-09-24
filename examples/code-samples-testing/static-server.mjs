import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

const [root, port] = process.argv.slice(2);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.md': 'text/markdown',
  '.woff2': 'font/woff2'
};

http
  .createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const status = fs.existsSync(file) ? 200 : 404;
    if (status === 404) file = path.join(root, '404.html');
    res.writeHead(status, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
