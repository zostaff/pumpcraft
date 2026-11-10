#!/usr/bin/env node
import { runBump } from '../modes/bump.mjs';
import { runMaker } from '../modes/maker.mjs';
import { stopJob, listJobs, printStats } from '../modes/common.mjs';

const args = process.argv.slice(2);
const mode = args[0];

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

if (!mode || !['bump', 'maker'].includes(mode)) {
  console.log(`
  pumpghost — stealth presence toolkit for pump.fun

  Usage:
    node cli/ghost.mjs bump   --mint <CA> [options]
    node cli/ghost.mjs maker  --mint <CA> [options]

  Bump options:
    --mint <CA>         Token contract address (required)
    --wallets <N>       Number of wallets (default: 4)
    --interval <sec>    Seconds between bumps (default: 60)
    --buy <SOL>         SOL per bump (default: 0.002)
    --duration <min>    Duration in minutes (default: 30)
    --dry-run           Simulate without transactions

  Maker options:
    --mint <CA>         Token contract address (required)
    --holders <N>       Target holder count (default: 100)
    --dust <amount>     Token dust per wallet (default: 1)
    --batch <N>         Wallets per batch (default: 10)
    --buy-first <SOL>   Buy tokens first (default: 0, skip)
    --dry-run           Simulate without transactions
  `);
  process.exit(0);
}

let activeJob = null;

process.on('SIGINT', () => {
  console.log('\n\nSIGINT — stopping...');
  if (activeJob) {
    activeJob.stopping = true;
  } else {
    process.exit(0);
  }
});

try {
  if (mode === 'bump') {
    const job = await runBump({
      mint: getArg('mint'),
      wallets: Number(getArg('wallets', 0)) || undefined,
      interval: Number(getArg('interval', 0)) || undefined,
      buy: Number(getArg('buy', 0)) || undefined,
      duration: Number(getArg('duration', 0)) || undefined,
      dryRun: hasFlag('dry-run') ? true : undefined,
    });
    activeJob = job;
  } else if (mode === 'maker') {
    const job = await runMaker({
      mint: getArg('mint'),
      holders: Number(getArg('holders', 0)) || undefined,
      dustAmount: getArg('dust'),
      batchSize: Number(getArg('batch', 0)) || undefined,
      buyFirst: Number(getArg('buy-first', 0)) || 0,
      dryRun: hasFlag('dry-run') ? true : undefined,
    });
    activeJob = job;
  }
} catch (err) {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
}
