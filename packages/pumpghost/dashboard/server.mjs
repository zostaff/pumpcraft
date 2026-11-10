import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullScan } from '../lib/scorer.mjs';
import { DASHBOARD_PORT } from '../lib/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const cache = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/scan') {
    const mint = url.searchParams.get('mint');
    if (!mint) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mint parameter required' }));
      return;
    }
    try {
      const result = await fullScan(mint);
      cache.set(mint, { result, ts: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/recent') {
    const recent = [...cache.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 20)
      .map(([mint, { result, ts }]) => ({
        mint,
        organicScore: result.organicScore,
        riskLevel: result.riskLevel,
        scannedAt: new Date(ts).toISOString(),
      }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(recent));
    return;
  }

  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const fullPath = path.join(PUBLIC, filePath);
  if (!fullPath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const data = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(DASHBOARD_PORT, () => {
  console.log(`pumpghost dashboard: http://localhost:${DASHBOARD_PORT}`);
});
