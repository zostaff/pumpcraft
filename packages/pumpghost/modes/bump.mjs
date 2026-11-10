import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { RPC_URL, WALLET_PRIVATE_KEY, DRY_RUN, BUMP_INTERVAL_SEC, BUMP_BUY_SOL, BUMP_WALLETS, BUMP_DURATION_MIN } from '../lib/config.mjs';
import { generatePool, fundPool, drainPool, toKeypair } from '../lib/wallet-pool.mjs';
import { executeBuy } from '../lib/trade.mjs';
import { logBump, logInfo, logOk, logError } from '../lib/logger.mjs';
import { createJob, persistJob, printStats } from './common.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runBump(opts = {}) {
  const mint = opts.mint;
  if (!mint) throw new Error('--mint required');

  const numWallets = opts.wallets || BUMP_WALLETS;
  const intervalSec = opts.interval || BUMP_INTERVAL_SEC;
  const buySol = opts.buy || BUMP_BUY_SOL;
  const durationMin = opts.duration || BUMP_DURATION_MIN;
  const dryRun = opts.dryRun ?? DRY_RUN;

  const conn = new Connection(RPC_URL, 'confirmed');
  const masterKeypair = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

  logInfo(`BUMP MODE — ${mint.slice(0, 12)}...`);
  logInfo(`wallets: ${numWallets}, interval: ${intervalSec}s, buy: ${buySol} SOL, duration: ${durationMin}min, dry: ${dryRun}`);

  const pool = generatePool(numWallets);
  const totalCycles = Math.ceil((durationMin * 60) / intervalSec);
  const solPerWallet = buySol * Math.ceil(totalCycles / numWallets) * 1.5 + 0.005;

  const job = createJob('bump', { mint, wallets: pool, numWallets, intervalSec, buySol, durationMin, dryRun });
  job.stats = { bumps: 0, solSpent: 0, errors: 0 };

  if (!dryRun) {
    job.status = 'funding';
    persistJob(job);
    logInfo(`funding ${numWallets} wallets with ${solPerWallet.toFixed(4)} SOL each...`);
    await fundPool(conn, masterKeypair, pool, solPerWallet);
    await sleep(2000);
  }

  job.status = 'running';
  persistJob(job);
  const endTime = Date.now() + durationMin * 60_000;
  let walletIdx = 0;

  while (Date.now() < endTime && !job.stopping) {
    const w = pool[walletIdx % numWallets];
    walletIdx++;
    const solLamports = Math.round(buySol * 1e9);

    try {
      if (dryRun) {
        logBump(`[DRY] ${w.publicKey.slice(0, 8)}... buying ${buySol} SOL`);
        job.trades.push({ type: 'bump', wallet: w.publicKey, sol: buySol, status: 'dry-run', at: new Date().toISOString() });
      } else {
        const sig = await executeBuy(conn, w, mint, solLamports, 15);
        logBump(`${w.publicKey.slice(0, 8)}... bought ${buySol} SOL — ${sig.slice(0, 12)}...`);
        job.trades.push({ type: 'bump', wallet: w.publicKey, sol: buySol, status: 'sent', signature: sig, at: new Date().toISOString() });
      }
      job.stats.bumps++;
      job.stats.solSpent += buySol;
    } catch (err) {
      logError(`bump ${w.publicKey.slice(0, 8)}...: ${err.message}`);
      job.trades.push({ type: 'bump', wallet: w.publicKey, status: 'failed', error: err.message, at: new Date().toISOString() });
      job.stats.errors++;
    }

    persistJob(job);

    const jitter = (Math.random() - 0.5) * intervalSec * 0.3;
    const waitMs = (intervalSec + jitter) * 1000;
    logInfo(`next bump in ${(waitMs / 1000).toFixed(0)}s...`);
    await sleep(waitMs);
  }

  if (!dryRun) {
    job.status = 'draining';
    persistJob(job);
    logInfo('draining wallets...');
    await drainPool(conn, pool, masterKeypair);
  }

  job.status = job.stopping ? 'stopped' : 'completed';
  persistJob(job);
  printStats(job);
  return job;
}
