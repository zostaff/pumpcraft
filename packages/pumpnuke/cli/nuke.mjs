#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import {
  getConnection, getMasterKeypair, DRY_RUN,
  DEFAULT_STRATEGY, DEFAULT_WALLETS, DEFAULT_BUDGET,
  DEFAULT_DURATION_MIN, DEFAULT_BUY_BIAS, DEFAULT_SLIPPAGE_BPS,
} from '../lib/config.mjs';
import { prepareJob, confirmJob, setupShutdownHandler } from '../lib/job-manager.mjs';
import { getStrategies } from '../lib/volume-engine.mjs';
import { log, shortKey } from '../lib/logger.mjs';

const { values: args } = parseArgs({
  options: {
    mint: { type: 'string', short: 'm' },
    budget: { type: 'string', short: 'b' },
    wallets: { type: 'string', short: 'w' },
    strategy: { type: 'string', short: 's' },
    duration: { type: 'string', short: 'd' },
    bias: { type: 'string' },
    slippage: { type: 'string' },
    yes: { type: 'boolean', short: 'y' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (args.help) {
  console.log(`
  PUMPNUKE — Volume Bot for pump.fun

  Usage:
    node cli/nuke.mjs --mint <CA> [options]

  Options:
    -m, --mint <address>     Token contract address (required)
    -b, --budget <SOL>       Total SOL budget (default: ${DEFAULT_BUDGET})
    -w, --wallets <count>    Number of wallets (default: ${DEFAULT_WALLETS})
    -s, --strategy <name>    Strategy: basic, staggered (default: ${DEFAULT_STRATEGY})
    -d, --duration <min>     Duration in minutes (default: ${DEFAULT_DURATION_MIN})
    --bias <0-1>             Buy bias probability (default: ${DEFAULT_BUY_BIAS})
    --slippage <bps>         Slippage in basis points (default: ${DEFAULT_SLIPPAGE_BPS})
    -y, --yes                Skip confirmation
    -h, --help               Show this help

  Strategies:
${getStrategies().map(s => `    ${s.key.padEnd(12)} ${s.desc}`).join('\n')}

  Environment:
    DRY_RUN=true             Paper mode (no real transactions)
  `);
  process.exit(0);
}

const mint = args.mint;
if (!mint) {
  log.error('--mint <CA> is required');
  process.exit(1);
}

const budget = parseFloat(args.budget || String(DEFAULT_BUDGET));
const numWallets = parseInt(args.wallets || String(DEFAULT_WALLETS), 10);
const strategy = args.strategy || DEFAULT_STRATEGY;
const durationMin = parseInt(args.duration || String(DEFAULT_DURATION_MIN), 10);
const buyBias = parseFloat(args.bias || String(DEFAULT_BUY_BIAS));
const slippageBps = parseInt(args.slippage || String(DEFAULT_SLIPPAGE_BPS), 10);

const validStrategies = getStrategies().map(s => s.key);
if (!validStrategies.includes(strategy)) {
  log.error(`unknown strategy "${strategy}". Available: ${validStrategies.join(', ')}`);
  process.exit(1);
}

const conn = getConnection();
const master = getMasterKeypair();

console.log(`
╔══════════════════════════════════════════════╗
║             P U M P N U K E                  ║
╚══════════════════════════════════════════════╝

  Mode:       ${DRY_RUN ? '📄 PAPER (no real transactions)' : '🔴 LIVE'}
  Mint:       ${mint}
  Budget:     ${budget} SOL
  Wallets:    ${numWallets}
  Strategy:   ${strategy}
  Duration:   ${durationMin} min
  Buy Bias:   ${(buyBias * 100).toFixed(0)}%
  Slippage:   ${slippageBps} bps
  Master:     ${master ? shortKey(master.publicKey) : 'not set'}
`);

if (!DRY_RUN && !master) {
  log.error('WALLET_PRIVATE_KEY is required for live mode');
  process.exit(1);
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  if (!args.yes) {
    const answer = await prompt('  Proceed? (y/n) ');
    if (answer !== 'y' && answer !== 'yes') {
      console.log('  Aborted.');
      process.exit(0);
    }
  }

  console.log('');
  const job = prepareJob({
    mint,
    strategy,
    numWallets,
    budget,
    durationMin,
    buyBias,
    slippageBps,
  });

  log.job(`job ${job.id} prepared — ${numWallets} wallets generated`);

  if (master) setupShutdownHandler(conn, master);

  const result = confirmJob(conn, job.id, master);
  if (result.error) {
    log.error(result.error);
    process.exit(1);
  }

  log.job(`job ${job.id} started — Ctrl+C to stop gracefully`);

  // Keep process alive
  const check = setInterval(() => {
    if (['completed', 'failed', 'stopped', 'panic-stopped'].includes(job.status)) {
      clearInterval(check);
      console.log(`
  ════════════════════════════════════
  Job ${job.id} finished: ${job.status}
  Buys:    ${job.stats.buys}
  Sells:   ${job.stats.sells}
  Cycles:  ${job.stats.cycles}
  SOL:     ${job.stats.solSpent.toFixed(4)}
  ${job.error ? `Error:   ${job.error}` : ''}
  ════════════════════════════════════
`);
      process.exit(job.status === 'completed' ? 0 : 1);
    }
  }, 2000);
}

main().catch(err => {
  log.error(err.message);
  process.exit(1);
});
