import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const JOBS_DIR = new URL('../data', import.meta.url).pathname;
if (!existsSync(JOBS_DIR)) mkdirSync(JOBS_DIR, { recursive: true });

const activeJobs = new Map();

export function createJob(type, opts) {
  const id = randomBytes(6).toString('hex');
  const job = {
    id, type, status: 'prepared', stopping: false,
    mint: opts.mint,
    wallets: opts.wallets || [],
    trades: [], stats: {},
    config: { ...opts },
    startedAt: new Date().toISOString(),
    error: null,
  };
  activeJobs.set(id, job);
  persistJob(job);
  return job;
}

export function persistJob(job) {
  try {
    writeFileSync(`${JOBS_DIR}/${job.id}.json`, JSON.stringify(job, null, 2));
  } catch {}
}

export function getJob(id) {
  if (activeJobs.has(id)) return activeJobs.get(id);
  const path = `${JOBS_DIR}/${id}.json`;
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch {}
  }
  return null;
}

export function listJobs() {
  const jobs = [];
  try {
    for (const file of readdirSync(JOBS_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        jobs.push(JSON.parse(readFileSync(`${JOBS_DIR}/${file}`, 'utf8')));
      } catch {}
    }
  } catch {}
  return jobs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export function stopJob(id) {
  const job = activeJobs.get(id);
  if (job) { job.stopping = true; return true; }
  return false;
}

export function printStats(job) {
  console.log('\n' + '━'.repeat(44));
  console.log(`  JOB ${job.id} (${job.type})`);
  console.log('━'.repeat(44));
  console.log(`  Status:    ${job.status}`);
  console.log(`  Mint:      ${job.mint}`);
  console.log(`  Duration:  ${((Date.now() - new Date(job.startedAt).getTime()) / 60000).toFixed(1)} min`);
  if (job.stats.bumps != null) console.log(`  Bumps:     ${job.stats.bumps}`);
  if (job.stats.holders != null) console.log(`  Holders:   ${job.stats.holders}`);
  if (job.stats.solSpent != null) console.log(`  SOL spent: ${job.stats.solSpent.toFixed(4)}`);
  if (job.error) console.log(`  Error:     ${job.error}`);
  console.log('━'.repeat(44) + '\n');
}
