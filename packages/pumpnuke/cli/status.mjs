#!/usr/bin/env node
import { listJobs, getJob } from '../lib/job-manager.mjs';

const jobId = process.argv[2];

if (jobId) {
  const job = getJob(jobId);
  if (!job) {
    console.log(`Job ${jobId} not found`);
    process.exit(1);
  }

  console.log(`
  Job: ${job.id}
  Status:    ${job.status}
  Mint:      ${job.mint}
  Strategy:  ${job.strategy}
  Budget:    ${job.budget} SOL
  Wallets:   ${job.numWallets}
  Duration:  ${job.durationMin} min
  Created:   ${job.createdAt}
  ${job.error ? `Error:     ${job.error}` : ''}

  Stats:
    Buys:    ${job.stats.buys}
    Sells:   ${job.stats.sells}
    Cycles:  ${job.stats.cycles}
    SOL:     ${job.stats.solSpent.toFixed(4)}

  Recent trades (last 10):
${(job.trades || []).slice(-10).map(t =>
  `    ${t.at?.slice(11, 19) || '??'} ${(t.type || '').padEnd(14)} ${(t.wallet || '').slice(0, 8)}.. ${t.sol ? t.sol.toFixed(4) + ' SOL' : ''} ${t.status}`
).join('\n')}
  `);
} else {
  const all = listJobs();
  if (all.length === 0) {
    console.log('No jobs found.');
    process.exit(0);
  }

  console.log(`
  PUMPNUKE Jobs
  ${'═'.repeat(70)}
  ${'ID'.padEnd(14)} ${'Status'.padEnd(14)} ${'Strategy'.padEnd(12)} ${'Budget'.padEnd(8)} ${'B/S'.padEnd(8)} Created
  ${'-'.repeat(70)}`);

  for (const j of all) {
    console.log(`  ${j.id.padEnd(14)} ${j.status.padEnd(14)} ${j.strategy.padEnd(12)} ${String(j.budget).padEnd(8)} ${j.stats.buys}/${j.stats.sells}${' '.repeat(Math.max(0, 5 - String(j.stats.buys).length - String(j.stats.sells).length))} ${j.createdAt?.slice(0, 16) || ''}`);
  }
  console.log('');
}
