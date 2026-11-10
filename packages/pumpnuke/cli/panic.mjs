#!/usr/bin/env node
import { getConnection, getMasterKeypair, DRY_RUN } from '../lib/config.mjs';
import { panicSell } from '../lib/job-manager.mjs';
import { log } from '../lib/logger.mjs';

const jobId = process.argv[2];
if (!jobId) {
  console.log('Usage: node cli/panic.mjs <jobId>');
  process.exit(1);
}

const conn = getConnection();
const master = getMasterKeypair();

if (!DRY_RUN && !master) {
  log.error('WALLET_PRIVATE_KEY required for live mode');
  process.exit(1);
}

log.warn(`PANIC SELL for job ${jobId}`);

try {
  const result = await panicSell(conn, jobId, master);
  if (result.error) {
    log.error(result.error);
    process.exit(1);
  }
  console.log(`
  Panic sell complete:
    Sold:    ${result.sold}/${result.total}
    Drained: ${result.drained}/${result.total}
  `);
} catch (err) {
  log.error(err.message);
  process.exit(1);
}
