#!/usr/bin/env node
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { RPC_URL, WALLET_PRIVATE_KEY } from '../lib/config.mjs';
import { drainPool } from '../lib/wallet-pool.mjs';
import { sellAll } from '../lib/trade.mjs';
import { getJob, listJobs, persistJob, printStats } from '../modes/common.mjs';
import { logInfo, logOk } from '../lib/logger.mjs';

const jobId = process.argv[2];
if (!jobId) {
  const jobs = listJobs().filter(j => j.wallets?.length > 0);
  if (jobs.length === 0) { console.log('No jobs with wallets found'); process.exit(0); }
  console.log('Usage: node cli/drain.mjs <jobId>\n\nAvailable jobs:');
  for (const j of jobs) console.log(`  ${j.id}  ${j.type}  ${j.status}  ${j.mint?.slice(0, 12) || '?'}`);
  process.exit(0);
}

const job = getJob(jobId);
if (!job) { console.log(`Job ${jobId} not found`); process.exit(1); }

const conn = new Connection(RPC_URL, 'confirmed');
const masterKeypair = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

logInfo(`draining job ${jobId} (${job.wallets.length} wallets)...`);

if (job.mint) {
  logInfo('selling tokens first...');
  await sellAll(conn, job.wallets, job.mint);
}

await drainPool(conn, job.wallets, masterKeypair);
job.status = 'drained';
persistJob(job);
logOk('drain complete');
printStats(job);
