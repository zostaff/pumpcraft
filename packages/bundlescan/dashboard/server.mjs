#!/usr/bin/env node
// server.mjs — HTTP server for the bundlescan dashboard (localhost only).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../lib/config.mjs';
import { color, log } from '../lib/logger.mjs';
import { apiRecent, apiStats, apiWallet, apiTx, apiSimulate } from './api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

// JSON serializer that tolerates BigInt.
function toJSON(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function sendJSON(res, status, data) {
  const body = toJSON(data);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function sendFile(res, file) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === '/api/recent') {
      return sendJSON(res, 200, apiRecent(Number(url.searchParams.get('limit')) || 50));
    }
    if (p === '/api/stats') {
      return sendJSON(res, 200, apiStats(Number(url.searchParams.get('hours')) || 24));
    }
    if (p.startsWith('/api/wallet/')) {
      return sendJSON(res, 200, apiWallet(decodeURIComponent(p.slice('/api/wallet/'.length))));
    }
    if (p.startsWith('/api/simulate/')) {
      const sig = decodeURIComponent(p.slice('/api/simulate/'.length));
      const amount = url.searchParams.get('amount');
      return sendJSON(res, 200, await apiSimulate(sig, amount != null ? Number(amount) : undefined));
    }
    if (p.startsWith('/api/tx/')) {
      return sendJSON(res, 200, await apiTx(decodeURIComponent(p.slice('/api/tx/'.length))));
    }

    // Static files.
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(PUBLIC, 'index.html'));
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, safe);
    if (file.startsWith(PUBLIC) && fs.existsSync(file)) return sendFile(res, file);

    res.writeHead(404); res.end('not found');
  } catch (err) {
    log.error('request', p, String(err?.message || err));
    sendJSON(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error(`port ${config.dashboardPort} is already in use.`);
    log.error('Set a different port, e.g.:  DASHBOARD_PORT=3099 node dashboard/server.mjs');
    process.exit(1);
  }
  log.error(String(err?.message || err));
  process.exit(1);
});

server.listen(config.dashboardPort, '127.0.0.1', () => {
  log.info(color.bold('bundlescan dashboard'), color.cyan(`http://localhost:${config.dashboardPort}`));
  log.info(color.gray('Run the scanner in another terminal to populate live data.'));
});
