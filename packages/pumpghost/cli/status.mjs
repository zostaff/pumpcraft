#!/usr/bin/env node
import { listJobs, getJob, printStats } from '../modes/common.mjs';

const jobId = process.argv[2];

if (jobId) {
  const job = getJob(jobId);
  if (!job) { console.log(`Job ${jobId} not found`); process.exit(1); }
  printStats(job);
} else {
  const jobs = listJobs();
  if (jobs.length === 0) { console.log('No jobs found'); process.exit(0); }
  console.log(`\n${'ID'.padEnd(14)} ${'TYPE'.padEnd(8)} ${'STATUS'.padEnd(12)} ${'MINT'.padEnd(14)} STARTED`);
  console.log('─'.repeat(70));
  for (const j of jobs) {
    console.log(`${j.id.padEnd(14)} ${j.type.padEnd(8)} ${j.status.padEnd(12)} ${(j.mint || '').slice(0, 12).padEnd(14)} ${j.startedAt}`);
  }
  console.log();
}
