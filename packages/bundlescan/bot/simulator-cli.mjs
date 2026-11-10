#!/usr/bin/env node
// simulator-cli.mjs — analytical "what-if" sandwich simulation for one tx.
// READ-ONLY: estimates victim loss / extractable profit and the slippage that
// would have rejected the attack. Builds and submits nothing.
//
//   node bot/simulator-cli.mjs <tx_signature> [--amount 0.5]
import { config } from '../lib/config.mjs';
import { analyzeSignature } from '../lib/simulator.mjs';
import { color, profit, loss, log, box } from '../lib/logger.mjs';

function parseArgs(argv) {
  const a = { sig: null, amount: config.simDefaultAmount };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--amount') a.amount = Number(argv[++i]);
    else if (!a.sig) a.sig = argv[i];
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.sig) {
  console.error('usage: node bot/simulator-cli.mjs <tx_signature> [--amount 0.5]');
  process.exit(1);
}

const short = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '?');

const res = await analyzeSignature(args.sig, { amount: args.amount });
if (!res.ok) {
  log.error('cannot simulate:', res.reason);
  process.exit(1);
}

const o = res.optimal;
const lines = [
  `${color.bold('Tx:      ')} ${short(res.signature)}`,
  `${color.bold('Victim:  ')} ${short(res.victim)}`,
  `${color.bold('Token:   ')} ${short(res.mint)}`,
  `${color.bold('Victim in:')} ${res.victimSolIn.toFixed(4)} SOL`,
  '',
  color.bold('— Optimal sandwich (analytical) —'),
  `${color.bold('Front-run size:')} ${(Number(o.frontSol) / 1e9).toFixed(3)} SOL`,
  `${color.bold('Attacker profit:')} ${profit('+' + o.attackerProfitSol.toFixed(4) + ' SOL')}`,
  `${color.bold('Victim loss:   ')} ${loss('-' + o.victimLossSol.toFixed(4) + ' SOL')}`,
  `${color.bold('Slippage to reject:')} ${(o.slippageNeededToReject * 100).toFixed(2)}%`,
];

if (res.atRequested) {
  const r = res.atRequested;
  lines.push(
    '',
    color.bold(`— At requested ${args.amount} SOL —`),
    `${color.bold('Attacker profit:')} ${profit('+' + r.attackerProfitSol.toFixed(4) + ' SOL')}`,
    `${color.bold('Victim loss:   ')} ${loss('-' + r.victimLossSol.toFixed(4) + ' SOL')}`
  );
}

console.log(box('SANDWICH SIMULATION', lines, color.cyan));
console.log(
  color.gray(
    '\nNote: analysis only. To protect yourself, set slippage below the ' +
      '"slippage to reject" value above.'
  )
);
