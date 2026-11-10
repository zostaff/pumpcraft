import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { generateWallets, sellAll, drainWallets } from './wallet-pool.mjs';
import { runVolume } from './volume-engine.mjs';
import { log, shortKey } from './logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = join(__dirname, '..', 'data', 'jobs');

try { mkdirSync(JOBS_DIR, { recursive: true }); } catch {}

const jobs = new Map();

function persistJob(job) {
  try {
    const data = {
      id: job.id,
      mint: job.mint,
      strategy: job.strategy,
      status: job.status,
      wallets: job.wallets.map(w => ({ publicKey: w.publicKey, secretKey: w.secretKey })),
      budget: job.budget,
      numWallets: job.numWallets,
      durationMin: job.durationMin,
      buyBias: job.buyBias,
      slippageBps: job.slippageBps,
      trades: job.trades,
      stats: job.stats,
      error: job.error,
      createdAt: job.createdAt,
    };
    writeFileSync(join(JOBS_DIR, `${job.id}.json`), JSON.stringify(data, null, 2));
  } catch (err) {
    log.error(`persist job ${job.id}: ${err.message}`);
  }
}

function loadPersistedJobs() {
  try {
    if (!existsSync(JOBS_DIR)) return;
    for (const f of readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf8'));
        if (!jobs.has(data.id)) {
          data.stopping = false;
          data.trades = data.trades || [];
          data.stats = data.stats || { buys: 0, sells: 0, cycles: 0, solSpent: 0 };
          jobs.set(data.id, data);
        }
      } catch {}
    }
    if (jobs.size > 0) log.info(`loaded ${jobs.size} persisted jobs`);
  } catch {}
}
loadPersistedJobs();

export function prepareJob(opts) {
  const id = randomBytes(6).toString('hex');
  const numWallets = opts.numWallets || 8;
  const wallets = generateWallets(numWallets);

  const job = {
    id,
    mint: opts.mint,
    strategy: opts.strategy || 'staggered',
    status: 'prepared',
    stopping: false,
    wallets,
    budget: opts.budget || 0.5,
    numWallets,
    durationMin: opts.durationMin || 15,
    buyBias: opts.buyBias || 0.6,
    slippageBps: opts.slippageBps || 1000,
    trades: [],
    stats: { buys: 0, sells: 0, cycles: 0, solSpent: 0 },
    error: null,
    createdAt: new Date().toISOString(),
  };

  jobs.set(id, job);
  persistJob(job);
  log.job(`prepared ${id} — ${numWallets} wallets, ${job.budget} SOL, ${job.strategy}`);
  return job;
}

export function confirmJob(conn, id, masterKeypair) {
  const job = jobs.get(id);
  if (!job) return { error: 'job not found' };
  if (job.status !== 'prepared') return { error: `job status is ${job.status}, expected prepared` };

  for (const [jid, j] of jobs) {
    if (jid !== id && ['running', 'funding', 'buying'].includes(j.status)) {
      return { error: `active job already running: ${jid}` };
    }
  }

  const engineOpts = {
    masterKeypair,
    mint: job.mint,
    strategy: job.strategy,
    durationMin: job.durationMin,
    buyBias: job.buyBias,
    slippageBps: job.slippageBps,
  };

  runVolume(conn, engineOpts, job)
    .then(() => persistJob(job))
    .catch(err => {
      log.error(`job ${id} fatal: ${err.message}`);
      job.status = 'failed';
      job.error = err.message;
      persistJob(job);
    });

  // Set up periodic persistence
  const persistInterval = setInterval(() => {
    if (['completed', 'failed', 'stopped'].includes(job.status)) {
      clearInterval(persistInterval);
      persistJob(job);
      return;
    }
    persistJob(job);
  }, 10_000);

  return job;
}

export function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return { error: 'job not found' };
  job.stopping = true;
  log.job(`stopping ${id}`);
  return { id, status: 'stopping' };
}

export async function panicSell(conn, id, masterKeypair) {
  const job = jobs.get(id);
  if (!job) return { error: 'job not found' };
  if (!job.mint) return { error: 'no mint address' };

  if (['running', 'funding', 'buying'].includes(job.status)) {
    job.stopping = true;
  }

  log.warn(`PANIC SELL ${id}`);
  const sellResults = await sellAll(conn, job.wallets, job.mint);
  const drainResults = await drainWallets(conn, job.wallets, masterKeypair);

  job.trades.push(
    ...sellResults.map(r => ({ type: 'panic-sell', wallet: r.wallet, status: r.status, at: new Date().toISOString() })),
    ...drainResults.map(r => ({ type: 'panic-drain', wallet: r.wallet, sol: r.sol, status: r.status, at: new Date().toISOString() })),
  );

  job.status = 'panic-stopped';
  persistJob(job);

  return {
    sold: sellResults.filter(r => r.status === 'sold').length,
    drained: drainResults.filter(r => r.status === 'sent' || r.status === 'confirmed').length,
    total: job.wallets.length,
  };
}

export async function drainJob(conn, id, masterKeypair) {
  const job = jobs.get(id);
  if (!job) return { error: 'job not found' };

  if (['running', 'funding', 'buying'].includes(job.status)) {
    job.stopping = true;
  }

  log.drain(`draining ${id}`);
  const results = await drainWallets(conn, job.wallets, masterKeypair);

  job.trades.push(...results.map(r => ({
    type: 'drain', wallet: r.wallet, sol: r.sol, status: r.status, at: new Date().toISOString(),
  })));

  persistJob(job);
  return {
    drained: results.filter(r => r.status === 'sent' || r.status === 'confirmed').length,
    total: job.wallets.length,
    results,
  };
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].map(j => ({
    id: j.id,
    mint: j.mint,
    strategy: j.strategy,
    status: j.status,
    numWallets: j.numWallets,
    budget: j.budget,
    stats: j.stats,
    createdAt: j.createdAt,
    error: j.error,
  }));
}

// SIGINT handler: graceful shutdown
let shutdownCalled = false;
export function setupShutdownHandler(conn, masterKeypair) {
  process.on('SIGINT', async () => {
    if (shutdownCalled) {
      log.warn('force exit');
      process.exit(1);
    }
    shutdownCalled = true;
    log.warn('SIGINT received — stopping all jobs, selling tokens, draining...');

    const activeJobs = [...jobs.values()].filter(j =>
      ['running', 'funding', 'buying'].includes(j.status)
    );

    for (const job of activeJobs) {
      job.stopping = true;
    }

    // Give running loops time to see the stopping flag
    await new Promise(r => setTimeout(r, 3000));

    for (const job of activeJobs) {
      try {
        if (job.mint) {
          await sellAll(conn, job.wallets, job.mint).catch(() => {});
        }
        await drainWallets(conn, job.wallets, masterKeypair).catch(() => {});
        job.status = 'stopped';
        persistJob(job);
      } catch {}
    }

    // Session stats
    let totalBuys = 0, totalSells = 0, totalSpent = 0;
    for (const job of activeJobs) {
      totalBuys += job.stats.buys;
      totalSells += job.stats.sells;
      totalSpent += job.stats.solSpent;
    }
    log.info(`session stats: ${totalBuys} buys, ${totalSells} sells, ${totalSpent.toFixed(4)} SOL spent`);
    process.exit(0);
  });
}
