#!/usr/bin/env node
import { getConnection, getMasterKeypair, DRY_RUN } from '../lib/config.mjs';
import { drainJob } from '../lib/job-manager.mjs';
import { log } from '../lib/logger.mjs';

const jobId = process.argv[2];
if (!jobId) {
  console.log('Usage: node cli/drain.mjs <jobId>');
  process.exit(1);
}

const conn = getConnection();
const master = getMasterKeypair();

if (!DRY_RUN && !master) {
  log.error('WALLET_PRIVATE_KEY required for live mode');
  process.exit(1);
}

log.info(`Draining job ${jobId}...`);

try {
  const result = await drainJob(conn, jobId, master);
  if (result.error) {
    log.error(result.error);
    process.exit(1);
  }
  console.log(`
  Drain complete:
    Drained: ${result.drained}/${result.total} wallets
  `);
} catch (err) {
  log.error(err.message);
  process.exit(1);
}
