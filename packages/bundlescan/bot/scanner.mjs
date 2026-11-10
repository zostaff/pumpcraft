#!/usr/bin/env node
// scanner.mjs — real-time MEV scanner.
// Watches new blocks, detects sandwiches and arbitrage, prints and records them.
//
//   node bot/scanner.mjs [--min-profit 0.01] [--token <mint>]
import { config } from '../lib/config.mjs';
import { BlockListener } from '../lib/listener.mjs';
import { analyzeBlock } from '../lib/bundle-detector.mjs';
import { detectSandwiches } from '../lib/sandwich-detector.mjs';
import { detectArbs } from '../lib/arb-detector.mjs';
import { color, profit, loss, tip as tipColor, log, box } from '../lib/logger.mjs';
import { append } from '../lib/store.mjs';

function parseArgs(argv) {
  const a = { minProfit: config.scanMinProfit, token: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-profit') a.minProfit = Number(argv[++i]);
    else if (argv[i] === '--token') a.token = argv[++i];
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const short = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '?');

const session = {
  started: Date.now(),
  blocks: 0,
  sandwiches: 0,
  arbs: 0,
  totalProfit: 0,
  totalLoss: 0,
};

function printSandwich(s) {
  const lines = [
    `${color.bold('Attacker:')} ${short(s.attacker)}`,
    `${color.bold('Victim:  ')} ${short(s.victim)}`,
    `${color.bold('Token:   ')} ${short(s.mint)}`,
    `${color.bold('Slot:    ')} ${s.slot}  tx ${s.txIndexes.join('/')}`,
    `${color.bold('Profit:  ')} ${profit('+' + s.profitSol.toFixed(4) + ' SOL')}`,
    `${color.bold('Loss:    ')} ${loss('-' + s.lossSol.toFixed(4) + ' SOL')}`,
    `${color.bold('Tip:     ')} ${tipColor(s.tipSol.toFixed(4) + ' SOL')} ${s.tipService ? '(' + s.tipService + ')' : ''}`,
  ];
  console.log('\n' + box('SANDWICH DETECTED', lines, color.red));
}

function printArb(a) {
  const lines = [
    `${color.bold('Searcher:')} ${short(a.signer)}`,
    `${color.bold('Route:   ')} ${a.programs.join(' → ')}`,
    `${color.bold('Slot:    ')} ${a.slot}  tx ${a.txIndex}`,
    `${color.bold('Profit:  ')} ${profit('+' + a.profitSol.toFixed(4) + ' SOL')}`,
    `${color.bold('Tip:     ')} ${tipColor(((Number(a.tipLamports) || 0) / 1e9).toFixed(4) + ' SOL')}`,
  ];
  console.log('\n' + box('ARBITRAGE DETECTED', lines, color.cyan));
}

function onBlock({ slot, block }) {
  session.blocks++;
  const { decoded } = analyzeBlock(block, slot);

  let sandwiches = detectSandwiches(decoded, { minProfitSol: args.minProfit });
  let arbs = detectArbs(decoded, { minProfitSol: args.minProfit });

  if (args.token) {
    sandwiches = sandwiches.filter((s) => s.mint === args.token);
  }

  for (const s of sandwiches) {
    session.sandwiches++;
    session.totalProfit += s.profitSol;
    session.totalLoss += s.lossSol;
    printSandwich(s);
    append({ ...s, profitLamports: s.profitLamports, lostTokens: s.lostTokens, tipLamports: s.tipLamports });
  }
  for (const a of arbs) {
    session.arbs++;
    session.totalProfit += a.profitSol;
    printArb(a);
    append({ ...a });
  }
}

const listener = new BlockListener();
listener.on('block', onBlock);
listener.on('lag', ({ behind }) => {
  if (behind > 20) log.warn(`falling behind by ${behind} slots (RPC rate limit?)`);
});
listener.on('error', (err) => log.error(String(err?.message || err)));

log.info(
  color.bold('bundlescan scanner'),
  color.gray(`min-profit=${args.minProfit} SOL`),
  args.token ? color.gray(`token=${short(args.token)}`) : ''
);
log.info(color.gray(`RPC: ${config.rpcUrl.replace(/api-key=[^&]+/, 'api-key=…')}`));
listener.start();

function shutdown() {
  listener.stop();
  const mins = ((Date.now() - session.started) / 60000).toFixed(1);
  const lines = [
    `${color.bold('Duration:')}   ${mins} min`,
    `${color.bold('Blocks:  ')}   ${session.blocks}`,
    `${color.bold('Sandwiches:')} ${session.sandwiches}`,
    `${color.bold('Arbs:    ')}   ${session.arbs}`,
    `${color.bold('Extracted:')}  ${profit('+' + session.totalProfit.toFixed(4) + ' SOL')}`,
    `${color.bold('Victim loss:')} ${loss('-' + session.totalLoss.toFixed(4) + ' SOL')}`,
  ];
  console.log('\n' + box('SESSION STATS', lines, color.magenta));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
