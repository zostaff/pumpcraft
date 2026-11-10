#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConnection, getMasterKeypair, DASHBOARD_PORT, DRY_RUN } from '../lib/config.mjs';
import { prepareJob, confirmJob, stopJob, panicSell, getJob, listJobs } from '../lib/job-manager.mjs';
import { log } from '../lib/logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = getConnection();
const master = getMasterKeypair();

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // API routes
    if (path === '/api/jobs' && req.method === 'GET') {
      return jsonResponse(res, { jobs: listJobs(), dryRun: DRY_RUN });
    }

    if (path.match(/^\/api\/jobs\/[a-f0-9]+$/) && req.method === 'GET') {
      const id = path.split('/').pop();
      const job = getJob(id);
      if (!job) return jsonResponse(res, { error: 'not found' }, 404);

      return jsonResponse(res, {
        ...job,
        wallets: job.wallets.map(w => ({ publicKey: w.publicKey })),
        recentTrades: (job.trades || []).slice(-50),
      });
    }

    if (path === '/api/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.mint) return jsonResponse(res, { error: 'mint is required' }, 400);

      const job = prepareJob({
        mint: body.mint,
        strategy: body.strategy,
        numWallets: body.numWallets,
        budget: body.budget,
        durationMin: body.durationMin,
        buyBias: body.buyBias,
        slippageBps: body.slippageBps,
      });

      const result = confirmJob(conn, job.id, master);
      if (result.error) return jsonResponse(res, { error: result.error }, 400);

      return jsonResponse(res, { id: job.id, status: job.status }, 201);
    }

    if (path.match(/^\/api\/jobs\/[a-f0-9]+\/stop$/) && req.method === 'POST') {
      const id = path.split('/')[3];
      const result = stopJob(id);
      return jsonResponse(res, result);
    }

    if (path.match(/^\/api\/jobs\/[a-f0-9]+\/panic$/) && req.method === 'POST') {
      const id = path.split('/')[3];
      const result = await panicSell(conn, id, master);
      return jsonResponse(res, result);
    }

    // Static files
    if (path === '/' || path === '/index.html') {
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    log.error(`${req.method} ${path}: ${err.message}`);
    jsonResponse(res, { error: err.message }, 500);
  }
});

server.listen(DASHBOARD_PORT, () => {
  log.info(`dashboard running at http://localhost:${DASHBOARD_PORT}`);
  log.info(`mode: ${DRY_RUN ? 'PAPER' : 'LIVE'}`);
});
