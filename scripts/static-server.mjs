#!/usr/bin/env node
// Minimal static file server for the Playwright tests in tests/*.spec.mjs.
// No dependency on a bundler or dev-server package, consistent with the
// project's "no framework, no bundler" rule (see IMPLEMENTATION_PLAN.md 9) -
// the app itself needs none, and neither does serving it for a test.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 5173);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const abs = path.join(ROOT, p);
    if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(abs);
    if (s.isDirectory()) { res.writeHead(404); return res.end(); }
    const body = await readFile(abs);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});
server.listen(PORT, () => console.log(`static-server: http://127.0.0.1:${PORT}`));
